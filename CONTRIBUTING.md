# Contributing

## Development setup

1. Install dependencies in this directory.
2. Build with npm run build.
3. Validate bridge outbound behavior with npm run validate:outbound.
4. Validate session routing with npm run validate:session-routing when a local Thou bridge and gateway are available.

## Scope guardrails

- Keep the public MVP boundary limited to Recruit, Dismiss, and Connect iPhone.
- Do not expand Agent Team into a full control console as part of the first release.
- Treat Tailnet remote access as the primary path unless the product boundary changes.

## Pull requests

- Keep changes focused and minimal.
- Update README or CHANGELOG when public behavior changes.
- Include the narrowest validation you ran.