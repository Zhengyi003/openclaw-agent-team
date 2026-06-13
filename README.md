# OpenClaw Agent Team

[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-brightgreen.svg)](https://www.apache.org/licenses/LICENSE-2.0)

A desktop plugin for [OpenClaw](https://github.com/anthropics/openclaw) that keeps agent creation simple and gives [Thou](https://github.com/Zhengyi003/thou) on iPhone a copy-ready connection line.

## What this plugin does

OpenClaw Agent Team lives at `http://127.0.0.1:38127/agent-team/` on your Mac. It does three things:

1. **Recruit** — create a new work agent through a guided flow that wraps the official OpenClaw CLI. Choose from three role templates (Scout, Operator, Auditor) designed as a lightweight operating team for solo founders.
2. **Dismiss** — scan the current agent roster and remove agents you no longer need.
3. **iPhone Connection** — prepare a single connection line that Thou on iPhone can paste to initiate the bridge.

iPhone Connection is a plugin-side capability that has been verified on the author's device. Public availability depends on Thou's own distribution status — until Thou is publicly available, this tab serves as a preview of the integration.

This plugin does **not** aim to become a full agent control panel, group chat surface, or meeting room. It stays narrow on purpose.

## Quick install

Install from ClawHub (recommended once published):

```
openclaw plugins install clawhub:@zhengyi003/openclaw-agent-team
```

Or install from a local checkout during development:

```
openclaw plugins install --path /path/to/openclaw-agent-team
```

Then open `http://127.0.0.1:38127/agent-team/` in your browser.

## Troubleshooting

If the page won't open after a day or two, check in this order:

1. Confirm the URL is still `http://127.0.0.1:38127/agent-team/`.
2. Make sure no stale local preview process is holding port `38127`.
3. If the page opens but connection details look stale, restart the host gateway (`openclaw gateway restart`) — don't just rebuild the plugin.
4. If connection details are still unavailable, verify Tailscale is running.

## Before publishing

Run these checks before a release:

1. `npm run build`
2. `clawhub package publish <source> --family code-plugin --dry-run`
3. Manual smoke test of Recruit, Dismiss, and iPhone Connection

---

## For contributors

### Architecture overview

The plugin is a TypeScript package structured around four groups:

- **Plugin shell** — `package.json`, `openclaw.plugin.json`, `index.ts`, `setup-entry.ts`
- **Channel & config** — `src/channel/` (entry, base, accounts, types, transport, setup) and `src/setup/`
- **Bridge & runtime** — `src/bridge/` (auth, server, runtime), `src/runtime.ts`, `src/outbound.ts`, `src/connection-share.ts`
- **Agent Team GUI** — `src/gui/` (server, render, state, http, service)

The GUI server runs on loopback only, defaults to port `38127`, and serves the single-page Agent Team workbench.

### Key design decisions

- Agent creation and deletion always go through the official OpenClaw CLI (`openclaw agents add --non-interactive --json`, `openclaw agents delete --force --json`) — the plugin never writes host config directly.
- New agents default to workspace root `~/Documents/OpenClaw`.
- The iPhone connection tab derives its data from the Thou channel bridge runtime, not from a separate probe.
- The bridge server adds active WebSocket heartbeats with pong timeout to shorten the false-online window after a connection drops.

### Build and validate

```bash
npm run build          # compile TypeScript
npm run clean          # remove dist/
npm run validate:outbound          # test outbound delivery through WebSocket bridge
npm run validate:session-routing   # test session routing through bridge + gateway
```

### Source map

| File | Role |
|---|---:|
| `src/channel/base.ts` | Thou channel meta, setup entry, account/config boundary |
| `src/channel/entry.ts` | Security policy, pairing semantics, outbound hooks |
| `src/channel/accounts.ts` | Parse `channels.thou` config into runtime account |
| `src/channel/types.ts` | Channel config and resolved types |
| `src/channel/transport.ts` | Transport boundary — declares current bridge as transitional |
| `src/setup/core.ts` | Setup input validation and config write-back |
| `src/bridge/auth.ts` | Persist account-level auth token in OpenClaw state dir |
| `src/bridge/runtime.ts` | Bind bridge to host account lifecycle |
| `src/bridge/server.ts` | Real WebSocket bridge — device auth, chat, history, sessions |
| `src/runtime.ts` | Plugin runtime reference holder |
| `src/outbound.ts` | Text/media outbound through bridge sender |
| `src/connection-share.ts` | Generate Thou connection payload (Tailnet-preferred) |
| `src/gui/server.ts` | HTTP server, routing, startup |
| `src/gui/render.ts` | Single-page HTML, CSS, and front-end script |
| `src/gui/state.ts` | Shared types and constants |
| `src/gui/http.ts` | Request/response helpers |
| `src/gui/service.ts` | Agent CRUD, connect summary, preview logic |

### Current boundary

What this plugin owns in v0.1:

- Config/account resolution
- Setup input and config persistence
- dmPolicy / allowFrom security surface
- Pairing semantics
- Outbound interface

What this plugin does **not** own (and should not absorb from sidecar):

- Thou private auth.token protocol
- Custom Gateway WebSocket client
- Launch scripts, LAN IP display, magic pairing-code UI

The `chat-start / chat.chunk / chat.done` protocol in `src/bridge/server.ts` is a transitional transport. It will be replaced when OpenClaw exposes a stable channel-level transport surface.

## Roadmap

Transport-layer work planned beyond the current transitional bridge:

1. Inbound node/session binding
2. Device pairing bootstrap
3. Outbound delivery projection
4. Transcript/session history alignment

## Validation scripts

`npm run validate:outbound` — Tests outbound delivery through a real WebSocket bridge, without requiring a full OpenClaw host.

`npm run validate:session-routing` — Tests session creation → message send → sessions.list/chat.history landing on the same session, using the local Thou bridge and Gateway. It verifies that:

1. The plugin outbound entry is no longer a placeholder.
2. Assistant text and media text both flow through the bridge to an authenticated Thou device connection.
3. The bridge sender returns a stable delivery result structure.

### About the `ws` dependency

`ws` is a Node.js WebSocket library used by:

1. `src/bridge/server.ts` — the Thou bridge WebSocket server
2. `scripts/validate-outbound.ts` — the validation script's WebSocket client

It is an npm runtime dependency of the plugin. End users who install through ClawHub or npm do not need to install it separately.

### Thou iOS ATS note

The current bridge uses `ws://` (plain WebSocket). The App Transport Security adjustment belongs to the Thou iOS project, not to this plugin. When Thou moves to `wss://` or ships with the right ATS exception, no user action is needed on the plugin side.
