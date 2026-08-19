import { randomUUID } from 'node:crypto'
import type { ApiProxy, MuxFrame, RpcReceipt } from '@deepseek-ai/dsh-host-apiproxy/api'
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy'

/** A pending approval projected by the official ApiProxy. */
export type ApprovalRequested = Extract<MuxFrame, { type: 'approval/requested' }>

/** A terminal approval outcome projected by the official ApiProxy. */
export type ApprovalResolved = Extract<MuxFrame, { type: 'approval/resolved' }>

/** Approval events that the relay-facing plugin may forward to a paired phone. */
export type ApprovalBridgeEvent = ApprovalRequested | ApprovalResolved

/** The only decision fields accepted from a paired phone. */
export interface MobileApprovalDecision {
  approvalId: ApprovalRequested['approvalId']
  outcome: 'allowed-once' | 'rejected'
}

/** Listener for relay-facing approval events. */
export type ApprovalBridgeListener = (event: ApprovalBridgeEvent) => void | Promise<void>

interface PendingApproval {
  rpcId: RpcId
  request: ApprovalRequested
}

/**
 * Mirrors the official ApiProxy approval stream without registering another
 * `approval/request` answerer. Desktop and mobile therefore share the host's
 * single pending decision slot, stable rpc id, cancellation, and audit path.
 */
export class ApprovalBridge {
  readonly #pending = new Map<ApprovalRequested['approvalId'], PendingApproval>()
  readonly #listeners = new Set<ApprovalBridgeListener>()

  /**
   * @param apiProxy - the public transport-independent gateway provided as `ctx.apiProxy`.
   * @param reportError - observes listener failures without affecting Harness approval.
   */
  constructor(
    private readonly apiProxy: ApiProxy,
    private readonly reportError: (error: unknown) => void = () => {},
  ) {}

  /** Number of approvals currently answerable through this bridge. */
  get pendingCount(): number {
    return this.#pending.size
  }

  /**
   * Subscribe a relay adapter and immediately replay approvals that are still pending.
   * @param listener - receives requested and resolved frames.
   * @returns a disposer that detaches only this listener.
   */
  subscribe(listener: ApprovalBridgeListener): () => void {
    this.#listeners.add(listener)
    for (const pending of this.#pending.values()) this.#deliver(listener, pending.request)
    return () => { this.#listeners.delete(listener) }
  }

  /**
   * Consume one official mux subscription until the signal aborts.
   * Closing this subscription never resolves or cancels a Harness approval.
   * @param signal - bridge lifecycle signal.
   */
  async run(signal: AbortSignal): Promise<void> {
    try {
      const request = { rpcId: RpcId(randomUUID()), payload: {} }
      for await (const envelope of this.apiProxy.events.mux(request, signal)) {
        const event = envelope.payload
        if (event.type === 'approval/requested') {
          this.#pending.set(event.approvalId, { rpcId: envelope.rpcId, request: event })
          this.#broadcast(event)
        } else if (event.type === 'approval/resolved') {
          this.#pending.delete(event.approvalId)
          this.#broadcast(event)
        }
      }
    } finally {
      this.#pending.clear()
    }
  }

  /**
   * Submit one paired-phone decision through the official pending registry.
   * The host-owned session id and rpc id are used instead of trusting either
   * value from the phone.
   * @param decision - approval id and one client-answerable outcome.
   * @returns the ApiProxy carrier receipt.
   */
  decide(decision: MobileApprovalDecision): Promise<RpcReceipt> {
    const pending = this.#pending.get(decision.approvalId)
    if (pending === undefined) {
      return Promise.resolve({ accepted: false, reason: 'not-pending' })
    }
    return this.apiProxy.respond({
      type: 'client-response',
      rpcId: pending.rpcId,
      result: {
        ok: true,
        value: {
          sessionId: pending.request.sessionId,
          approvalId: pending.request.approvalId,
          outcome: decision.outcome,
        },
      },
    })
  }

  #broadcast(event: ApprovalBridgeEvent): void {
    for (const listener of this.#listeners) this.#deliver(listener, event)
  }

  #deliver(listener: ApprovalBridgeListener, event: ApprovalBridgeEvent): void {
    try {
      Promise.resolve(listener(event)).catch(this.reportError)
    } catch (error: unknown) {
      this.reportError(error)
    }
  }
}
