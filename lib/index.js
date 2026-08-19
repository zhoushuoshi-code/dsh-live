import z from '@deepseek-ai/schemastery';
import { ApprovalBridge } from './approval-bridge.js';
import { HostPairingController } from './host/controller.js';
import { registerHostRoutes } from './host/routes.js';
/** Stable Cordis plugin name. */
export const name = 'dsh-live';
/** The bridge consumes the existing public ApiProxy service. */
export const inject = ['apiProxy', 'webServer'];
export const Config = z.object({
    mobileAppUrl: z.string().default(''),
    relayUrl: z.string().default(''),
});
/**
 * Mount the official approval bridge, desktop pairing route, and encrypted
 * outbound relay controller.
 * @param ctx - DSH Web profile context containing ApiProxy and WebServer.
 */
export function apply(ctx, config = {}) {
    const bridge = new ApprovalBridge(ctx.apiProxy);
    ctx.provide('dshLiveApprovalBridge', bridge);
    const configured = config.mobileAppUrl !== undefined && config.mobileAppUrl !== ''
        && config.relayUrl !== undefined && config.relayUrl !== '';
    const hostController = configured
        ? new HostPairingController(bridge, {
            mobileAppUrl: config.mobileAppUrl,
            relayUrl: config.relayUrl,
        })
        : undefined;
    if (hostController !== undefined)
        ctx.provide('dshLiveHostController', hostController);
    const removeRoutes = registerHostRoutes(ctx.webServer, hostController);
    ctx.effect(() => {
        const abort = new AbortController();
        void bridge.run(abort.signal).catch((error) => {
            if (!abort.signal.aborted)
                console.error('[dsh-live] approval bridge stopped', error);
        });
        return () => {
            removeRoutes();
            hostController?.close();
            abort.abort();
        };
    }, 'dsh-live: approval bridge');
}
export { ApprovalBridge } from './approval-bridge.js';
export { createHostPairing, createMobilePairing, DEFAULT_PAIRING_TTL_MS, E2EE_PROTOCOL_VERSION, E2eeProtocolError, HostPairing, MobilePairing, parsePairingUrl, SecureChannel, } from './crypto/protocol.js';
export { renderPairingQrSvg } from './crypto/qr.js';
export { HostPairingController } from './host/controller.js';
export { registerHostRoutes } from './host/routes.js';
export { BlindRelayError, BlindRelayRoom } from './relay/blind-room.js';
export { startBlindRelayServer } from './relay/server.js';
export { HostRelaySession, openNodeRelaySocket } from './transport/host-session.js';
//# sourceMappingURL=index.js.map