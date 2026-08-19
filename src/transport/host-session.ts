import WebSocket, { type RawData } from 'ws'
import type { ApprovalBridge, ApprovalBridgeEvent, MobileApprovalDecision } from '../approval-bridge.js'
import {
  createHostPairing,
  type HostPairing,
  type SecureChannel,
} from '../crypto/protocol.js'
import {
  decodeTransportFrame,
  encodeTransportFrame,
  MAX_TRANSPORT_FRAME_BYTES,
  parseApprovalDecision,
} from './wire.js'

export type HostSessionStatus = 'connecting' | 'waiting-for-phone' | 'paired' | 'closed' | 'error'

export interface RelaySocket {
  send(data: Uint8Array<ArrayBuffer>): void | Promise<void>
  close(code?: number, reason?: string): void
  onMessage(listener: (data: Uint8Array<ArrayBuffer>) => void): () => void
  onClose(listener: () => void): () => void
}

export type RelaySocketFactory = (url: string) => Promise<RelaySocket>

export interface HostRelaySessionOptions {
  mobileAppUrl: string
  relayUrl: string
  now?: number
  ttlMs?: number
  socketFactory?: RelaySocketFactory
}

function relayConnectionUrl(relayUrl: string, roomId: string): string {
  const url = new URL(relayUrl)
  url.searchParams.set('roomId', roomId)
  url.searchParams.set('role', 'host')
  return url.href
}

/** Open one outbound binary WebSocket without exposing a local Host port. */
export function openNodeRelaySocket(url: string): Promise<RelaySocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, {
      maxPayload: MAX_TRANSPORT_FRAME_BYTES,
      perMessageDeflate: false,
    })
    const timeout = setTimeout(() => {
      socket.terminate()
      reject(new Error('relay connection timed out'))
    }, 10_000)
    const fail = (error: Error) => {
      clearTimeout(timeout)
      reject(error)
    }
    socket.once('error', fail)
    socket.once('open', () => {
      clearTimeout(timeout)
      socket.off('error', fail)
      resolve({
        send(data) {
          return new Promise<void>((sendResolve, sendReject) => {
            socket.send(data, { binary: true, compress: false }, (error) => {
              // ws currently calls successful callbacks with `undefined`, but
              // tolerate `null` from compatible implementations as success.
              if (error == null) sendResolve()
              else sendReject(error)
            })
          })
        },
        close(code = 1000, reason = 'host session closed') { socket.close(code, reason) },
        onMessage(listener) {
          const handler = (data: RawData, isBinary: boolean) => {
            if (!isBinary) {
              socket.close(1003, 'binary frames required')
              return
            }
            const bytes = data instanceof ArrayBuffer
              ? new Uint8Array(data)
              : Array.isArray(data)
                ? Uint8Array.from(Buffer.concat(data))
                : Uint8Array.from(data)
            listener(bytes)
          }
          socket.on('message', handler)
          return () => { socket.off('message', handler) }
        },
        onClose(listener) {
          socket.on('close', listener)
          return () => { socket.off('close', listener) }
        },
      })
    })
  })
}

/** One QR invitation, one outbound relay socket, and at most one paired phone. */
export class HostRelaySession {
  #status: HostSessionStatus = 'connecting'
  #channel: SecureChannel | undefined
  #unsubscribeBridge: (() => void) | undefined
  #removeMessage: (() => void) | undefined
  #removeClose: (() => void) | undefined
  #messageTail: Promise<void> = Promise.resolve()
  #lastError: Error | undefined
  #expiryTimer: ReturnType<typeof setTimeout> | undefined
  readonly #statusListeners = new Set<(status: HostSessionStatus) => void>()

  private constructor(
    readonly pairing: HostPairing,
    readonly socket: RelaySocket,
    private readonly bridge: Pick<ApprovalBridge, 'subscribe' | 'decide'>,
  ) {}

  static async create(
    bridge: Pick<ApprovalBridge, 'subscribe' | 'decide'>,
    options: HostRelaySessionOptions,
  ): Promise<HostRelaySession> {
    const pairing = await createHostPairing(options)
    const socket = await (options.socketFactory ?? openNodeRelaySocket)(
      relayConnectionUrl(options.relayUrl, pairing.invitation.roomId),
    )
    const session = new HostRelaySession(pairing, socket, bridge)
    session.#attach()
    session.#setStatus('waiting-for-phone')
    session.#expiryTimer = setTimeout(() => {
      if (session.#status === 'waiting-for-phone') session.close()
    }, Math.max(0, pairing.invitation.expiresAt - Date.now()))
    session.#expiryTimer.unref?.()
    return session
  }

  get status(): HostSessionStatus { return this.#status }
  get lastError(): Error | undefined { return this.#lastError }
  get expiresAt(): number { return this.pairing.invitation.expiresAt }
  get pairingUrl(): string { return this.pairing.pairingUrl }

  subscribeStatus(listener: (status: HostSessionStatus) => void): () => void {
    this.#statusListeners.add(listener)
    listener(this.#status)
    return () => { this.#statusListeners.delete(listener) }
  }

  close(): void {
    if (this.#status === 'closed') return
    this.#unsubscribeBridge?.()
    this.#unsubscribeBridge = undefined
    this.#removeMessage?.()
    this.#removeClose?.()
    if (this.#expiryTimer !== undefined) clearTimeout(this.#expiryTimer)
    this.socket.close(1000, 'pairing replaced or plugin stopped')
    this.#setStatus('closed')
  }

  #attach(): void {
    this.#removeMessage = this.socket.onMessage((data) => {
      this.#messageTail = this.#messageTail
        .then(async () => { await this.#receive(data) })
        .catch((error: unknown) => {
          this.#lastError = error instanceof Error ? error : new Error(String(error))
          this.#setStatus('error')
          this.socket.close(1008, 'invalid encrypted session message')
        })
    })
    this.#removeClose = this.socket.onClose(() => {
      this.#unsubscribeBridge?.()
      this.#unsubscribeBridge = undefined
      if (this.#status !== 'error') this.#setStatus('closed')
    })
  }

  async #receive(data: Uint8Array<ArrayBuffer>): Promise<void> {
    const wire = decodeTransportFrame(data)
    if (this.#channel === undefined) {
      const accepted = await this.pairing.accept(wire)
      this.#channel = accepted.channel
      if (this.#expiryTimer !== undefined) clearTimeout(this.#expiryTimer)
      await this.socket.send(encodeTransportFrame(accepted.acknowledgement))
      this.#unsubscribeBridge = this.bridge.subscribe(async (event) => {
        await this.#sendApprovalEvent(event)
      })
      this.#setStatus('paired')
      return
    }
    const decision = parseApprovalDecision(await this.#channel.open(wire))
    await this.bridge.decide(decision as MobileApprovalDecision)
  }

  async #sendApprovalEvent(event: ApprovalBridgeEvent): Promise<void> {
    if (this.#channel === undefined || this.#status === 'closed') return
    const envelope = await this.#channel.seal({ version: 1, type: 'approval-event', event })
    await this.socket.send(encodeTransportFrame(envelope))
  }

  #setStatus(status: HostSessionStatus): void {
    this.#status = status
    for (const listener of this.#statusListeners) listener(status)
  }
}
