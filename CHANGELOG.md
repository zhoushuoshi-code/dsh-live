# Changelog

All notable changes are documented here. This project uses Semantic
Versioning while protocol compatibility is still preview-quality.

## 0.1.0-preview.1 - 2026-08-19

### Added

- Non-exclusive mobile approval bridge over the official DSH ApiProxy.
- One-time QR pairing with P-256 ECDH, HKDF-SHA-256, and AES-256-GCM.
- Blind binary WebSocket Relay and self-hosted mobile PWA.
- Phone approval inbox with reject and hold-to-allow-once actions.
- Desktop pairing page and Railway deployment guide.
- WebSocket Ping/Pong heartbeat for idle public connections.
- CI, installable package artifact, dependency updates, and security policy.

### Security

- Relay never receives QR secrets or approval plaintext.
- Directional keys, strict sequence numbers, expiry, and authenticated
  encryption reject tampering and replay.
- Desktop approval remains available when the phone or Relay disconnects.

### Known limitations

- No background Push Notification, Live Activity, voice, photo attachment, or
  result-review workflow.
- Rooms are in process memory; production deployments must use one replica.
- Exact compatibility beyond DeepSeek Harness `0.1.0-rc.7` is not guaranteed.
