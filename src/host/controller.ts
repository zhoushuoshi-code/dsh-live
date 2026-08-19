import type { ApprovalBridge } from '../approval-bridge.js'
import { renderPairingQrSvg } from '../crypto/qr.js'
import { HostRelaySession, type HostRelaySessionOptions, type HostSessionStatus } from '../transport/host-session.js'

export interface HostControllerConfig {
  mobileAppUrl: string
  relayUrl: string
}

export interface PairingView {
  qrSvg: string
  expiresAt: number
  status: HostSessionStatus
}

/** Owns the single active phone invitation for one DSH Host process. */
export class HostPairingController {
  #session: HostRelaySession | undefined
  #creating: Promise<HostRelaySession> | undefined

  constructor(
    private readonly bridge: Pick<ApprovalBridge, 'subscribe' | 'decide'>,
    readonly config: HostControllerConfig,
    private readonly sessionOptions: Pick<HostRelaySessionOptions, 'socketFactory'> = {},
  ) {}

  get status(): HostSessionStatus | 'not-started' {
    return this.#session?.status ?? 'not-started'
  }

  async pairing(): Promise<PairingView> {
    const session = await this.#currentOrCreate()
    return {
      qrSvg: await renderPairingQrSvg(session.pairingUrl),
      expiresAt: session.expiresAt,
      status: session.status,
    }
  }

  async regenerate(): Promise<PairingView> {
    this.#session?.close()
    this.#session = undefined
    return this.pairing()
  }

  close(): void {
    this.#session?.close()
    this.#session = undefined
  }

  async #currentOrCreate(): Promise<HostRelaySession> {
    if (this.#session !== undefined
      && this.#session.status !== 'closed'
      && this.#session.status !== 'error'
      && this.#session.expiresAt > Date.now()) return this.#session
    if (this.#creating !== undefined) return this.#creating
    this.#creating = HostRelaySession.create(this.bridge, {
      mobileAppUrl: this.config.mobileAppUrl,
      relayUrl: this.config.relayUrl,
      ...this.sessionOptions,
    })
    try {
      this.#session = await this.#creating
      return this.#session
    } finally {
      this.#creating = undefined
    }
  }
}
