# Changelog

## 0.1.0

- First public MVP boundary for the Thou native OpenClaw channel plugin.
- Agent Team GUI now ships with Recruit, Dismiss, and Connect iPhone tabs.
- GUI responses disable caching and refresh stale connection artifacts to reduce old-page and stale-token failures.
- Package metadata now includes ClawHub compatibility declarations and runtime publish whitelist.

## Known limits in 0.1.0

- Tailnet remains the primary remote path.
- Thou still uses ws transport, so the iOS app keeps ATS relaxed in development builds.
- Group chat and meeting flows are intentionally out of the MVP scope.