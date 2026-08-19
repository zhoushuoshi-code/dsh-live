import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-apiproxy'
import type {} from '@deepseek-ai/dsh-host-webserver'
import z from '@deepseek-ai/schemastery'
import { ApprovalBridge } from './approval-bridge.js'
import { HostPairingController } from './host/controller.js'
import { registerHostRoutes } from './host/routes.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-side DSH Live approval projection and decision service. */
    dshLiveApprovalBridge: ApprovalBridge
    /** Active QR and encrypted relay session owner, when configured. */
    dshLiveHostController?: HostPairingController
  }
}

/** Stable Cordis plugin name. */
export const name = 'dsh-live'

/** The bridge consumes the existing public ApiProxy service. */
export const inject = ['apiProxy', 'webServer']

export interface Config {
  /** HTTPS route that serves the DSH Live mobile PWA, normally ending in /pair. */
  mobileAppUrl?: string
  /** Hosted WSS relay endpoint, normally ending in /v1/connect. */
  relayUrl?: string
}

export const Config: z<Config> = z.object({
  mobileAppUrl: z.string().default(''),
  relayUrl: z.string().default(''),
})

/**
 * Mount the official approval bridge, desktop pairing route, and encrypted
 * outbound relay controller.
 * @param ctx - DSH Web profile context containing ApiProxy and WebServer.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const bridge = new ApprovalBridge(ctx.apiProxy)
  ctx.provide('dshLiveApprovalBridge', bridge)
  const configured = config.mobileAppUrl !== undefined && config.mobileAppUrl !== ''
    && config.relayUrl !== undefined && config.relayUrl !== ''
  const hostController = configured
    ? new HostPairingController(bridge, {
        mobileAppUrl: config.mobileAppUrl as string,
        relayUrl: config.relayUrl as string,
      })
    : undefined
  if (hostController !== undefined) ctx.provide('dshLiveHostController', hostController)
  const removeRoutes = registerHostRoutes(ctx.webServer, hostController)
  ctx.effect(() => {
    const abort = new AbortController()
    void bridge.run(abort.signal).catch((error: unknown) => {
      if (!abort.signal.aborted) console.error('[dsh-live] approval bridge stopped', error)
    })
    return () => {
      removeRoutes()
      hostController?.close()
      abort.abort()
    }
  }, 'dsh-live: approval bridge')
}

export { ApprovalBridge } from './approval-bridge.js'
export type {
  ApprovalBridgeEvent,
  ApprovalBridgeListener,
  ApprovalRequested,
  ApprovalResolved,
  MobileApprovalDecision,
} from './approval-bridge.js'

export {
  createHostPairing,
  createMobilePairing,
  DEFAULT_PAIRING_TTL_MS,
  E2EE_PROTOCOL_VERSION,
  E2eeProtocolError,
  HostPairing,
  MobilePairing,
  parsePairingUrl,
  SecureChannel,
} from './crypto/protocol.js'
export type {
  AcceptedPairing,
  CipherDirection,
  CipherEnvelope,
  E2eeErrorCode,
  PairingHello,
  PairingInvitation,
} from './crypto/protocol.js'
export { renderPairingQrSvg } from './crypto/qr.js'
export { HostPairingController } from './host/controller.js'
export type { HostControllerConfig, PairingView } from './host/controller.js'
export { registerHostRoutes } from './host/routes.js'
export { BlindRelayError, BlindRelayRoom } from './relay/blind-room.js'
export type { RelayConnection, RelayPeer, RelayRole } from './relay/blind-room.js'
export { startBlindRelayServer } from './relay/server.js'
export type { BlindRelayServerOptions, RunningBlindRelayServer } from './relay/server.js'
export { HostRelaySession, openNodeRelaySocket } from './transport/host-session.js'
export type {
  HostRelaySessionOptions,
  HostSessionStatus,
  RelaySocket,
  RelaySocketFactory,
} from './transport/host-session.js'
