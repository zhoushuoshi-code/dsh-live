# Approval bridge feasibility spike

## Decision

**Go**, with one architectural constraint: DSH Live must consume the public `ctx.apiProxy` service as a second client. It must never register another `approval/request` answerer.

DeepSeek Harness `0.1.0-rc.7` owns one pending approval registry inside `ApiProxy`. Every mux subscriber receives the same `approval/requested` frame with the same stable `rpcId`, `sessionId`, and `approvalId`. `ApiProxy.respond()` removes the pending entry synchronously before resolving the approval, so the first valid desktop or mobile response wins and every later response receives `not-pending`.

Closing the DSH Live mux subscription only removes its queue. It does not resolve, reject, or cancel the host approval. Turn cancellation is host-owned and broadcasts `approval/resolved` with `cancelled` to every remaining subscriber.

## Verified source

- Official repository commit: `99f6f02fecdb7dff40c3fbc9470f5907c29f74ca`
- DeepSeek Harness version: `0.1.0-rc.7`
- Approval registry: `packages/host/apiproxy/src/api-proxy.ts`
- Public plugin service: `packages/host/apiproxy/src/index.ts` (`ctx.apiProxy`)
- Wire payload: `packages/host/apiproxy/src/api/approvals.ts`

## Verified invariants

1. Desktop and mobile receive one stable approval identity.
2. A mobile `allowed-once` settles the official approval and desktop receives the resolution.
3. A desktop decision makes a later mobile decision return `not-pending`.
4. Simultaneous desktop/mobile responses produce exactly one accepted receipt.
5. Mobile disconnect leaves the desktop decision slot live.
6. Turn cancellation closes the decision slot and late responses return `not-pending`.
7. Malformed or mismatched responses remain fail-closed through the official response schema.
8. The bridge trusts neither a phone-provided `rpcId` nor `sessionId`; both come from the host pending entry.

## Commands and results

```text
pnpm exec vitest run packages/host/apiproxy/tests/api-proxy-approval.spec.ts
Test Files  1 passed (1)
Tests       15 passed (15)
```

The 15-test run contains the 11 official tests plus four spike cases for simultaneous subscribers, response racing, mobile disconnect, and cancellation broadcast.

The independent DSH Live integration suite runs five reproducible cases against the published official packages with `pnpm test`: mobile-first, desktop-first, mobile disconnect, simultaneous response race, and turn cancellation.

## Remaining boundary

This spike validates approval ownership and arbitration only. It does not validate QR pairing, relay authentication, end-to-end encryption, push notifications, or mobile UI. Those features must preserve the host-owned correlation and may forward only `approvalId` plus `allowed-once` or `rejected` back into `ApprovalBridge.decide()`.
