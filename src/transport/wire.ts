export const MAX_TRANSPORT_FRAME_BYTES = 1_048_576

export interface TransportApprovalDecision {
  approvalId: string
  outcome: 'allowed-once' | 'rejected'
}

export interface ApprovalEventPayload {
  version: 1
  type: 'approval-event'
  event: unknown
}

export interface ApprovalDecisionPayload {
  version: 1
  type: 'approval-decision'
  decision: TransportApprovalDecision
}

export function encodeTransportFrame(value: unknown): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(JSON.stringify(value))
  if (encoded.byteLength === 0 || encoded.byteLength > MAX_TRANSPORT_FRAME_BYTES) {
    throw new Error('invalid transport frame size')
  }
  return encoded
}

export function decodeTransportFrame(value: Uint8Array): unknown {
  if (value.byteLength === 0 || value.byteLength > MAX_TRANSPORT_FRAME_BYTES) {
    throw new Error('invalid transport frame size')
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value)) as unknown
}

export function parseApprovalDecision(value: unknown): TransportApprovalDecision {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('invalid approval decision')
  }
  const payload = value as Record<string, unknown>
  const decision = payload['decision']
  if (payload['version'] !== 1 || payload['type'] !== 'approval-decision'
    || typeof decision !== 'object' || decision === null || Array.isArray(decision)) {
    throw new Error('invalid approval decision')
  }
  const fields = decision as Record<string, unknown>
  if (typeof fields['approvalId'] !== 'string'
    || (fields['outcome'] !== 'allowed-once' && fields['outcome'] !== 'rejected')) {
    throw new Error('invalid approval decision')
  }
  return {
    approvalId: fields['approvalId'],
    outcome: fields['outcome'],
  }
}
