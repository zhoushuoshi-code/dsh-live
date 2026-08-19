import { ApprovalBridge } from './approval-bridge.js';
/** Stable Cordis plugin name. */
export const name = 'dsh-live';
/** The bridge consumes the existing public ApiProxy service. */
export const inject = ['apiProxy'];
/**
 * Mount the host bridge. Relay transport is intentionally a later layer: this
 * plugin proves official approval ownership and exposes a narrow service.
 * @param ctx - DSH Web profile context containing `ctx.apiProxy`.
 */
export function apply(ctx) {
    const bridge = new ApprovalBridge(ctx.apiProxy);
    ctx.provide('dshLiveApprovalBridge', bridge);
    ctx.effect(() => {
        const controller = new AbortController();
        void bridge.run(controller.signal).catch((error) => {
            if (!controller.signal.aborted)
                console.error('[dsh-live] approval bridge stopped', error);
        });
        return () => { controller.abort(); };
    }, 'dsh-live: approval bridge');
}
export { ApprovalBridge } from './approval-bridge.js';
//# sourceMappingURL=index.js.map