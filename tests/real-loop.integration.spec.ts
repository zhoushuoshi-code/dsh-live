import { afterEach, describe, expect, it } from 'vitest'
import WebSocket, { type RawData } from 'ws'
import { Context } from '@deepseek-ai/cordis'
import AgentRegistry from '@deepseek-ai/dsh-agent'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { createApiProxy, RpcId } from '@deepseek-ai/dsh-host-apiproxy'
import type { ApiProxy, MuxFrame, RpcRequest } from '@deepseek-ai/dsh-host-apiproxy/api'
import SessionStore from '@deepseek-ai/dsh-session'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import UserQuestionService from '@deepseek-ai/dsh-user-questions'
import { ApprovalBridge } from '../src/approval-bridge.js'
import { createMobilePairing, parsePairingUrl } from '../src/crypto/protocol.js'
import { startBlindRelayServer, type RunningBlindRelayServer } from '../src/relay/server.js'
import { HostRelaySession, openNodeRelaySocket } from '../src/transport/host-session.js'
import { decodeTransportFrame, encodeTransportFrame } from '../src/transport/wire.js'

const relays: RunningBlindRelayServer[] = []

afterEach(async () => {
  await Promise.all(relays.splice(0).map(async relay => { await relay.close() }))
})

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

function rawBytes(data: RawData): Uint8Array<ArrayBuffer> {
  if (data instanceof ArrayBuffer) return new Uint8Array(data)
  if (Array.isArray(data)) return Uint8Array.from(Buffer.concat(data))
  return Uint8Array.from(data)
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url, { perMessageDeflate: false })
    socket.once('open', () => { resolve(socket) })
    socket.once('error', reject)
  })
}

function nextBinary(socket: WebSocket): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise((resolve, reject) => {
    socket.once('message', (data, isBinary) => {
      if (!isBinary) reject(new Error('expected binary frame'))
      else resolve(rawBytes(data))
    })
  })
}

function desktop(api: ApiProxy, signal: AbortSignal): {
  waitFor(type: MuxFrame['type']): Promise<RpcRequest<MuxFrame>>
} {
  const frames: RpcRequest<MuxFrame>[] = []
  const waiters = new Map<MuxFrame['type'], (frame: RpcRequest<MuxFrame>) => void>()
  void (async () => {
    for await (const frame of api.events.mux({ rpcId: RpcId('desktop-loop'), payload: {} }, signal)) {
      frames.push(frame)
      waiters.get(frame.payload.type)?.(frame)
      waiters.delete(frame.payload.type)
    }
  })()
  return {
    waitFor(type) {
      const found = frames.find(frame => frame.payload.type === type)
      if (found !== undefined) return Promise.resolve(found)
      return new Promise(resolve => { waiters.set(type, resolve) })
    },
  }
}

describe('real WebSocket mobile approval loop', () => {
  it('keeps idle public WebSockets alive with protocol ping frames', async () => {
    const relay = await startBlindRelayServer({ port: 0, heartbeatIntervalMs: 20 })
    relays.push(relay)
    const url = new URL(relay.wsUrl)
    url.searchParams.set('roomId', 'AAAAAAAAAAAAAAAAAAAAAA')
    url.searchParams.set('role', 'host')
    const socket = await openSocket(url.href)

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => { reject(new Error('relay heartbeat timed out')) }, 500)
      socket.once('ping', () => {
        clearTimeout(timeout)
        resolve()
      })
    })

    expect(socket.readyState).toBe(WebSocket.OPEN)
    socket.close()
  })

  it('serves the installable mobile shell with strict security headers', async () => {
    const relay = await startBlindRelayServer({ port: 0 })
    relays.push(relay)
    const response = await fetch(`${relay.httpUrl}/pair`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    await expect(response.text()).resolves.toContain('Your agent calls.')
    await expect(fetch(`${relay.httpUrl}/mobile/main.js`).then(response => response.text()))
      .resolves.toContain('createMobilePairing')
  })

  it('carries one official approval from DSH to phone and its encrypted decision back', async () => {
    const relay = await startBlindRelayServer({ port: 0 })
    relays.push(relay)
    const { ctx, api } = await harness()
    const bridgeAbort = new AbortController()
    const desktopAbort = new AbortController()
    const bridge = new ApprovalBridge(api)
    const bridgeRun = bridge.run(bridgeAbort.signal)
    const desktopClient = desktop(api, desktopAbort.signal)
    const host = await HostRelaySession.create(bridge, {
      mobileAppUrl: 'https://mobile.example.test/pair',
      relayUrl: 'wss://relay.example.test/v1/connect',
      socketFactory(url) {
        const requested = new URL(url)
        const local = new URL(relay.wsUrl)
        local.search = requested.search
        return openNodeRelaySocket(local.href)
      },
    })

    const invitation = parsePairingUrl(host.pairingUrl)
    const pairing = await createMobilePairing(invitation)
    const mobileUrl = new URL(relay.wsUrl)
    mobileUrl.searchParams.set('roomId', invitation.roomId)
    mobileUrl.searchParams.set('role', 'mobile')
    const mobile = await openSocket(mobileUrl.href)
    const acknowledgement = nextBinary(mobile)
    mobile.send(encodeTransportFrame(pairing.hello), { binary: true })
    const completed = await pairing.complete(decodeTransportFrame(await acknowledgement))
    expect(host.status, host.lastError?.message).toBe('paired')

    const encryptedRequest = nextBinary(mobile)
    const asked = ctx.approval.request({
      agent: agentOf(ctx),
      toolName: 'bash',
      reason: 'Run the verified test command',
    })
    const desktopRequest = await desktopClient.waitFor('approval/requested')
    const payload = await completed.channel.open(decodeTransportFrame(await encryptedRequest))
    expect(payload).toMatchObject({
      type: 'approval-event',
      event: { type: 'approval/requested', toolName: 'bash' },
    })
    const event = (payload as { event: { approvalId: string } }).event
    const envelope = await completed.channel.seal({
      version: 1,
      type: 'approval-decision',
      decision: { approvalId: event.approvalId, outcome: 'allowed-once' },
    })
    mobile.send(encodeTransportFrame(envelope), { binary: true })

    await expect(asked).resolves.toBe('allowed-once')
    await expect(desktopClient.waitFor('approval/resolved')).resolves.toMatchObject({
      payload: { type: 'approval/resolved', outcome: 'allowed-once' },
    })
    expect(desktopRequest.payload).toMatchObject({ approvalId: event.approvalId })

    mobile.close()
    host.close()
    bridgeAbort.abort()
    desktopAbort.abort()
    await bridgeRun
  })
})
