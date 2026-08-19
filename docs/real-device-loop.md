# Real-device approval loop

## What is implemented

The minimum vertical slice is wired end to end:

```text
DSH ApprovalBridge
  -> HostRelaySession
  -> AES-256-GCM binary envelope
  -> Blind WSS relay
  -> mobile approval inbox
  -> encrypted allow-once/reject
  -> official ApiProxy pending approval
```

The desktop approval remains open throughout. The first valid desktop or mobile decision wins, and a mobile or relay disconnect never converts into approval.

## 1. Build the repository

```bash
pnpm install
pnpm run check
pnpm run build
```

## 2. Deploy the relay

The included relay serves both the mobile PWA and `/v1/connect`. In production it must sit behind an HTTPS reverse proxy whose public WebSocket URL uses `wss://`.

For a click-by-click hosted setup with a free Railway hostname, environment
variables, custom-domain instructions, cost controls, and troubleshooting, see
[Deploy your own Relay on Railway](deploy-railway.md).

```bash
docker build -t dsh-live-relay .
docker run --rm -p 8787:8787 \
  -e PUBLIC_ORIGIN=https://live.example.com \
  dsh-live-relay
```

Configure the platform or reverse proxy:

- `https://live.example.com/pair` -> container port `8787`
- `wss://live.example.com/v1/connect` -> container port `8787`, with WebSocket upgrades enabled
- `/healthz` -> health check
- disable request URL, body, and WebSocket-frame logging
- do not put secrets in query strings or headers

Runtime variables:

| Variable | Default | Meaning |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | Relay listen interface |
| `PORT` | `8787` | Relay listen port |
| `PUBLIC_ORIGIN` | unset | Exact allowed browser origin for Mobile-role sockets |
| `MAX_ROOMS` | `10000` | In-memory room ceiling |
| `ROOM_IDLE_MS` | `1800000` | Idle room lifetime |

For real phones, a publicly trusted HTTPS certificate is required. Plain LAN HTTP and untrusted self-signed certificates are not a supported production path.

## 3. Install and configure the plugin

From a built checkout:

```bash
pnpm pack
dsh plugin --profile web add ./dsh-live-0.0.0.tgz
```

Edit the Web profile's `cordis.patch.yml`:

```yaml
- id: dsh-live
  config:
    mobileAppUrl: https://live.example.com/pair
    relayUrl: wss://live.example.com/v1/connect
```

Then start DSH:

```bash
dsh web
```

Open the DSH URL followed by `/dsh-live`, for example:

```text
http://127.0.0.1:3000/dsh-live
```

## 4. Real-device acceptance

1. Open `/dsh-live` on the desktop and scan the QR with the iPhone or Android system camera.
2. Confirm the desktop changes from `waiting for phone` to `paired` and hides the QR.
3. Trigger a DSH tool action that requires approval.
4. Confirm the same tool name and reason appear on desktop and phone.
5. Tap **Allow once** on the phone and confirm the tool executes exactly once.
6. Repeat with **Reject** and confirm the tool does not execute.
7. Race desktop and phone decisions and confirm exactly one wins.
8. Disconnect the phone and confirm desktop approval remains usable.
9. Search relay logs for the tool name and reason; neither may appear.

## Security boundary

The relay sees room ID, role, IP address, connection time, frame size, and timing. It does not receive the QR secret, private keys, prompts, tool names, reasons, decisions, images, or results. DSH Live does not provide anonymity or traffic-analysis resistance.
