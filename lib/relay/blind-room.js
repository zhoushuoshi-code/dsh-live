/** Relay admission or frame failure. */
export class BlindRelayError extends Error {
    code;
    constructor(code) {
        super(code);
        this.code = code;
        this.name = 'BlindRelayError';
    }
}
/**
 * In-memory room core for a blind hosted relay. Frames remain opaque bytes:
 * this class has no JSON parser, protocol decoder, storage, or logging hook.
 */
export class BlindRelayRoom {
    maxFrameBytes;
    #peers = new Map();
    /** @param maxFrameBytes - hard admission limit applied before forwarding. */
    constructor(maxFrameBytes = 1_048_576) {
        this.maxFrameBytes = maxFrameBytes;
        if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes <= 0) {
            throw new RangeError('maxFrameBytes must be a positive safe integer');
        }
    }
    /** Number of currently connected endpoints. */
    get size() {
        return this.#peers.size;
    }
    /**
     * Occupy one role in the room. A second connection cannot silently replace
     * an established Host or phone.
     */
    connect(role, peer) {
        if (this.#peers.has(role))
            throw new BlindRelayError('role-occupied');
        this.#peers.set(role, peer);
        let connected = true;
        return {
            forward: async (data) => {
                if (!connected)
                    return 'peer-offline';
                if (data.byteLength === 0)
                    throw new BlindRelayError('frame-empty');
                if (data.byteLength > this.maxFrameBytes)
                    throw new BlindRelayError('frame-too-large');
                const destination = this.#peers.get(role === 'host' ? 'mobile' : 'host');
                if (destination === undefined)
                    return 'peer-offline';
                // Copy before handing bytes to another connection so caller mutation
                // cannot change a frame after admission.
                await destination.send(data.slice());
                return 'forwarded';
            },
            disconnect: () => {
                if (!connected)
                    return;
                connected = false;
                if (this.#peers.get(role) === peer)
                    this.#peers.delete(role);
            },
        };
    }
    /** Close both endpoints and release every room reference. */
    close(code = 1001, reason = 'room closed') {
        for (const peer of this.#peers.values())
            peer.close(code, reason);
        this.#peers.clear();
    }
}
//# sourceMappingURL=blind-room.js.map