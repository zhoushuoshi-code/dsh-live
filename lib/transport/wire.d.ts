export declare const MAX_TRANSPORT_FRAME_BYTES = 1048576;
export interface TransportApprovalDecision {
    approvalId: string;
    outcome: 'allowed-once' | 'rejected';
}
export interface ApprovalEventPayload {
    version: 1;
    type: 'approval-event';
    event: unknown;
}
export interface ApprovalDecisionPayload {
    version: 1;
    type: 'approval-decision';
    decision: TransportApprovalDecision;
}
export declare function encodeTransportFrame(value: unknown): Uint8Array<ArrayBuffer>;
export declare function decodeTransportFrame(value: Uint8Array): unknown;
export declare function parseApprovalDecision(value: unknown): TransportApprovalDecision;
//# sourceMappingURL=wire.d.ts.map