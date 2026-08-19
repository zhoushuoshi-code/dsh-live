import type { ApiProxy, MuxFrame, RpcReceipt } from '@deepseek-ai/dsh-host-apiproxy/api';
/** A pending approval projected by the official ApiProxy. */
export type ApprovalRequested = Extract<MuxFrame, {
    type: 'approval/requested';
}>;
/** A terminal approval outcome projected by the official ApiProxy. */
export type ApprovalResolved = Extract<MuxFrame, {
    type: 'approval/resolved';
}>;
/** Approval events that the relay-facing plugin may forward to a paired phone. */
export type ApprovalBridgeEvent = ApprovalRequested | ApprovalResolved;
/** The only decision fields accepted from a paired phone. */
export interface MobileApprovalDecision {
    approvalId: ApprovalRequested['approvalId'];
    outcome: 'allowed-once' | 'rejected';
}
/** Listener for relay-facing approval events. */
export type ApprovalBridgeListener = (event: ApprovalBridgeEvent) => void | Promise<void>;
/**
 * Mirrors the official ApiProxy approval stream without registering another
 * `approval/request` answerer. Desktop and mobile therefore share the host's
 * single pending decision slot, stable rpc id, cancellation, and audit path.
 */
export declare class ApprovalBridge {
    #private;
    private readonly apiProxy;
    private readonly reportError;
    /**
     * @param apiProxy - the public transport-independent gateway provided as `ctx.apiProxy`.
     * @param reportError - observes listener failures without affecting Harness approval.
     */
    constructor(apiProxy: ApiProxy, reportError?: (error: unknown) => void);
    /** Number of approvals currently answerable through this bridge. */
    get pendingCount(): number;
    /**
     * Subscribe a relay adapter and immediately replay approvals that are still pending.
     * @param listener - receives requested and resolved frames.
     * @returns a disposer that detaches only this listener.
     */
    subscribe(listener: ApprovalBridgeListener): () => void;
    /**
     * Consume one official mux subscription until the signal aborts.
     * Closing this subscription never resolves or cancels a Harness approval.
     * @param signal - bridge lifecycle signal.
     */
    run(signal: AbortSignal): Promise<void>;
    /**
     * Submit one paired-phone decision through the official pending registry.
     * The host-owned session id and rpc id are used instead of trusting either
     * value from the phone.
     * @param decision - approval id and one client-answerable outcome.
     * @returns the ApiProxy carrier receipt.
     */
    decide(decision: MobileApprovalDecision): Promise<RpcReceipt>;
}
//# sourceMappingURL=approval-bridge.d.ts.map