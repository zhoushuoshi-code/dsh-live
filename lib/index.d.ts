import type { Context } from '@deepseek-ai/cordis';
import { ApprovalBridge } from './approval-bridge.js';
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Host-side DSH Live approval projection and decision service. */
        dshLiveApprovalBridge: ApprovalBridge;
    }
}
/** Stable Cordis plugin name. */
export declare const name = "dsh-live";
/** The bridge consumes the existing public ApiProxy service. */
export declare const inject: string[];
/**
 * Mount the host bridge. Relay transport is intentionally a later layer: this
 * plugin proves official approval ownership and exposes a narrow service.
 * @param ctx - DSH Web profile context containing `ctx.apiProxy`.
 */
export declare function apply(ctx: Context): void;
export { ApprovalBridge } from './approval-bridge.js';
export type { ApprovalBridgeEvent, ApprovalBridgeListener, ApprovalRequested, ApprovalResolved, MobileApprovalDecision, } from './approval-bridge.js';
export { createHostPairing, createMobilePairing, DEFAULT_PAIRING_TTL_MS, E2EE_PROTOCOL_VERSION, E2eeProtocolError, HostPairing, MobilePairing, parsePairingUrl, SecureChannel, } from './crypto/protocol.js';
export type { AcceptedPairing, CipherDirection, CipherEnvelope, E2eeErrorCode, PairingHello, PairingInvitation, } from './crypto/protocol.js';
export { renderPairingQrSvg } from './crypto/qr.js';
export { BlindRelayError, BlindRelayRoom } from './relay/blind-room.js';
export type { RelayConnection, RelayPeer, RelayRole } from './relay/blind-room.js';
//# sourceMappingURL=index.d.ts.map