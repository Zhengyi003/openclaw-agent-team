# M1: 上架前收尾

This milestone tracks the final steps before the first public release of OpenClaw Agent Team.

## Completion criteria

Completion does NOT require Thou to be publicly available on the App Store.

1. ClawHub `package publish` executed successfully (post dry-run).
2. Recruit and Dismiss verified and publicly documented.
3. iPhone Connection verified on author's device, documented as preview feature pending Thou availability.
4. README, metadata, and GitHub repo surface finalized.
5. All user-facing text audited in English.

Does **not** include: transport layer completion, group chat, virtual team workflows, i18n language switching.

---

## Issues

### 1. ✅ Rewrite README with layered structure & English audit
**Status: DONE (2026-06-13)**

README rewritten from Chinese technical doc to English layered structure:
- Top: user-facing (what it does, install, troubleshooting)
- Bottom: contributor-facing (architecture, source map, boundaries, dependencies)

Also fixed: workspace path (`~/Documents/OpenClaw`), Connect iPhone wording (preview pending Thou availability), stale entry rules.

### 2. ✅ Create .github/ISSUE_TEMPLATE with bug_report and feature_request
**Status: DONE (2026-06-13)**

Templates created at `.github/ISSUE_TEMPLATE/bug_report.md` and `feature_request.md`.

### 3. ✅ Frame Connect iPhone as preview feature in public text
**Status: DONE (2026-06-13)**

README now states: "iPhone Connection is a plugin-side capability that has been verified on the author's device. Public availability depends on Thou's own distribution status — until Thou is publicly available, this tab serves as a preview of the integration."

### 4. Finalize ClawHub publish metadata
**Status: TODO**

- [ ] Review `package.json` description, keywords, homepage, bugs for publication
- [ ] Verify `openclaw.plugin.json` channel metadata text is publication-ready
- [ ] Confirm the correct `clawhub package publish` command with source path and commit
- [ ] Write English ClawHub listing description

### 5. Execute ClawHub package publish
**Status: TODO**

- [ ] Run `clawhub package publish <source> --family code-plugin --dry-run` one final time
- [ ] Run `clawhub package publish <source> --family code-plugin` for real
- [ ] Verify the plugin entry appears on ClawHub and metadata renders correctly
- [ ] Test install flow: `openclaw plugins install clawhub:@zhengyi003/openclaw-agent-team`

### 6. Finalize GitHub repo public surface
**Status: TODO**

- [ ] Set repo description (short tagline)
- [ ] Set repo topics/tags (openclaw, plugin, agent-team, thou, ios)
- [ ] Verify LICENSE badge and README rendering
- [ ] Confirm issue labels exist (bug, enhancement, documentation)
- [ ] Push .github/ templates to main

### 7. True device smoke test
**Status: TODO**

- [ ] Recruit: create a test agent through the GUI flow
- [ ] Verify agent appears in `openclaw agents list --json`
- [ ] Connect iPhone: verify connection line is copyable and correct (Tailnet host, port 8080)
- [ ] Dismiss: delete the test agent through the GUI flow
- [ ] Verify agent is removed from `openclaw agents list --json`
- [ ] Record results with screenshots

### 8. Go/No-Go release checklist
**Status: TODO**

- [ ] `npm run build` passes
- [ ] `npm run validate:outbound` passes
- [ ] `npm run validate:session-routing` passes
- [ ] GUI opens at `http://127.0.0.1:38127/agent-team/` with correct content
- [ ] All 8 issues in this milestone resolved
- [ ] Core docs (说明.md, 进度.md, 发现.md) up to date
- [ ] `git tag v0.1.0` prepared
