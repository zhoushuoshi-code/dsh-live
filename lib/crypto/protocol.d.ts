/** Wire protocol version. */
export declare const E2EE_PROTOCOL_VERSION: 1;
/** Default QR invitation lifetime. */
export declare const DEFAULT_PAIRING_TTL_MS: number;
/** Stable protocol failure codes suitable for UI mapping. */
export type E2eeErrorCode = 'invalid-invitation' | 'invitation-expired' | 'invitation-used' | 'invalid-message' | 'authentication-failed' | 'unexpected-direction' | 'unexpected-sequence' | 'pairing-mismatch' | 'pairing-complete' | 'sequence-exhausted';
/** A safe, non-secret protocol error. */
export declare class E2eeProtocolError extends Error {
    readonly code: E2eeErrorCode;
    constructor(code: E2eeErrorCode);
}
/** Secret invitation carried only after `#` in the QR URL. */
export interface PairingInvitation {
    version: typeof E2EE_PROTOCOL_VERSION;
    relayUrl: string;
    roomId: string;
    secret: string;
    hostPublicKey: string;
    expiresAt: number;
}
/** Relay-visible first message. Its payload, including the mobile public key, is encrypted. */
export interface PairingHello {
    version: typeof E2EE_PROTOCOL_VERSION;
    type: 'pairing-hello';
    roomId: string;
    nonce: string;
    ciphertext: string;
}
/** Direction of one encrypted session message. */
export type CipherDirection = 'host-to-mobile' | 'mobile-to-host';
/** Relay-visible application envelope. */
export interface CipherEnvelope {
    version: typeof E2EE_PROTOCOL_VERSION;
    type: 'ciphertext';
    roomId: string;
    direction: CipherDirection;
    sequence: string;
    ciphertext: string;
}
interface DirectionSecrets {
    key: CryptoKey;
    noncePrefix: Uint8Array<ArrayBuffer>;
}
interface SessionSecrets {
    hostToMobile: DirectionSecrets;
    mobileToHost: DirectionSecrets;
}
interface MobilePairingState {
    invitation: PairingInvitation;
    challenge: string;
    channel: SecureChannel;
}
/** Result of an accepted phone pairing. */
export interface AcceptedPairing {
    acknowledgement: CipherEnvelope;
    channel: SecureChannel;
    connectionId: string;
}
/** Ordered, authenticated, bidirectional encrypted session. */
export declare class SecureChannel {
    #private;
    readonly roomId: string;
    constructor(roomId: string, role: 'host' | 'mobile', secrets: SessionSecrets);
    /** Encrypt one JSON-compatible payload. */
    seal(payload: unknown): Promise<CipherEnvelope>;
    /** Decrypt exactly the next message from the opposite direction. */
    open(candidate: unknown): Promise<unknown>;
}
/** Host-owned one-time QR pairing state. */
export declare class HostPairing {
    #private;
    readonly invitation: PairingInvitation;
    readonly pairingUrl: string;
    private readonly privateKey;
    constructor(invitation: PairingInvitation, pairingUrl: string, privateKey: CryptoKey);
    /** Accept one authenticated phone hello and consume the invitation. */
    accept(hello: unknown, now?: number): Promise<AcceptedPairing>;
}
/** Mobile-owned ephemeral pairing state. */
export declare class MobilePairing {
    #private;
    readonly hello: PairingHello;
    private readonly state;
    constructor(hello: PairingHello, state: MobilePairingState);
    /** Authenticate the Host acknowledgement and return the established channel. */
    complete(acknowledgement: unknown): Promise<{
        channel: SecureChannel;
        connectionId: string;
    }>;
}
/** Create a one-time Host invitation whose secret is placed only in the URL fragment. */
export declare function createHostPairing(options: {
    mobileAppUrl: string;
    relayUrl: string;
    now?: number;
    ttlMs?: number;
}): Promise<HostPairing>;
/** Parse and validate a QR pairing URL on the phone. */
export declare function parsePairingUrl(pairingUrl: string, now?: number): PairingInvitation;
/** Create the encrypted phone hello and an ephemeral completion state. */
export declare function createMobilePairing(invitation: PairingInvitation, now?: number): Promise<MobilePairing>;
export {};
//# sourceMappingURL=protocol.d.ts.map