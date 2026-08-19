/** The two endpoints allowed in one relay room. */
export type RelayRole = 'host' | 'mobile'

/** Minimal WebSocket-like peer used by hosted relay adapters. */
export interface RelayPeer {
  send(data: Uint8Array<ArrayBuffer>): void | Promise<void>
  close(code: number, reason: string): void
}

/** Result of accepting a relay connection. */
export interface RelayConnection {
  /** Forward one opaque encrypted frame to the opposite role. */
  forward(data: Uint8Array<ArrayBuffer>): Promise<'forwarded' | 'peer-offline'>
  /** Remove this connection from the room. */
  disconnect(): void
}

/** Relay admission or frame failure. */
export class BlindRelayError extends Error {
  constructor(readonly code: 'role-occupied' | 'frame-empty' | 'frame-too-large') {
    super(code)
    this.name = 'BlindRelayError'
  }
}

/**
 * In-memory room core for a blind hosted relay. Frames remain opaque bytes:
 * this class has no JSON parser, protocol decoder, storage, or logging hook.
 */
export class BlindRelayRoom {
  readonly #peers = new Map<RelayRole, RelayPeer>()

  /** @param maxFrameBytes - hard admission limit applied before forwarding. */
  constructor(readonly maxFrameBytes = 1_048_576) {
    if (!Number.isSafeInteger(maxFrameBytes) || maxFrameBytes <= 0) {
      throw new RangeError('maxFrameBytes must be a positive safe integer')
    }
  }

  /** Number of currently connected endpoints. */
  get size(): number {
    return this.#peers.size
  }

  /**
   * Occupy one role in the room. A second connection cannot silently replace
   * an established Host or phone.
   */
  connect(role: RelayRole, peer: RelayPeer): RelayConnection {
    if (this.#peers.has(role)) throw new BlindRelayError('role-occupied')
    this.#peers.set(role, peer)
    let connected = true
    return {
      forward: async (data) => {
        if (!connected) return 'peer-offline'
        if (data.byteLength === 0) throw new BlindRelayError('frame-empty')
        if (data.byteLength > this.maxFrameBytes) throw new BlindRelayError('frame-too-large')
        const destination = this.#peers.get(role === 'host' ? 'mobile' : 'host')
        if (destination === undefined) return 'peer-offline'
        // Copy before handing bytes to another connection so caller mutation
        // cannot change a frame after admission.
        await destination.send(data.slice())
        return 'forwarded'
      },
      disconnect: () => {
        if (!connected) return
        connected = false
        if (this.#peers.get(role) === peer) this.#peers.delete(role)
      },
    }
  }

  /** Close both endpoints and release every room reference. */
  close(code = 1001, reason = 'room closed'): void {
    for (const peer of this.#peers.values()) peer.close(code, reason)
    this.#peers.clear()
  }
}
