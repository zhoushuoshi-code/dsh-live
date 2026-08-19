import { decodeBase64Url, decodeUtf8, encodeBase64Url, encodeUtf8, } from './base64url.js';
/** Wire protocol version. */
export const E2EE_PROTOCOL_VERSION = 1;
/** Default QR invitation lifetime. */
export const DEFAULT_PAIRING_TTL_MS = 5 * 60 * 1000;
const MAX_PAIRING_TTL_MS = 10 * 60 * 1000;
const AES_KEY_BYTES = 32;
const NONCE_PREFIX_BYTES = 4;
const SESSION_MATERIAL_BYTES = AES_KEY_BYTES * 2 + NONCE_PREFIX_BYTES * 2;
const MAX_SEQUENCE = (1n << 64n) - 1n;
/** A safe, non-secret protocol error. */
export class E2eeProtocolError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'E2eeProtocolError';
    }
}
/** Cryptographically secure random bytes. */
function randomBytes(length) {
    return globalThis.crypto.getRandomValues(new Uint8Array(length));
}
function fail(code) {
    throw new E2eeProtocolError(code);
}
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isPairRequest(value) {
    return isRecord(value)
        && value['version'] === E2EE_PROTOCOL_VERSION
        && value['kind'] === 'pair-request'
        && typeof value['mobilePublicKey'] === 'string'
        && typeof value['challenge'] === 'string'
        && typeof value['issuedAt'] === 'number';
}
function isPairAccepted(value) {
    return isRecord(value)
        && value['version'] === E2EE_PROTOCOL_VERSION
        && value['kind'] === 'pair-accepted'
        && typeof value['challenge'] === 'string'
        && typeof value['connectionId'] === 'string';
}
function isPairingHello(value) {
    return isRecord(value)
        && value['version'] === E2EE_PROTOCOL_VERSION
        && value['type'] === 'pairing-hello'
        && typeof value['roomId'] === 'string'
        && typeof value['nonce'] === 'string'
        && typeof value['ciphertext'] === 'string';
}
function isCipherEnvelope(value) {
    return isRecord(value)
        && value['version'] === E2EE_PROTOCOL_VERSION
        && value['type'] === 'ciphertext'
        && typeof value['roomId'] === 'string'
        && (value['direction'] === 'host-to-mobile' || value['direction'] === 'mobile-to-host')
        && typeof value['sequence'] === 'string'
        && typeof value['ciphertext'] === 'string';
}
function validateRelayUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        return fail('invalid-invitation');
    }
    if (url.protocol !== 'wss:' || url.username !== '' || url.password !== '' || url.hash !== '') {
        return fail('invalid-invitation');
    }
    return url.href;
}
function validateInvitation(value, now) {
    if (!isRecord(value)
        || value['version'] !== E2EE_PROTOCOL_VERSION
        || typeof value['relayUrl'] !== 'string'
        || typeof value['roomId'] !== 'string'
        || typeof value['secret'] !== 'string'
        || typeof value['hostPublicKey'] !== 'string'
        || typeof value['expiresAt'] !== 'number'
        || !Number.isSafeInteger(value['expiresAt'])) {
        return fail('invalid-invitation');
    }
    try {
        decodeBase64Url(value['roomId'], 16);
        decodeBase64Url(value['secret'], 32);
        decodeBase64Url(value['hostPublicKey'], 65);
    }
    catch {
        return fail('invalid-invitation');
    }
    if (value['expiresAt'] <= now)
        return fail('invitation-expired');
    if (value['expiresAt'] - now > MAX_PAIRING_TTL_MS)
        return fail('invalid-invitation');
    return {
        version: E2EE_PROTOCOL_VERSION,
        relayUrl: validateRelayUrl(value['relayUrl']),
        roomId: value['roomId'],
        secret: value['secret'],
        hostPublicKey: value['hostPublicKey'],
        expiresAt: value['expiresAt'],
    };
}
async function generateEcdhKeyPair() {
    return globalThis.crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
}
async function exportPublicKey(key) {
    return encodeBase64Url(new Uint8Array(await globalThis.crypto.subtle.exportKey('raw', key)));
}
async function importPublicKey(value) {
    let bytes;
    try {
        bytes = decodeBase64Url(value, 65);
    }
    catch {
        return fail('invalid-message');
    }
    try {
        return await globalThis.crypto.subtle.importKey('raw', bytes, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    }
    catch {
        return fail('invalid-message');
    }
}
async function pairingHelloKey(invitation) {
    const secret = await globalThis.crypto.subtle.importKey('raw', decodeBase64Url(invitation.secret, 32), 'HKDF', false, ['deriveKey']);
    return globalThis.crypto.subtle.deriveKey({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: decodeBase64Url(invitation.roomId, 16),
        info: encodeUtf8('dsh-live/v1/pairing-hello'),
    }, secret, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
function pairingHelloAad(roomId) {
    return encodeUtf8(`dsh-live|1|pairing-hello|${roomId}`);
}
async function encryptPairingHello(invitation, payload) {
    const nonce = randomBytes(12);
    const ciphertext = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: pairingHelloAad(invitation.roomId), tagLength: 128 }, await pairingHelloKey(invitation), encodeUtf8(JSON.stringify(payload)));
    return {
        version: E2EE_PROTOCOL_VERSION,
        type: 'pairing-hello',
        roomId: invitation.roomId,
        nonce: encodeBase64Url(nonce),
        ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
    };
}
async function decryptPairingHello(invitation, candidate) {
    if (!isPairingHello(candidate))
        return fail('invalid-message');
    const hello = candidate;
    if (hello.version !== E2EE_PROTOCOL_VERSION
        || hello.type !== 'pairing-hello'
        || hello.roomId !== invitation.roomId) {
        return fail('invalid-message');
    }
    let plaintext;
    try {
        plaintext = await globalThis.crypto.subtle.decrypt({
            name: 'AES-GCM',
            iv: decodeBase64Url(hello.nonce, 12),
            additionalData: pairingHelloAad(invitation.roomId),
            tagLength: 128,
        }, await pairingHelloKey(invitation), decodeBase64Url(hello.ciphertext));
    }
    catch {
        return fail('authentication-failed');
    }
    let payload;
    try {
        payload = JSON.parse(decodeUtf8(plaintext));
    }
    catch {
        return fail('invalid-message');
    }
    if (!isPairRequest(payload))
        return fail('invalid-message');
    return payload;
}
async function deriveSessionSecrets(invitation, privateKey, peerPublicKey, mobilePublicKey) {
    const shared = new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: 'ECDH', public: peerPublicKey }, privateKey, 256));
    const keyMaterial = await globalThis.crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
    const transcript = encodeUtf8([
        'dsh-live/v1/session',
        invitation.roomId,
        invitation.hostPublicKey,
        mobilePublicKey,
    ].join('|'));
    const bits = new Uint8Array(await globalThis.crypto.subtle.deriveBits({
        name: 'HKDF',
        hash: 'SHA-256',
        salt: decodeBase64Url(invitation.secret, 32),
        info: transcript,
    }, keyMaterial, SESSION_MATERIAL_BYTES * 8));
    shared.fill(0);
    const mobileToHostKey = await globalThis.crypto.subtle.importKey('raw', bits.subarray(0, AES_KEY_BYTES), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const hostToMobileKey = await globalThis.crypto.subtle.importKey('raw', bits.subarray(AES_KEY_BYTES, AES_KEY_BYTES * 2), 'AES-GCM', false, ['encrypt', 'decrypt']);
    const secrets = {
        mobileToHost: {
            key: mobileToHostKey,
            noncePrefix: bits.slice(AES_KEY_BYTES * 2, AES_KEY_BYTES * 2 + NONCE_PREFIX_BYTES),
        },
        hostToMobile: {
            key: hostToMobileKey,
            noncePrefix: bits.slice(AES_KEY_BYTES * 2 + NONCE_PREFIX_BYTES),
        },
    };
    bits.fill(0);
    return secrets;
}
function nonceFor(prefix, sequence) {
    const nonce = new Uint8Array(12);
    nonce.set(prefix, 0);
    new DataView(nonce.buffer).setBigUint64(4, sequence, false);
    return nonce;
}
function aadFor(roomId, direction, sequence) {
    return encodeUtf8(`dsh-live|1|ciphertext|${roomId}|${direction}|${sequence}`);
}
/** Ordered, authenticated, bidirectional encrypted session. */
export class SecureChannel {
    roomId;
    #send;
    #receive;
    #sendDirection;
    #receiveDirection;
    #sendSequence = 0n;
    #receiveSequence = 0n;
    #sendTail = Promise.resolve();
    #receiveTail = Promise.resolve();
    constructor(roomId, role, secrets) {
        this.roomId = roomId;
        this.#send = role === 'host' ? secrets.hostToMobile : secrets.mobileToHost;
        this.#receive = role === 'host' ? secrets.mobileToHost : secrets.hostToMobile;
        this.#sendDirection = role === 'host' ? 'host-to-mobile' : 'mobile-to-host';
        this.#receiveDirection = role === 'host' ? 'mobile-to-host' : 'host-to-mobile';
    }
    /** Encrypt one JSON-compatible payload. */
    async seal(payload) {
        const previous = this.#sendTail;
        let release;
        this.#sendTail = new Promise(resolve => { release = resolve; });
        await previous;
        try {
            return await this.#sealNext(payload);
        }
        finally {
            release();
        }
    }
    async #sealNext(payload) {
        if (this.#sendSequence > MAX_SEQUENCE)
            return fail('sequence-exhausted');
        let serialized;
        try {
            const value = JSON.stringify(payload);
            if (value === undefined)
                return fail('invalid-message');
            serialized = value;
        }
        catch {
            return fail('invalid-message');
        }
        const sequence = this.#sendSequence.toString(10);
        const ciphertext = await globalThis.crypto.subtle.encrypt({
            name: 'AES-GCM',
            iv: nonceFor(this.#send.noncePrefix, this.#sendSequence),
            additionalData: aadFor(this.roomId, this.#sendDirection, sequence),
            tagLength: 128,
        }, this.#send.key, encodeUtf8(serialized));
        this.#sendSequence += 1n;
        return {
            version: E2EE_PROTOCOL_VERSION,
            type: 'ciphertext',
            roomId: this.roomId,
            direction: this.#sendDirection,
            sequence,
            ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
        };
    }
    /** Decrypt exactly the next message from the opposite direction. */
    async open(candidate) {
        const previous = this.#receiveTail;
        let release;
        this.#receiveTail = new Promise(resolve => { release = resolve; });
        await previous;
        try {
            return await this.#openNext(candidate);
        }
        finally {
            release();
        }
    }
    async #openNext(candidate) {
        if (!isCipherEnvelope(candidate))
            return fail('invalid-message');
        const envelope = candidate;
        if (envelope.version !== E2EE_PROTOCOL_VERSION
            || envelope.type !== 'ciphertext'
            || envelope.roomId !== this.roomId)
            return fail('invalid-message');
        if (envelope.direction !== this.#receiveDirection)
            return fail('unexpected-direction');
        if (!/^(0|[1-9][0-9]*)$/u.test(envelope.sequence))
            return fail('invalid-message');
        const sequence = BigInt(envelope.sequence);
        if (sequence > MAX_SEQUENCE)
            return fail('sequence-exhausted');
        if (sequence !== this.#receiveSequence)
            return fail('unexpected-sequence');
        let plaintext;
        try {
            plaintext = await globalThis.crypto.subtle.decrypt({
                name: 'AES-GCM',
                iv: nonceFor(this.#receive.noncePrefix, sequence),
                additionalData: aadFor(this.roomId, envelope.direction, envelope.sequence),
                tagLength: 128,
            }, this.#receive.key, decodeBase64Url(envelope.ciphertext));
        }
        catch {
            return fail('authentication-failed');
        }
        let payload;
        try {
            payload = JSON.parse(decodeUtf8(plaintext));
        }
        catch {
            return fail('invalid-message');
        }
        this.#receiveSequence += 1n;
        return payload;
    }
}
/** Host-owned one-time QR pairing state. */
export class HostPairing {
    invitation;
    pairingUrl;
    privateKey;
    #used = false;
    #accepting = false;
    constructor(invitation, pairingUrl, privateKey) {
        this.invitation = invitation;
        this.pairingUrl = pairingUrl;
        this.privateKey = privateKey;
    }
    /** Accept one authenticated phone hello and consume the invitation. */
    async accept(hello, now = Date.now()) {
        if (this.#used || this.#accepting)
            return fail('invitation-used');
        this.#accepting = true;
        try {
            if (now >= this.invitation.expiresAt)
                return fail('invitation-expired');
            const request = await decryptPairingHello(this.invitation, hello);
            if (request.issuedAt > now + 30_000 || request.issuedAt < now - MAX_PAIRING_TTL_MS) {
                return fail('invalid-message');
            }
            const channel = new SecureChannel(this.invitation.roomId, 'host', await deriveSessionSecrets(this.invitation, this.privateKey, await importPublicKey(request.mobilePublicKey), request.mobilePublicKey));
            const connectionId = encodeBase64Url(randomBytes(16));
            const acknowledgement = await channel.seal({
                version: E2EE_PROTOCOL_VERSION,
                kind: 'pair-accepted',
                challenge: request.challenge,
                connectionId,
            });
            this.#used = true;
            return { acknowledgement, channel, connectionId };
        }
        finally {
            this.#accepting = false;
        }
    }
}
/** Mobile-owned ephemeral pairing state. */
export class MobilePairing {
    hello;
    state;
    #complete = false;
    #completing = false;
    constructor(hello, state) {
        this.hello = hello;
        this.state = state;
    }
    /** Authenticate the Host acknowledgement and return the established channel. */
    async complete(acknowledgement) {
        if (this.#complete || this.#completing)
            return fail('pairing-complete');
        this.#completing = true;
        try {
            const payload = await this.state.channel.open(acknowledgement);
            if (!isPairAccepted(payload) || payload.challenge !== this.state.challenge) {
                return fail('pairing-mismatch');
            }
            this.#complete = true;
            return { channel: this.state.channel, connectionId: payload.connectionId };
        }
        finally {
            this.#completing = false;
        }
    }
}
/** Create a one-time Host invitation whose secret is placed only in the URL fragment. */
export async function createHostPairing(options) {
    const now = options.now ?? Date.now();
    const ttlMs = options.ttlMs ?? DEFAULT_PAIRING_TTL_MS;
    if (!Number.isSafeInteger(now) || !Number.isSafeInteger(ttlMs)
        || ttlMs <= 0 || ttlMs > MAX_PAIRING_TTL_MS)
        return fail('invalid-invitation');
    let mobileUrl;
    try {
        mobileUrl = new URL(options.mobileAppUrl);
    }
    catch {
        return fail('invalid-invitation');
    }
    if (mobileUrl.protocol !== 'https:' || mobileUrl.username !== '' || mobileUrl.password !== '') {
        return fail('invalid-invitation');
    }
    const keys = await generateEcdhKeyPair();
    const invitation = {
        version: E2EE_PROTOCOL_VERSION,
        relayUrl: validateRelayUrl(options.relayUrl),
        roomId: encodeBase64Url(randomBytes(16)),
        secret: encodeBase64Url(randomBytes(32)),
        hostPublicKey: await exportPublicKey(keys.publicKey),
        expiresAt: now + ttlMs,
    };
    mobileUrl.hash = new URLSearchParams({
        pair: encodeBase64Url(encodeUtf8(JSON.stringify(invitation))),
    }).toString();
    return new HostPairing(invitation, mobileUrl.href, keys.privateKey);
}
/** Parse and validate a QR pairing URL on the phone. */
export function parsePairingUrl(pairingUrl, now = Date.now()) {
    let url;
    try {
        url = new URL(pairingUrl);
    }
    catch {
        return fail('invalid-invitation');
    }
    if (url.protocol !== 'https:')
        return fail('invalid-invitation');
    const encoded = new URLSearchParams(url.hash.slice(1)).get('pair');
    if (encoded === null)
        return fail('invalid-invitation');
    let value;
    try {
        value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(decodeBase64Url(encoded)));
    }
    catch {
        return fail('invalid-invitation');
    }
    return validateInvitation(value, now);
}
/** Create the encrypted phone hello and an ephemeral completion state. */
export async function createMobilePairing(invitation, now = Date.now()) {
    const validated = validateInvitation(invitation, now);
    const keys = await generateEcdhKeyPair();
    const mobilePublicKey = await exportPublicKey(keys.publicKey);
    const challenge = encodeBase64Url(randomBytes(16));
    const hello = await encryptPairingHello(validated, {
        version: E2EE_PROTOCOL_VERSION,
        kind: 'pair-request',
        mobilePublicKey,
        challenge,
        issuedAt: now,
    });
    const channel = new SecureChannel(validated.roomId, 'mobile', await deriveSessionSecrets(validated, keys.privateKey, await importPublicKey(validated.hostPublicKey), mobilePublicKey));
    return new MobilePairing(hello, { invitation: validated, challenge, channel });
}
//# sourceMappingURL=protocol.js.map