/** The two endpoints allowed in one relay room. */
export type RelayRole = 'host' | 'mobile';
/** Minimal WebSocket-like peer used by hosted relay adapters. */
export interface RelayPeer {
    send(data: Uint8Array<ArrayBuffer>): void | Promise<void>;
    close(code: number, reason: string): void;
}
/** Result of accepting a relay connection. */
export interface RelayConnection {
    /** Forward one opaque encrypted frame to the opposite role. */
    forward(data: Uint8Array<ArrayBuffer>): Promise<'forwarded' | 'peer-offline'>;
    /** Remove this connection from the room. */
    disconnect(): void;
}
/** Relay admission or frame failure. */
export declare class BlindRelayError extends Error {
    readonly code: 'role-occupied' | 'frame-empty' | 'frame-too-large';
    constructor(code: 'role-occupied' | 'frame-empty' | 'frame-too-large');
}
/**
 * In-memory room core for a blind hosted relay. Frames remain opaque bytes:
 * this class has no JSON parser, protocol decoder, storage, or logging hook.
 */
export declare class BlindRelayRoom {
    #private;
    readonly maxFrameBytes: number;
    /** @param maxFrameBytes - hard admission limit applied before forwarding. */
    constructor(maxFrameBytes?: number);
    /** Number of currently connected endpoints. */
    get size(): number;
    /**
     * Occupy one role in the room. A second connection cannot silently replace
     * an established Host or phone.
     */
    connect(role: RelayRole, peer: RelayPeer): RelayConnection;
    /** Close both endpoints and release every room reference. */
    close(code?: number, reason?: string): void;
}
//# sourceMappingURL=blind-room.d.ts.map