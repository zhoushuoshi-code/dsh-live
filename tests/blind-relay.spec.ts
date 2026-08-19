import { describe, expect, it, vi } from 'vitest'
import { BlindRelayError, BlindRelayRoom, type RelayPeer } from '../src/relay/blind-room.js'

function peer(received: Uint8Array<ArrayBuffer>[]): RelayPeer {
  return {
    send(data) { received.push(data) },
    close: vi.fn(),
  }
}

describe('blind relay room', () => {
  it('forwards opaque bytes without changing them', async () => {
    const room = new BlindRelayRoom()
    const hostReceived: Uint8Array<ArrayBuffer>[] = []
    const mobileReceived: Uint8Array<ArrayBuffer>[] = []
    const host = room.connect('host', peer(hostReceived))
    const mobile = room.connect('mobile', peer(mobileReceived))
    const ciphertext = new TextEncoder().encode('{"ciphertext":"opaque-AES-GCM-value"}')

    await expect(host.forward(ciphertext)).resolves.toBe('forwarded')
    expect(mobileReceived).toHaveLength(1)
    expect(mobileReceived[0]).toEqual(ciphertext)
    expect(mobileReceived[0]).not.toBe(ciphertext)
    await expect(mobile.forward(Uint8Array.of(1, 2, 3))).resolves.toBe('forwarded')
    expect(hostReceived[0]).toEqual(Uint8Array.of(1, 2, 3))
  })

  it('rejects role replacement and oversized or empty frames', async () => {
    const room = new BlindRelayRoom(3)
    const connection = room.connect('host', peer([]))
    expect(() => room.connect('host', peer([]))).toThrowError(
      expect.objectContaining<Partial<BlindRelayError>>({ code: 'role-occupied' }),
    )
    await expect(connection.forward(new Uint8Array())).rejects.toMatchObject<BlindRelayError>({
      code: 'frame-empty',
    })
    await expect(connection.forward(Uint8Array.of(1, 2, 3, 4))).rejects.toMatchObject<BlindRelayError>({
      code: 'frame-too-large',
    })
  })

  it('does not retain disconnected peers', async () => {
    const room = new BlindRelayRoom()
    const host = room.connect('host', peer([]))
    const mobile = room.connect('mobile', peer([]))
    expect(room.size).toBe(2)
    mobile.disconnect()
    expect(room.size).toBe(1)
    await expect(host.forward(Uint8Array.of(1))).resolves.toBe('peer-offline')
    host.disconnect()
    expect(room.size).toBe(0)
  })
})
