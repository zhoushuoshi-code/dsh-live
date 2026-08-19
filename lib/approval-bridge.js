import { randomUUID } from 'node:crypto';
import { RpcId } from '@deepseek-ai/dsh-host-apiproxy';
/**
 * Mirrors the official ApiProxy approval stream without registering another
 * `approval/request` answerer. Desktop and mobile therefore share the host's
 * single pending decision slot, stable rpc id, cancellation, and audit path.
 */
export class ApprovalBridge {
    apiProxy;
    reportError;
    #pending = new Map();
    #listeners = new Set();
    /**
     * @param apiProxy - the public transport-independent gateway provided as `ctx.apiProxy`.
     * @param reportError - observes listener failures without affecting Harness approval.
     */
    constructor(apiProxy, reportError = () => { }) {
        this.apiProxy = apiProxy;
        this.reportError = reportError;
    }
    /** Number of approvals currently answerable through this bridge. */
    get pendingCount() {
        return this.#pending.size;
    }
    /**
     * Subscribe a relay adapter and immediately replay approvals that are still pending.
     * @param listener - receives requested and resolved frames.
     * @returns a disposer that detaches only this listener.
     */
    subscribe(listener) {
        this.#listeners.add(listener);
        for (const pending of this.#pending.values())
            this.#deliver(listener, pending.request);
        return () => { this.#listeners.delete(listener); };
    }
    /**
     * Consume one official mux subscription until the signal aborts.
     * Closing this subscription never resolves or cancels a Harness approval.
     * @param signal - bridge lifecycle signal.
     */
    async run(signal) {
        try {
            const request = { rpcId: RpcId(randomUUID()), payload: {} };
            for await (const envelope of this.apiProxy.events.mux(request, signal)) {
                const event = envelope.payload;
                if (event.type === 'approval/requested') {
                    this.#pending.set(event.approvalId, { rpcId: envelope.rpcId, request: event });
                    this.#broadcast(event);
                }
                else if (event.type === 'approval/resolved') {
                    this.#pending.delete(event.approvalId);
                    this.#broadcast(event);
                }
            }
        }
        finally {
            this.#pending.clear();
        }
    }
    /**
     * Submit one paired-phone decision through the official pending registry.
     * The host-owned session id and rpc id are used instead of trusting either
     * value from the phone.
     * @param decision - approval id and one client-answerable outcome.
     * @returns the ApiProxy carrier receipt.
     */
    decide(decision) {
        const pending = this.#pending.get(decision.approvalId);
        if (pending === undefined) {
            return Promise.resolve({ accepted: false, reason: 'not-pending' });
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
        });
    }
    #broadcast(event) {
        for (const listener of this.#listeners)
            this.#deliver(listener, event);
    }
    #deliver(listener, event) {
        try {
            Promise.resolve(listener(event)).catch(this.reportError);
        }
        catch (error) {
            this.reportError(error);
        }
    }
}
//# sourceMappingURL=approval-bridge.js.map