# Security policy

DSH Live carries remote approval decisions and must be treated as a security
boundary. Do not post vulnerabilities, QR fragments, prompts, API keys, or
decrypted payloads in a public issue.

## Supported versions

The latest `0.1.x` preview is the only supported line while the protocol and
DeepSeek Harness integration are still evolving.

## Report a vulnerability

Use GitHub's
[private vulnerability reporting](https://github.com/zhoushuoshi-code/dsh-live/security/advisories/new).
Include the affected commit or version, impact, reproduction steps, and a
minimal proof of concept with secrets removed. Please allow time for triage
before public disclosure.

High-priority reports include:

- approval without an explicit valid user decision;
- replay, nonce reuse, authentication bypass, or cross-room decryption;
- Relay access to approval plaintext or QR secrets;
- a phone decision affecting a different pending approval;
- mobile disconnect disabling desktop approval;
- remote code execution, path traversal, or secret exposure in the Relay.

## Security boundary

Approval payloads are end-to-end encrypted. A Relay still observes IP
addresses, Room ID, connection role, timing, and frame sizes. DSH Live does not
provide anonymity or traffic-analysis resistance. Self-hosters are responsible
for TLS termination, access logs, rate limiting, dependency updates, and
operational access to their Relay account.
