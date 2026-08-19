import { renderPairingQrSvg } from '../crypto/qr.js';
import { HostRelaySession } from '../transport/host-session.js';
/** Owns the single active phone invitation for one DSH Host process. */
export class HostPairingController {
    bridge;
    config;
    sessionOptions;
    #session;
    #creating;
    constructor(bridge, config, sessionOptions = {}) {
        this.bridge = bridge;
        this.config = config;
        this.sessionOptions = sessionOptions;
    }
    get status() {
        return this.#session?.status ?? 'not-started';
    }
    async pairing() {
        const session = await this.#currentOrCreate();
        return {
            qrSvg: await renderPairingQrSvg(session.pairingUrl),
            expiresAt: session.expiresAt,
            status: session.status,
        };
    }
    async regenerate() {
        this.#session?.close();
        this.#session = undefined;
        return this.pairing();
    }
    close() {
        this.#session?.close();
        this.#session = undefined;
    }
    async #currentOrCreate() {
        if (this.#session !== undefined
            && this.#session.status !== 'closed'
            && this.#session.status !== 'error'
            && this.#session.expiresAt > Date.now())
            return this.#session;
        if (this.#creating !== undefined)
            return this.#creating;
        this.#creating = HostRelaySession.create(this.bridge, {
            mobileAppUrl: this.config.mobileAppUrl,
            relayUrl: this.config.relayUrl,
            ...this.sessionOptions,
        });
        try {
            this.#session = await this.#creating;
            return this.#session;
        }
        finally {
            this.#creating = undefined;
        }
    }
}
//# sourceMappingURL=controller.js.map