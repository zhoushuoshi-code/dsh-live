import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { decodeBase64Url } from '../crypto/base64url.js';
import { BlindRelayError, BlindRelayRoom } from './blind-room.js';
import { MAX_TRANSPORT_FRAME_BYTES } from '../transport/wire.js';
const SECURITY_HEADERS = {
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self' wss: ws:; img-src 'self'; manifest-src 'self'; worker-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
};
const STATIC_FILES = {
    '/pair': { file: 'index.html', type: 'text/html; charset=utf-8' },
    '/mobile/main.js': { file: 'mobile/main.js', type: 'text/javascript; charset=utf-8' },
    '/src/crypto/protocol.js': { file: 'src/crypto/protocol.js', type: 'text/javascript; charset=utf-8' },
    '/src/crypto/base64url.js': { file: 'src/crypto/base64url.js', type: 'text/javascript; charset=utf-8' },
    '/src/transport/wire.js': { file: 'src/transport/wire.js', type: 'text/javascript; charset=utf-8' },
    '/styles.css': { file: 'styles.css', type: 'text/css; charset=utf-8' },
    '/manifest.webmanifest': { file: 'manifest.webmanifest', type: 'application/manifest+json' },
    '/sw.js': { file: 'sw.js', type: 'text/javascript; charset=utf-8' },
    '/icon.svg': { file: 'icon.svg', type: 'image/svg+xml' },
};
/** Deployable HTTP + WebSocket adapter that never parses forwarded frame bodies. */
export async function startBlindRelayServer(options = {}) {
    const host = options.host ?? '127.0.0.1';
    const port = options.port ?? 8787;
    const publicDir = options.publicDir
        ?? fileURLToPath(new URL('../../mobile-dist/', import.meta.url));
    const maxRooms = options.maxRooms ?? 10_000;
    const roomIdleMs = options.roomIdleMs ?? 30 * 60 * 1000;
    const maxFrameBytes = options.maxFrameBytes ?? MAX_TRANSPORT_FRAME_BYTES;
    if (!Number.isSafeInteger(maxRooms) || maxRooms <= 0)
        throw new RangeError('maxRooms must be positive');
    if (!Number.isSafeInteger(roomIdleMs) || roomIdleMs <= 0)
        throw new RangeError('roomIdleMs must be positive');
    if (options.publicOrigin !== undefined) {
        const origin = new URL(options.publicOrigin);
        if (origin.origin !== options.publicOrigin || (origin.protocol !== 'https:' && origin.protocol !== 'http:')) {
            throw new Error('publicOrigin must be an exact HTTP(S) origin without a path');
        }
    }
    const rooms = new Map();
    const sockets = new Set();
    const webSockets = new WebSocketServer({ noServer: true, maxPayload: maxFrameBytes, perMessageDeflate: false });
    const expire = (roomId) => {
        const active = rooms.get(roomId);
        if (active === undefined)
            return;
        active.room.close(1001, 'room expired');
        clearTimeout(active.timer);
        rooms.delete(roomId);
    };
    const touch = (roomId, active) => {
        clearTimeout(active.timer);
        active.timer = setTimeout(() => { expire(roomId); }, roomIdleMs);
        active.timer.unref?.();
    };
    const roomFor = (roomId) => {
        const existing = rooms.get(roomId);
        if (existing !== undefined) {
            touch(roomId, existing);
            return existing;
        }
        if (rooms.size >= maxRooms)
            throw new Error('relay capacity reached');
        const active = {
            room: new BlindRelayRoom(maxFrameBytes),
            timer: setTimeout(() => { expire(roomId); }, roomIdleMs),
        };
        active.timer.unref?.();
        rooms.set(roomId, active);
        return active;
    };
    const server = createServer(async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://relay.invalid');
        if (req.method === 'GET' && url.pathname === '/healthz') {
            res.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' });
            res.end('{"ok":true}');
            return;
        }
        const asset = req.method === 'GET' ? STATIC_FILES[url.pathname] : undefined;
        if (asset === undefined) {
            res.writeHead(404, SECURITY_HEADERS);
            res.end('Not found');
            return;
        }
        try {
            const body = await readFile(join(publicDir, asset.file));
            res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': asset.type });
            res.end(body);
        }
        catch {
            res.writeHead(503, SECURITY_HEADERS);
            res.end('Mobile assets are not built. Run pnpm build.');
        }
    });
    server.on('upgrade', (req, socket, head) => {
        let url;
        try {
            url = new URL(req.url ?? '/', 'http://relay.invalid');
            if (url.pathname !== '/v1/connect')
                throw new Error('unknown upgrade path');
            const roomId = url.searchParams.get('roomId');
            const role = url.searchParams.get('role');
            if (roomId === null || (role !== 'host' && role !== 'mobile'))
                throw new Error('invalid route');
            decodeBase64Url(roomId, 16);
            if (role === 'mobile' && options.publicOrigin !== undefined
                && req.headers.origin !== options.publicOrigin)
                throw new Error('origin rejected');
            const active = roomFor(roomId);
            webSockets.handleUpgrade(req, socket, head, (ws) => {
                sockets.add(ws);
                let connection;
                try {
                    connection = active.room.connect(role, {
                        send(data) {
                            if (ws.readyState !== WebSocket.OPEN)
                                return;
                            ws.send(data, { binary: true, compress: false });
                        },
                        close(code, reason) { ws.close(code, reason); },
                    });
                }
                catch (error) {
                    const reason = error instanceof BlindRelayError ? error.code : 'relay rejected connection';
                    ws.close(1008, reason);
                    return;
                }
                ws.on('message', (data, isBinary) => {
                    if (!isBinary) {
                        ws.close(1003, 'binary frames required');
                        return;
                    }
                    touch(roomId, active);
                    const bytes = data instanceof ArrayBuffer
                        ? new Uint8Array(data)
                        : Array.isArray(data)
                            ? Uint8Array.from(Buffer.concat(data))
                            : Uint8Array.from(data);
                    void connection.forward(bytes).catch((error) => {
                        const reason = error instanceof BlindRelayError ? error.code : 'relay forwarding failed';
                        ws.close(1009, reason);
                    });
                });
                ws.once('close', () => {
                    sockets.delete(ws);
                    connection.disconnect();
                    // One endpoint disappearing invalidates this ephemeral room. Closing
                    // its peer lets the Host generate a fresh one-time QR immediately.
                    expire(roomId);
                });
            });
        }
        catch {
            socket.destroy();
        }
    });
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
            server.off('error', reject);
            resolve();
        });
    });
    const address = server.address();
    if (address === null || typeof address === 'string')
        throw new Error('relay failed to bind');
    const displayHost = host === '0.0.0.0' ? '127.0.0.1' : host;
    return {
        host,
        port: address.port,
        httpUrl: `http://${displayHost}:${String(address.port)}`,
        wsUrl: `ws://${displayHost}:${String(address.port)}/v1/connect`,
        async close() {
            for (const active of rooms.values())
                active.room.close(1001, 'relay stopping');
            rooms.clear();
            for (const ws of sockets)
                ws.terminate();
            await new Promise((resolve, reject) => {
                server.close(error => { if (error === undefined)
                    resolve();
                else
                    reject(error); });
            });
            webSockets.close();
        },
    };
}
//# sourceMappingURL=server.js.map