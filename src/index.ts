import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-apiproxy'
import { ApprovalBridge } from './approval-bridge.js'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Host-side DSH Live approval projection and decision service. */
    dshLiveApprovalBridge: ApprovalBridge
  }
}

/** Stable Cordis plugin name. */
export const name = 'dsh-live'

/** The bridge consumes the existing public ApiProxy service. */
export const inject = ['apiProxy']

/**
 * Mount the host bridge. Relay transport is intentionally a later layer: this
 * plugin proves official approval ownership and exposes a narrow service.
 * @param ctx - DSH Web profile context containing `ctx.apiProxy`.
 */
export function apply(ctx: Context): void {
  const bridge = new ApprovalBridge(ctx.apiProxy)
  ctx.provide('dshLiveApprovalBridge', bridge)
  ctx.effect(() => {
    const controller = new AbortController()
    void bridge.run(controller.signal).catch((error: unknown) => {
      if (!controller.signal.aborted) console.error('[dsh-live] approval bridge stopped', error)
    })
    return () => { controller.abort() }
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
