import { describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createApiProxy, RpcId } from '@deepseek-ai/dsh-host-apiproxy'
import type { ApiProxy, MuxFrame, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { ApprovalBridge, type ApprovalBridgeEvent, type ApprovalRequested } from '../src/approval-bridge.js'

async function harness(): Promise<{ ctx: Context; api: ApiProxy }> {
  const ctx = new Context()
  await ctx.plugin(SessionStore)
  await ctx.plugin(SystemPrompt, { persona: '' })
  await ctx.plugin(UserQuestionService)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(ApprovalService)
  return {
    ctx,
    api: createApiProxy(ctx, {
      defaultModelSelection: () => ({ provider: 'p', model: 'm' }),
      cwd: '/tmp',
    }),
  }
}

function agentOf(ctx: Context): Agent {
  const session = ctx.sessions.create()
  session.append('turn/start', { turn: 1 })
  return { session } as unknown as Agent
}

function openDesktop(api: ApiProxy, signal: AbortSignal): {
  frames: RpcRequest<MuxFrame>[]
  waitFor(type: MuxFrame['type']): Promise<RpcRequest<MuxFrame>>
} {
  const frames: RpcRequest<MuxFrame>[] = []
  const waiters = new Map<MuxFrame['type'], (frame: RpcRequest<MuxFrame>) => void>()
  void (async () => {
    for await (const frame of api.events.mux({ rpcId: RpcId('desktop-mux'), payload: {} }, signal)) {
      frames.push(frame)
      waiters.get(frame.payload.type)?.(frame)
      waiters.delete(frame.payload.type)
    }
  })()
  return {
    frames,
    waitFor(type) {
      const found = frames.find(frame => frame.payload.type === type)
      if (found !== undefined) return Promise.resolve(found)
      return new Promise(resolve => { waiters.set(type, resolve) })
    },
  }
}

function mobileEvents(bridge: ApprovalBridge): {
  events: ApprovalBridgeEvent[]
  waitFor(type: ApprovalBridgeEvent['type']): Promise<ApprovalBridgeEvent>
} {
  const events: ApprovalBridgeEvent[] = []
  const waiters = new Map<ApprovalBridgeEvent['type'], (event: ApprovalBridgeEvent) => void>()
  bridge.subscribe((event) => {
    events.push(event)
    waiters.get(event.type)?.(event)
    waiters.delete(event.type)
  })
  return {
    events,
    waitFor(type) {
      const found = events.find(event => event.type === type)
      if (found !== undefined) return Promise.resolve(found)
      return new Promise(resolve => { waiters.set(type, resolve) })
    },
  }
}

function asRequested(event: ApprovalBridgeEvent): ApprovalRequested {
  if (event.type !== 'approval/requested') throw new Error('expected approval/requested')
  return event
}

describe('DSH Live against the official ApiProxy approval registry', () => {
  it('lets mobile decide the same request while desktop remains subscribed', async () => {
    const { ctx, api } = await harness()
    const desktopAbort = new AbortController()
    const bridgeAbort = new AbortController()
    const desktop = openDesktop(api, desktopAbort.signal)
    const bridge = new ApprovalBridge(api)
    const mobile = mobileEvents(bridge)
    const running = bridge.run(bridgeAbort.signal)

    const asked = ctx.approval.request({ agent: agentOf(ctx), toolName: 'bash' })
    const desktopRequest = await desktop.waitFor('approval/requested')
    const mobileRequest = asRequested(await mobile.waitFor('approval/requested'))
    expect(desktopRequest.payload).toMatchObject({ approvalId: mobileRequest.approvalId })

    await expect(bridge.decide({
      approvalId: mobileRequest.approvalId,
      outcome: 'allowed-once',
    })).resolves.toEqual({ accepted: true })
    await expect(asked).resolves.toBe('allowed-once')
    await expect(desktop.waitFor('approval/resolved')).resolves.toMatchObject({
      payload: { approvalId: mobileRequest.approvalId, outcome: 'allowed-once' },
    })
    bridgeAbort.abort()
    desktopAbort.abort()
    await running
  })

  it('reports not-pending when desktop wins and receives the host resolution', async () => {
    const { ctx, api } = await harness()
    const desktopAbort = new AbortController()
    const bridgeAbort = new AbortController()
    const desktop = openDesktop(api, desktopAbort.signal)
    const bridge = new ApprovalBridge(api)
    const mobile = mobileEvents(bridge)
    const running = bridge.run(bridgeAbort.signal)
    const asked = ctx.approval.request({ agent: agentOf(ctx), toolName: 'write' })
    const desktopRequest = await desktop.waitFor('approval/requested')
    const mobileRequest = asRequested(await mobile.waitFor('approval/requested'))

    await expect(api.respond({
      type: 'client-response',
      rpcId: desktopRequest.rpcId,
      result: {
        ok: true,
        value: {
          sessionId: mobileRequest.sessionId,
          approvalId: mobileRequest.approvalId,
          outcome: 'rejected',
        },
      },
    })).resolves.toEqual({ accepted: true })
    await expect(asked).resolves.toBe('rejected')
    await expect(mobile.waitFor('approval/resolved')).resolves.toMatchObject({ outcome: 'rejected' })
    await expect(bridge.decide({
      approvalId: mobileRequest.approvalId,
      outcome: 'allowed-once',
    })).resolves.toEqual({ accepted: false, reason: 'not-pending' })
    bridgeAbort.abort()
    desktopAbort.abort()
    await running
  })

  it('does not resolve or cancel the host request when the mobile bridge disconnects', async () => {
    const { ctx, api } = await harness()
    const desktopAbort = new AbortController()
    const bridgeAbort = new AbortController()
    const desktop = openDesktop(api, desktopAbort.signal)
    const bridge = new ApprovalBridge(api)
    const mobile = mobileEvents(bridge)
    const running = bridge.run(bridgeAbort.signal)
    const asked = ctx.approval.request({ agent: agentOf(ctx), toolName: 'bash' })
    const desktopRequest = await desktop.waitFor('approval/requested')
    await mobile.waitFor('approval/requested')

    bridgeAbort.abort()
    await running
    expect(bridge.pendingCount).toBe(0)
    const request = desktopRequest.payload
    if (request.type !== 'approval/requested') throw new Error('expected approval/requested')
    await expect(api.respond({
      type: 'client-response',
      rpcId: desktopRequest.rpcId,
      result: {
        ok: true,
        value: {
          sessionId: request.sessionId,
          approvalId: request.approvalId,
          outcome: 'rejected',
        },
      },
    })).resolves.toEqual({ accepted: true })
    await expect(asked).resolves.toBe('rejected')
    desktopAbort.abort()
  })

  it('accepts exactly one response when desktop and mobile race', async () => {
    const { ctx, api } = await harness()
    const desktopAbort = new AbortController()
    const bridgeAbort = new AbortController()
    const desktop = openDesktop(api, desktopAbort.signal)
    const bridge = new ApprovalBridge(api)
    const mobile = mobileEvents(bridge)
    const running = bridge.run(bridgeAbort.signal)
    const asked = ctx.approval.request({ agent: agentOf(ctx), toolName: 'bash' })
    const desktopRequest = await desktop.waitFor('approval/requested')
    const mobileRequest = asRequested(await mobile.waitFor('approval/requested'))

    const receipts = await Promise.all([
      api.respond({
        type: 'client-response',
        rpcId: desktopRequest.rpcId,
        result: {
          ok: true,
          value: {
            sessionId: mobileRequest.sessionId,
            approvalId: mobileRequest.approvalId,
            outcome: 'rejected',
          },
        },
      }),
      bridge.decide({ approvalId: mobileRequest.approvalId, outcome: 'allowed-once' }),
    ])
    expect(receipts.filter(receipt => receipt.accepted)).toHaveLength(1)
    expect(receipts.filter(receipt => !receipt.accepted && receipt.reason === 'not-pending')).toHaveLength(1)
    expect(['allowed-once', 'rejected']).toContain(await asked)
    await expect(mobile.waitFor('approval/resolved')).resolves.toBeDefined()
    bridgeAbort.abort()
    desktopAbort.abort()
    await running
  })

  it('projects turn cancellation and rejects a late mobile response', async () => {
    const { ctx, api } = await harness()
    const bridgeAbort = new AbortController()
    const requestAbort = new AbortController()
    const bridge = new ApprovalBridge(api)
    const mobile = mobileEvents(bridge)
    const running = bridge.run(bridgeAbort.signal)
    const asked = ctx.approval.request({
      agent: agentOf(ctx),
      toolName: 'bash',
      signal: requestAbort.signal,
    })
    const mobileRequest = asRequested(await mobile.waitFor('approval/requested'))

    requestAbort.abort()
    await expect(asked).resolves.toBe('cancelled')
    await expect(mobile.waitFor('approval/resolved')).resolves.toMatchObject({
      approvalId: mobileRequest.approvalId,
      outcome: 'cancelled',
    })
    await expect(bridge.decide({
      approvalId: mobileRequest.approvalId,
      outcome: 'allowed-once',
    })).resolves.toEqual({ accepted: false, reason: 'not-pending' })
    bridgeAbort.abort()
    await running
  })
})
