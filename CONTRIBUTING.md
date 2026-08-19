# Contributing

Thank you for helping improve DSH Live. Keep changes focused on the secure
mobile approval workflow and make every behavior independently reproducible.

## Development setup

```bash
pnpm install --frozen-lockfile
pnpm run check
pnpm run build
pnpm pack
```

Use Node.js `^22.19.0` or `>=24.0.0` and pnpm `11.22.0`. Do not commit API keys,
QR fragments, private prompts, production Relay logs, or generated local DSH
homes.

## Pull requests

- Explain the user problem and keep the patch narrowly scoped.
- Add or update tests for behavior changes.
- Document new environment variables and deployment requirements.
- Preserve desktop approval authority and fail-closed behavior.
- Treat protocol changes as versioned security changes, not refactors.
- Run `pnpm run check`, `pnpm run build`, and `git diff --check`.

Large features should start with an issue that states the security impact and
acceptance test. Use private vulnerability reporting for security defects; see
[SECURITY.md](SECURITY.md).
