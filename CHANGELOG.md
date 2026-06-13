# Changelog

## 0.2.0

- Redesigned agent role templates from abstract thinking styles (Planner/Builder/Reviewer) to business operating roles (Scout/Operator/Auditor) targeted at solo entrepreneurs.
- Scout handles pre-decision uncertainty — research, pressure-testing assumptions, opportunity scanning, and market understanding.
- Operator handles execution and daily operations — task tracking, communication drafts, record-keeping, releases, and operational follow-through.
- Auditor handles constraints, risk, and quality — licensing, pricing guardrails, commitment review, delivery integrity, and pre-mortem checks.
- Each role template now includes clear ownership boundaries ("What I Own / What I Don't Own") and lightweight escalation conditions for pulling in other roles.
- Bundled avatar SVGs updated to match new roles: telescope for Scout, gear for Operator, shield for Auditor.
- Template prototype documents (IDENTITY.md, SOUL.md, USER.md) rewritten to reflect role-based operating team semantics.
- AGENTS.md updated with accurate memory system documentation: workspace root files are auto-injected by OpenClaw runtime, while `memory/` daily logs are session archives requiring active reads.

## 0.1.0

- First public MVP boundary for the Thou native OpenClaw channel plugin.
- Agent Team GUI now ships with Recruit, Dismiss, and Connect iPhone tabs.
- GUI responses disable caching and refresh stale connection artifacts to reduce old-page and stale-token failures.
- Package metadata now includes ClawHub compatibility declarations and runtime publish whitelist.

## Known limits in 0.1.0

- Tailnet remains the primary remote path.
- Thou still uses ws transport, so the iOS app keeps ATS relaxed in development builds.
- Group chat and meeting flows are intentionally out of the MVP scope.