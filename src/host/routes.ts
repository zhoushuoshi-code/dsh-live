import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebServer } from '@deepseek-ai/dsh-host-webserver'
import type { HostPairingController, PairingView } from './controller.js'

const HEADERS = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
} as const

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function dashboard(view: PairingView): string {
  const expires = new Date(view.expiresAt).toLocaleTimeString()
  const paired = view.status === 'paired'
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="3"><title>Pair phone · DSH Live</title><style>
  :root{color-scheme:dark;font-family:Inter,system-ui,sans-serif;background:#090b12;color:#f6f7fb}*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:radial-gradient(circle at 75% 0,#24316a,transparent 34%),#090b12}.card{width:min(94vw,920px);display:grid;grid-template-columns:1.1fr .9fr;gap:54px;align-items:center;padding:54px;border:1px solid #ffffff1c;border-radius:34px;background:#111520e8;box-shadow:0 30px 100px #0009}.eyebrow{color:#8591bb;font-size:12px;font-weight:800;letter-spacing:.18em}.mark{display:inline-grid;place-items:center;width:42px;height:42px;margin-bottom:34px;border-radius:13px;background:linear-gradient(145deg,#8291ff,#3de0b0);color:#07100f;font-weight:950}h1{font-size:52px;line-height:1;margin:12px 0 18px;letter-spacing:-.055em}h1 span{background:linear-gradient(90deg,#8997ff,#42e0b2);color:transparent;background-clip:text}.copy{color:#9ca4ba;line-height:1.65}.status{display:inline-flex;align-items:center;gap:9px;margin:20px 0;padding:9px 13px;border:1px solid #ffffff18;border-radius:999px;color:#ccd1df;font-size:13px}.dot{width:8px;height:8px;border-radius:50%;background:${paired ? '#3de0b0' : '#f2b653'};box-shadow:0 0 14px currentColor}.qr{padding:24px;border-radius:28px;background:#fff}.qr svg{display:block;width:100%;height:auto}form{margin-top:24px}button{padding:13px 17px;border:0;border-radius:13px;background:#272c3b;color:#f3f5f9;font:inherit;font-weight:750;cursor:pointer}.meta{color:#747d98;font-size:12px}@media(max-width:760px){.card{grid-template-columns:1fr;padding:30px;gap:26px}h1{font-size:40px}.qr{max-width:390px}}
  </style></head><body><main class="card"><section><div class="mark">D</div><div class="eyebrow">DSH LIVE · SECURE PAIRING</div><h1>Your agent calls.<br><span>You decide.</span></h1><p class="copy">${paired ? 'Your phone is paired with end-to-end encryption. Approval payloads remain unreadable to the relay.' : 'Scan with your iPhone or Android camera. The invitation expires in five minutes and can pair exactly one phone. The QR secret never reaches the relay.'}</p><div class="status"><span class="dot"></span>${escapeHtml(view.status.replaceAll('-', ' '))}</div><p class="meta">${paired ? 'Connected · Desktop approval remains authoritative' : `Expires at ${escapeHtml(expires)} · Desktop approval remains authoritative`}</p><form method="post" action="/dsh-live/regenerate"><button type="submit">${paired ? 'Disconnect and pair another phone' : 'Generate a new secure code'}</button></form></section><section class="qr">${paired ? '<div style="padding:80px 24px;text-align:center;color:#17211f"><div style="font-size:64px">✓</div><strong>Phone securely paired</strong></div>' : view.qrSvg}</section></main></body></html>`
}

function errorPage(message: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>DSH Live</title><style>:root{color-scheme:dark;font-family:system-ui;background:#090b12;color:#fff}body{min-height:100vh;display:grid;place-items:center;margin:0}main{max-width:680px;padding:40px;border:1px solid #ffffff1f;border-radius:24px;background:#131722}p{color:#a9b0c2;line-height:1.6}code{color:#54dfb5}</style></head><body><main><h1>DSH Live is not connected</h1><p>${escapeHtml(message)}</p><p>Configure both <code>mobileAppUrl</code> and <code>relayUrl</code> in the dsh-live plugin entry, then restart DSH Web.</p></main></body></html>`
}

function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin
  const host = req.headers.host
  if (origin === undefined || host === undefined) return false
  try { return new URL(origin).host === host } catch { return false }
}

/** Register the desktop pairing surface through the official DSH WebServer. */
export function registerHostRoutes(
  webServer: WebServer,
  controller: HostPairingController | undefined,
): () => void {
  const removePage = webServer.register({
    kind: 'exact',
    path: '/dsh-live',
    async handler(_req, res) {
      if (controller === undefined) {
        res.writeHead(503, { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' })
        res.end(errorPage('The mobile and relay URLs are not configured.'))
        return
      }
      try {
        const view = await controller.pairing()
        res.writeHead(200, { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' })
        res.end(dashboard(view))
      } catch {
        res.writeHead(503, { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8' })
        res.end(errorPage('The encrypted relay connection could not be established.'))
      }
    },
  })
  const removeRegenerate = webServer.register({
    kind: 'exact',
    path: '/dsh-live/regenerate',
    async handler(req: IncomingMessage, res: ServerResponse) {
      if (req.method !== 'POST' || !sameOrigin(req) || controller === undefined) {
        res.writeHead(403, HEADERS)
        res.end('Forbidden')
        return
      }
      try {
        await controller.regenerate()
        res.writeHead(303, { ...HEADERS, Location: '/dsh-live' })
        res.end()
      } catch {
        res.writeHead(503, HEADERS)
        res.end('Relay unavailable')
      }
    },
  })
  return () => { removeRegenerate(); removePage() }
}
