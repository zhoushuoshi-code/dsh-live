export const MAX_TRANSPORT_FRAME_BYTES = 1_048_576;
export function encodeTransportFrame(value) {
    const encoded = new TextEncoder().encode(JSON.stringify(value));
    if (encoded.byteLength === 0 || encoded.byteLength > MAX_TRANSPORT_FRAME_BYTES) {
        throw new Error('invalid transport frame size');
    }
    return encoded;
}
export function decodeTransportFrame(value) {
    if (value.byteLength === 0 || value.byteLength > MAX_TRANSPORT_FRAME_BYTES) {
        throw new Error('invalid transport frame size');
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value));
}
export function parseApprovalDecision(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new Error('invalid approval decision');
    }
    const payload = value;
    const decision = payload['decision'];
    if (payload['version'] !== 1 || payload['type'] !== 'approval-decision'
        || typeof decision !== 'object' || decision === null || Array.isArray(decision)) {
        throw new Error('invalid approval decision');
    }
    const fields = decision;
    if (typeof fields['approvalId'] !== 'string'
        || (fields['outcome'] !== 'allowed-once' && fields['outcome'] !== 'rejected')) {
        throw new Error('invalid approval decision');
    }
    return {
        approvalId: fields['approvalId'],
        outcome: fields['outcome'],
    };
}
//# sourceMappingURL=wire.js.map