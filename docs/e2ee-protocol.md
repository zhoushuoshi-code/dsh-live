# QR pairing and end-to-end encryption protocol

## Status

Protocol version: `1`  
Implementation status: tested protocol and WebSocket adapter; public hosted instance not deployed
Cryptographic API: Web Crypto, supported by current Node.js, Safari, and Chrome

## Security objective

The DSH Host and the paired phone are the only endpoints that can read or create authenticated application payloads. A hosted relay forwards opaque frames and must not receive the QR secret, private keys, plaintext approvals, prompts, commands, images, or results.

The relay necessarily observes transport metadata: room identifier, endpoint role, connection times, message timing, message sizes, and IP addresses. DSH Live does not claim traffic-analysis resistance or anonymity.

## QR invitation

The Host creates:

- a fresh P-256 ECDH key pair;
- a random 128-bit room identifier;
- a random 256-bit pairing secret;
- a five-minute expiry, with a hard ten-minute maximum.

The QR encodes an HTTPS mobile-app URL. All secret invitation fields are encoded after `#`:

```text
https://mobile.example/pair#pair=<base64url invitation>
```

URL fragments are not included in the browser's HTTP request. The mobile application must not load third-party scripts that could read `location.hash`, and it must clear the fragment from visible browser history immediately after parsing.

The invitation is consumed exactly once. The Host rejects a second or concurrent successful handshake and rejects all attempts after expiry.

## Encrypted handshake

The phone generates a fresh non-extractable P-256 private key for every connection. Its public key, random challenge, timestamp, and protocol marker are encrypted with AES-256-GCM before crossing the relay.

The handshake key is derived with HKDF-SHA-256:

```text
IKM  = 256-bit QR pairing secret
salt = 128-bit room identifier
info = "dsh-live/v1/pairing-hello"
```

The relay-visible hello contains only:

```json
{
  "version": 1,
  "type": "pairing-hello",
  "roomId": "...",
  "nonce": "...",
  "ciphertext": "..."
}
```

After decrypting the hello, the Host derives the ECDH shared secret. Session material is derived with HKDF-SHA-256 using the QR secret as salt and a transcript binding the protocol version, room identifier, Host public key, and mobile public key.

The Host returns an encrypted acknowledgement containing the phone challenge and a fresh connection identifier. The phone accepts the session only when the authenticated challenge matches.

## Session keys and nonces

HKDF produces independent material for:

- mobile-to-Host AES-256-GCM key;
- Host-to-mobile AES-256-GCM key;
- mobile-to-Host 32-bit nonce prefix;
- Host-to-mobile 32-bit nonce prefix.

Each direction owns a 64-bit counter. The 96-bit AES-GCM nonce is:

```text
32-bit derived direction prefix || 64-bit big-endian sequence
```

Concurrent operations are serialized inside each endpoint before reading or advancing its counter. The protocol therefore never uses the same key/nonce pair twice. The phone's ECDH key is regenerated for every connection, so reconnecting derives new session material.

Protocol version, room, direction, and sequence are authenticated as AES-GCM additional data. The receiver accepts exactly its next expected sequence. Replayed, skipped, reordered, wrong-direction, modified, or cross-room frames fail closed.

## Relay behavior

`BlindRelayRoom` holds at most one Host peer and one mobile peer. It:

- forwards copied opaque byte arrays;
- does not parse JSON or protocol fields;
- has no plaintext, decryption key, persistence, or message logging interface;
- rejects empty and oversized frames;
- rejects silent replacement of an occupied Host or mobile role;
- releases peer references on disconnect.

The deployment adapter must preserve these constraints. Operational logs may contain room-safe metrics but must never include WebSocket frame bodies, URLs with fragments, headers carrying credentials, or query strings containing secrets.

## Threat model

Protected against:

- passive relay or network inspection of application payloads;
- malicious modification of ciphertext or authenticated metadata;
- replay and out-of-order delivery;
- a phone that does not possess the QR secret;
- concurrent use of the same one-time QR;
- late messages from an expired or resolved approval;
- accidental trust in a phone-provided Harness `rpcId` or `sessionId`.

Not protected against:

- a compromised Host or phone;
- malicious code running in the mobile application's origin;
- screenshots or cameras observing the QR;
- denial of service, traffic analysis, or relay message dropping;
- secrets copied from browser history before the mobile app clears the fragment;
- future cryptanalytic breaks in P-256, HKDF-SHA-256, or AES-256-GCM.

## Required deployment controls

1. Serve the PWA only over HTTPS and the relay only over WSS.
2. Apply a strict Content Security Policy and ship no third-party analytics on the pairing route.
3. Remove the pairing fragment with `history.replaceState()` immediately after parsing.
4. Never serialize either endpoint's private key.
5. Keep invitations in Host memory only and expire them after five minutes.
6. Rate-limit room connections and frame volume without inspecting frame contents.
7. Disable body logging at the CDN, Worker, Durable Object, and application layers.
8. Run the protocol test suite on every release.

## Verification

Run:

```bash
pnpm run check
```

The test suite covers QR fragment isolation, QR SVG generation, encrypted public-key handshake, bidirectional encryption, concurrent-send nonce safety, wrong-secret rejection, tampering, replay, wrong direction, invitation expiry, one-time and concurrent consumption, malformed wire input, opaque relay forwarding, role replacement, frame limits, and disconnect cleanup.
