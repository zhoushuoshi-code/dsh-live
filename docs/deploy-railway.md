# Deploy your own Relay on Railway

This beginner guide deploys one private DSH Live Relay from the public GitHub
repository. The Relay serves both the mobile PWA and its encrypted WebSocket
transport. No database, DeepSeek API key, QR secret, or encryption key is
stored in Railway.

> [!IMPORTANT]
> DSH Live is a preview. Deploy one replica for development and real-device
> testing. Relay Ping/Pong frames keep idle network paths active, but the
> current release has no background Push Notification and a phone OS may still
> suspend a background PWA. Keep it in the foreground during acceptance.

## What this costs

Railway provides a generated `*.up.railway.app` hostname, HTTPS certificate,
and WSS endpoint, so a custom domain is not required. Railway plan names and
prices can change; check the [official pricing page](https://railway.com/pricing)
before upgrading. Set usage alerts before inviting other users.

You need:

- a GitHub account;
- a Railway account;
- a supported DeepSeek Harness checkout on the desktop;
- an iPhone or Android phone for acceptance testing.

You do **not** need a database, Redis, object storage, inbound port on the
desktop, or DeepSeek credentials on the Relay.

## 1. Create the Railway service

1. Sign in to [Railway](https://railway.com/) with GitHub.
2. Select **New Project**.
3. Select **GitHub Repository**.
4. Choose `zhoushuoshi-code/dsh-live`.
5. If the repository is missing, choose **Configure GitHub App**, grant access
   to `dsh-live`, then return to Railway.

Railway should detect the root `Dockerfile`. Keep these build settings:

| Setting | Value |
| --- | --- |
| Builder | Dockerfile |
| Dockerfile path | `Dockerfile` |
| Root directory | repository root / empty |
| Build command | empty |
| Start command | empty |
| Replicas | `1` |

The initial process may stop with `PUBLIC_ORIGIN is required in production`.
That is expected until the public hostname is generated and configured.

## 2. Generate the free Railway hostname

Open the new service and find **Settings → Networking → Public Networking**.
Choose **Generate Domain** and copy the resulting HTTPS origin, for example:

```text
https://dsh-live-production.example.up.railway.app
```

The exact navigation labels may change. The required result is one public
HTTPS hostname routed to this service.

## 3. Set runtime variables

Open **Variables** and add:

```dotenv
PUBLIC_ORIGIN=https://dsh-live-production.example.up.railway.app
MAX_ROOMS=1000
ROOM_IDLE_MS=1800000
HEARTBEAT_MS=25000
```

Replace the example origin with the generated hostname. `PUBLIC_ORIGIN` must:

- start with `https://`;
- contain no path such as `/pair`;
- have no trailing slash;
- exactly match the origin displayed in the phone browser.

Do not add a QR secret, encryption key, GitHub token, or DeepSeek API key.
Railway normally supplies `PORT`; the image already uses `HOST=0.0.0.0` and
falls back to port `8787`. Only set `PORT=8787` if the platform does not inject
one and the deployment logs show a port-routing problem.

Changing a variable should trigger a redeploy. Otherwise choose **Redeploy**
from the latest deployment.

## 4. Configure health and capacity

Set the health-check path to:

```text
/healthz
```

Keep exactly one replica and disable scale-to-zero. Rooms live only in process
memory; multiple replicas can send the Host and phone to different processes.
Do not add a persistent volume.

If Railway offers a region near your users, select it. Singapore or Tokyo is a
reasonable first choice for many Asian testers when available. Hosting outside
mainland China avoids operating a mainland server, but it cannot guarantee
mainland network quality.

## 5. Verify the public Relay

Open the health endpoint:

```text
https://YOUR_RAILWAY_HOST/healthz
```

Expected response:

```json
{"ok":true}
```

Then open:

```text
https://YOUR_RAILWAY_HOST/pair
```

The DSH Live shell should load. `Invalid or expired QR code` is expected when
`/pair` was opened directly instead of through a one-time desktop invitation.

If the deployment is unhealthy, inspect the Railway deployment logs. Common
causes are:

| Symptom | Fix |
| --- | --- |
| `PUBLIC_ORIGIN is required` | Add the exact HTTPS origin and redeploy |
| `publicOrigin must be an exact HTTP(S) origin` | Remove `/pair` and the trailing slash |
| Build does not use the repository Dockerfile | Set builder to Dockerfile at the repository root |
| Health check fails while `/pair` works | Set the health path to `/healthz` |
| Phone cannot pair | Confirm `https://` for the app and `wss://` for the Relay |

## 6. Install and point DSH at the Relay

From a built checkout:

```bash
pnpm install
pnpm run check
pnpm run build
pnpm pack
dsh plugin --profile web add ./dsh-live-0.1.0-preview.1.tgz
```

Edit the Web profile's `cordis.patch.yml`:

```yaml
- id: dsh-live
  config:
    mobileAppUrl: https://YOUR_RAILWAY_HOST/pair
    relayUrl: wss://YOUR_RAILWAY_HOST/v1/connect
```

Start DSH and open the pairing page:

```bash
dsh web
```

```text
http://127.0.0.1:3000/dsh-live
```

Scan the QR with the iPhone or Android system camera. Complete every check in
the [real-device acceptance guide](real-device-loop.md#4-real-device-acceptance)
before treating the deployment as usable.

## 7. Add a custom domain later

A custom domain is optional. Prove the full approval loop on the generated
Railway hostname before buying one.

When ready:

1. Buy a domain from a registrar you control.
2. In Railway, choose **Settings → Networking → Custom Domain**.
3. Enter a subdomain such as `live.example.com`.
4. Add the CNAME record Railway displays at your DNS provider.
5. Wait until Railway reports that its TLS certificate is active.
6. Change `PUBLIC_ORIGIN` to `https://live.example.com` and redeploy.
7. Change both URLs in the DSH plugin configuration.
8. Repeat the health, pairing, allow, reject, race, and disconnect tests.

Do not configure both the generated hostname and custom hostname as mobile
origins. The Relay accepts the one exact origin in `PUBLIC_ORIGIN`.

## 8. Cost and security controls

- Enable Railway usage alerts before sharing the URL.
- Keep `MAX_ROOMS` bounded; `1000` is sufficient for an early preview.
- Do not enable multiple replicas until room routing is redesigned.
- Do not enable WebSocket-frame, request-body, or full-query logging.
- Treat Room ID, IP address, connection timing, and frame sizes as metadata.
- Never claim that the Relay provides anonymity or hides traffic patterns.
- A Relay restart disconnects paired phones but must never approve an action or
  disable desktop approval.

The QR secret stays in the URL fragment and is not sent to Railway. Approval
payloads are end-to-end encrypted, but Railway and its network edge can still
observe connection metadata.
