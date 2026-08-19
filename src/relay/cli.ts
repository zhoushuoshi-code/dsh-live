#!/usr/bin/env node
import { startBlindRelayServer } from './server.js'

function integerEnv(name: string, fallback: number): number {
  const value = process.env[name]
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)
  return parsed
}

const publicOrigin = process.env['PUBLIC_ORIGIN']
if (process.env['NODE_ENV'] === 'production' && publicOrigin === undefined) {
  throw new Error('PUBLIC_ORIGIN is required in production')
}

const relay = await startBlindRelayServer({
  host: process.env['HOST'] ?? '0.0.0.0',
  port: integerEnv('PORT', 8787),
  ...(publicOrigin === undefined ? {} : { publicOrigin }),
  maxRooms: integerEnv('MAX_ROOMS', 10_000),
  roomIdleMs: integerEnv('ROOM_IDLE_MS', 30 * 60 * 1000),
})

console.log(`DSH Live relay listening on ${relay.httpUrl}`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    void relay.close().finally(() => { process.exit(0) })
  })
}
