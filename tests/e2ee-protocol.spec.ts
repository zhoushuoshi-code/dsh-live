import { describe, expect, it } from 'vitest'
import {
  createHostPairing,
  createMobilePairing,
  E2eeProtocolError,
  parsePairingUrl,
  type CipherEnvelope,
  type PairingInvitation,
} from '../src/crypto/protocol.js'
import { renderPairingQrSvg } from '../src/crypto/qr.js'

const NOW = 1_787_130_000_000

async function paired(): Promise<{
  host: Awaited<ReturnType<typeof createHostPairing>>
  hostChannel: Awaited<ReturnType<Awaited<ReturnType<typeof createHostPairing>>['accept']>>['channel']
  mobileChannel: Awaited<ReturnType<Awaited<ReturnType<typeof createMobilePairing>>['complete']>>['channel']
}> {
  const host = await createHostPairing({
    mobileAppUrl: 'https://live.example.test/pair',
    relayUrl: 'wss://relay.example.test/v1/connect',
    now: NOW,
  })
  const mobile = await createMobilePairing(parsePairingUrl(host.pairingUrl, NOW), NOW)
  const accepted = await host.accept(mobile.hello, NOW)
  const completed = await mobile.complete(accepted.acknowledgement)
  expect(completed.connectionId).toBe(accepted.connectionId)
  return { host, hostChannel: accepted.channel, mobileChannel: completed.channel }
}

function changed(value: string): string {
  const replacement = value.at(-1) === 'A' ? 'B' : 'A'
  return value.slice(0, -1) + replacement
}

describe('QR pairing and end-to-end encrypted channel', () => {
  it('keeps the invitation secret in the URL fragment and renders a QR SVG', async () => {
    const host = await createHostPairing({
      mobileAppUrl: 'https://live.example.test/pair?source=dsh',
      relayUrl: 'wss://relay.example.test/v1/connect',
      now: NOW,
    })
    const url = new URL(host.pairingUrl)
    const networkRequestUrl = `${url.origin}${url.pathname}${url.search}`

    expect(url.hash).toContain('pair=')
    expect(networkRequestUrl).not.toContain(host.invitation.secret)
    expect(networkRequestUrl).not.toContain(host.invitation.hostPublicKey)
    expect(parsePairingUrl(host.pairingUrl, NOW)).toEqual(host.invitation)
    await expect(renderPairingQrSvg(host.pairingUrl)).resolves.toMatch(/^<svg/u)
  })

  it('hides the mobile public key and all pairing payload fields from the relay', async () => {
    const host = await createHostPairing({
      mobileAppUrl: 'https://live.example.test/pair',
      relayUrl: 'wss://relay.example.test/v1/connect',
      now: NOW,
    })
    const invitation = parsePairingUrl(host.pairingUrl, NOW)
    const mobile = await createMobilePairing(invitation, NOW)
    const relayView = JSON.stringify(mobile.hello)

    expect(Object.keys(mobile.hello).sort()).toEqual([
      'ciphertext', 'nonce', 'roomId', 'type', 'version',
    ])
    expect(relayView).not.toContain(invitation.secret)
    expect(relayView).not.toContain(invitation.hostPublicKey)
    expect(relayView).not.toContain('pair-request')
    expect(relayView).not.toContain('mobilePublicKey')
  })

  it('encrypts and authenticates messages in both directions with different keys', async () => {
    const { host, hostChannel, mobileChannel } = await paired()
    const mobilePlaintext = { type: 'approval/decision', approvalId: 'approval-7', outcome: 'allowed-once' }
    const hostPlaintext = { type: 'approval/resolved', approvalId: 'approval-7', outcome: 'allowed-once' }

    const mobileEnvelope = await mobileChannel.seal(mobilePlaintext)
    const hostEnvelope = await hostChannel.seal(hostPlaintext)
    expect(JSON.stringify(mobileEnvelope)).not.toContain('allowed-once')
    expect(JSON.stringify(hostEnvelope)).not.toContain('allowed-once')
    expect(mobileEnvelope.ciphertext).not.toBe(hostEnvelope.ciphertext)
    expect(mobileEnvelope.roomId).toBe(host.invitation.roomId)
    await expect(hostChannel.open(mobileEnvelope)).resolves.toEqual(mobilePlaintext)
    await expect(mobileChannel.open(hostEnvelope)).resolves.toEqual(hostPlaintext)
  })

  it('serializes concurrent sends so an AES-GCM nonce is never reused', async () => {
    const { hostChannel, mobileChannel } = await paired()
    const envelopes = await Promise.all([
      mobileChannel.seal({ message: 'first' }),
      mobileChannel.seal({ message: 'second' }),
      mobileChannel.seal({ message: 'third' }),
    ])

    expect(envelopes.map(envelope => envelope.sequence)).toEqual(['0', '1', '2'])
    await expect(Promise.all(envelopes.map(envelope => hostChannel.open(envelope)))).resolves.toEqual([
      { message: 'first' },
      { message: 'second' },
      { message: 'third' },
    ])
  })

  it('rejects replay, wrong direction, and ciphertext tampering without advancing receive state', async () => {
    const { hostChannel, mobileChannel } = await paired()
    const first = await mobileChannel.seal({ message: 'first' })
    await expect(mobileChannel.open(first)).rejects.toMatchObject<E2eeProtocolError>({
      code: 'unexpected-direction',
    })
    await expect(hostChannel.open(first)).resolves.toEqual({ message: 'first' })
    await expect(hostChannel.open(first)).rejects.toMatchObject<E2eeProtocolError>({
      code: 'unexpected-sequence',
    })

    const second = await mobileChannel.seal({ message: 'second' })
    const tampered: CipherEnvelope = { ...second, ciphertext: changed(second.ciphertext) }
    await expect(hostChannel.open(tampered)).rejects.toMatchObject<E2eeProtocolError>({
      code: 'authentication-failed',
    })
    await expect(hostChannel.open(second)).resolves.toEqual({ message: 'second' })
  })

  it('rejects a phone that does not possess the QR secret', async () => {
    const host = await createHostPairing({
      mobileAppUrl: 'https://live.example.test/pair',
      relayUrl: 'wss://relay.example.test/v1/connect',
      now: NOW,
    })
    const invitation = parsePairingUrl(host.pairingUrl, NOW)
    const wrongInvitation: PairingInvitation = {
      ...invitation,
      secret: `${invitation.secret[0] === 'A' ? 'B' : 'A'}${invitation.secret.slice(1)}`,
    }
    const attacker = await createMobilePairing(wrongInvitation, NOW)

    await expect(host.accept(attacker.hello, NOW)).rejects.toMatchObject<E2eeProtocolError>({
      code: 'authentication-failed',
    })
  })

  it('expires invitations and consumes a successful invitation exactly once', async () => {
    const host = await createHostPairing({
      mobileAppUrl: 'https://live.example.test/pair',
      relayUrl: 'wss://relay.example.test/v1/connect',
      now: NOW,
      ttlMs: 1_000,
    })
    const mobile = await createMobilePairing(parsePairingUrl(host.pairingUrl, NOW), NOW)
    await host.accept(mobile.hello, NOW)
    await expect(host.accept(mobile.hello, NOW)).rejects.toMatchObject<E2eeProtocolError>({
      code: 'invitation-used',
    })
    expect(() => parsePairingUrl(host.pairingUrl, NOW + 1_000)).toThrowError(
      expect.objectContaining({ code: 'invitation-expired' }),
    )
  })

  it('accepts only one of two concurrent handshakes for the same QR', async () => {
    const host = await createHostPairing({
      mobileAppUrl: 'https://live.example.test/pair',
      relayUrl: 'wss://relay.example.test/v1/connect',
      now: NOW,
    })
    const invitation = parsePairingUrl(host.pairingUrl, NOW)
    const firstMobile = await createMobilePairing(invitation, NOW)
    const secondMobile = await createMobilePairing(invitation, NOW)
    const results = await Promise.allSettled([
      host.accept(firstMobile.hello, NOW),
      host.accept(secondMobile.hello, NOW),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ code: 'invitation-used' }),
    })
  })

  it('normalizes malformed wire input and non-JSON payloads into protocol errors', async () => {
    const host = await createHostPairing({
      mobileAppUrl: 'https://live.example.test/pair',
      relayUrl: 'wss://relay.example.test/v1/connect',
      now: NOW,
    })
    await expect(host.accept({ type: 'pairing-hello' }, NOW)).rejects.toMatchObject<E2eeProtocolError>({
      code: 'invalid-message',
    })
    const { hostChannel, mobileChannel } = await paired()
    await expect(hostChannel.open({ type: 'ciphertext' })).rejects.toMatchObject<E2eeProtocolError>({
      code: 'invalid-message',
    })
    await expect(mobileChannel.seal(undefined)).rejects.toMatchObject<E2eeProtocolError>({
      code: 'invalid-message',
    })
  })
})
