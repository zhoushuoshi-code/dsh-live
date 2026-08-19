import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import { ApprovalBridge } from './approval-bridge.js';
import { HostPairingController } from './host/controller.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Host-side DSH Live approval projection and decision service. */
        dshLiveApprovalBridge: ApprovalBridge;
        /** Active QR and encrypted relay session owner, when configured. */
        dshLiveHostController?: HostPairingController;
    }
}
/** Stable Cordis plugin name. */
export declare const name = "dsh-live";
/** The bridge consumes the existing public ApiProxy service. */
export declare const inject: string[];
export interface Config {
    /** HTTPS route that serves the DSH Live mobile PWA, normally ending in /pair. */
    mobileAppUrl?: string;
    /** Hosted WSS relay endpoint, normally ending in /v1/connect. */
    relayUrl?: string;
}
export declare const Config: z<Config>;
/**
 * Mount the official approval bridge, desktop pairing route, and encrypted
 * outbound relay controller.
 * @param ctx - DSH Web profile context containing ApiProxy and WebServer.
 */
export declare function apply(ctx: Context, config?: Config): void;
export { ApprovalBridge } from './approval-bridge.js';
export type { ApprovalBridgeEvent, ApprovalBridgeListener, ApprovalRequested, ApprovalResolved, MobileApprovalDecision, } from './approval-bridge.js';
export { createHostPairing, createMobilePairing, DEFAULT_PAIRING_TTL_MS, E2EE_PROTOCOL_VERSION, E2eeProtocolError, HostPairing, MobilePairing, parsePairingUrl, SecureChannel, } from './crypto/protocol.js';
export type { AcceptedPairing, CipherDirection, CipherEnvelope, E2eeErrorCode, PairingHello, PairingInvitation, } from './crypto/protocol.js';
export { renderPairingQrSvg } from './crypto/qr.js';
export { HostPairingController } from './host/controller.js';
export type { HostControllerConfig, PairingView } from './host/controller.js';
export { registerHostRoutes } from './host/routes.js';
export { BlindRelayError, BlindRelayRoom } from './relay/blind-room.js';
export type { RelayConnection, RelayPeer, RelayRole } from './relay/blind-room.js';
export { startBlindRelayServer } from './relay/server.js';
export type { BlindRelayServerOptions, RunningBlindRelayServer } from './relay/server.js';
export { HostRelaySession, openNodeRelaySocket } from './transport/host-session.js';
export type { HostRelaySessionOptions, HostSessionStatus, RelaySocket, RelaySocketFactory, } from './transport/host-session.js';
//# sourceMappingURL=index.d.ts.map