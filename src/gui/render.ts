import {
  DEFAULT_WORKSPACE_ROOT,
  GUI_API_BASE_PATH,
  GUI_ASSETS_PATH,
  GUI_PRODUCT_NAME,
  GUI_SHORT_NAME,
  AVATAR_MAX_BYTES,
} from "./state.js";

export function renderAgentWorkShellHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${GUI_SHORT_NAME}</title>
    <style>
      :root {
        color-scheme: light dark;
        --bg: oklch(0.985 0.003 255);
        --panel: color-mix(in srgb, white 92%, #ecf1f6 8%);
        --panel-strong: color-mix(in srgb, white 96%, #dce6ef 4%);
        --panel-hover: color-mix(in srgb, white 84%, #e6edf5 16%);
        --border: color-mix(in srgb, #d7e0ea 84%, #6c7b90 16%);
        --border-strong: color-mix(in srgb, var(--border) 66%, #415066 34%);
        --text: oklch(0.31 0.018 255);
        --muted: oklch(0.55 0.015 255);
        --accent: oklch(0.58 0.12 244);
        --accent-soft: color-mix(in srgb, var(--accent) 10%, white 90%);
        --success: oklch(0.62 0.15 154);
        --shadow: 0 12px 34px rgba(36, 54, 78, 0.08);
        font-family: "SF Pro Text", "Segoe UI", sans-serif;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(245, 248, 251, 0.98));
        color: var(--text);
      }

      .page {
        max-width: 1080px;
        margin: 0 auto;
        padding: 22px 20px 40px;
      }

      .hero {
        padding: 18px 20px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,0.96), rgba(248,250,253,0.98));
        box-shadow: var(--shadow);
      }

      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 999px;
        border: 1px solid var(--border);
        background: var(--panel-strong);
        color: var(--muted);
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      h1 {
        margin: 12px 0 8px;
        font-size: clamp(26px, 3vw, 34px);
        line-height: 1.1;
      }

      .subtitle {
        max-width: 680px;
        margin: 0;
        color: var(--muted);
        font-size: 14px;
        line-height: 1.6;
      }

      .meta-label {
        color: var(--muted);
        font-size: 11px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .shell {
        margin-top: 14px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: rgba(255,255,255,0.92);
        overflow: hidden;
        box-shadow: var(--shadow);
      }

      .tabs {
        display: flex;
        gap: 10px;
        padding: 14px;
        border-bottom: 1px solid var(--border);
        background: rgba(250, 252, 255, 0.92);
      }

      .tab {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 10px 14px;
        background: var(--panel);
        color: var(--muted);
        font: inherit;
        font-size: 13px;
        cursor: pointer;
        transition: 140ms ease;
      }

      .tab:hover { background: var(--panel-hover); color: var(--text); }

      .tab.is-active {
        border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
        background: linear-gradient(180deg, rgba(231,240,255,0.95), rgba(245,248,255,0.98));
        color: var(--text);
        box-shadow: inset 0 0 0 1px rgba(84, 126, 210, 0.12);
      }

      .content {
        padding: 18px;
        min-height: 520px;
      }

      .panel-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(320px, 0.7fr);
        gap: 18px;
      }

      .panel,
      .side-panel,
      .stat,
      .template-card,
      .summary-row,
      .notice,
      .step-pill {
        border: 1px solid var(--border);
        background: var(--panel-strong);
      }

      .panel, .side-panel {
        border-radius: 18px;
        padding: 18px;
      }

      .section-title {
        margin: 0 0 8px;
        font-size: 21px;
      }

      .section-copy, .small-copy, .muted {
        color: var(--muted);
        line-height: 1.6;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
        gap: 12px;
        margin-top: 18px;
      }

      .stat {
        border-radius: 18px;
        padding: 14px;
      }

      .stat-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: var(--muted);
      }

      .stat-value {
        margin-top: 8px;
        font-size: 17px;
        font-weight: 600;
        line-height: 1.25;
        overflow-wrap: anywhere;
        word-break: break-word;
      }

      .steps {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin: 18px 0 20px;
      }

      .step-pill {
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 13px;
        color: var(--muted);
      }

      .step-pill.is-active {
        background: var(--accent-soft);
        border-color: color-mix(in srgb, var(--accent) 36%, var(--border));
        color: var(--text);
      }

      .template-list {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 14px;
        margin: 18px 0 0;
      }

      .template-card {
        border-radius: 18px;
        padding: 16px;
        cursor: pointer;
        transition: 140ms ease;
      }

      .template-card:hover { background: var(--panel-hover); }

      .template-card.is-selected {
        background: var(--accent-soft);
        border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
      }

      .template-card h3 {
        margin: 0 0 6px;
        font-size: 18px;
      }

      .template-emoji {
        font-size: 28px;
        margin-bottom: 8px;
      }

      .avatar-picker {
        display: flex;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 12px;
      }

      .avatar-option {
        width: 60px;
        height: 60px;
        border-radius: 16px;
        border: 2px solid var(--border);
        background: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        transition: 140ms ease;
        padding: 6px;
      }

      .avatar-option:hover {
        border-color: var(--accent);
        background: var(--accent-soft);
      }

      .avatar-option.is-selected {
        border-color: var(--accent);
        box-shadow: 0 0 0 3px rgba(84, 126, 210, 0.18);
      }

      .avatar-option img {
        width: 100%;
        height: 100%;
        object-fit: contain;
      }

      .avatar-option.upload-trigger {
        border-style: dashed;
        color: var(--muted);
        font-size: 20px;
        font-weight: 300;
      }

      .avatar-option.upload-trigger:hover {
        color: var(--accent);
        border-color: var(--accent);
      }

      .field {
        display: grid;
        gap: 8px;
        margin-top: 16px;
      }

      .field label {
        font-weight: 600;
      }

      .field input {
        width: 100%;
        padding: 13px 14px;
        border-radius: 16px;
        border: 1px solid var(--border);
        background: white;
        font: inherit;
        color: var(--text);
      }

      .summary-list {
        display: grid;
        gap: 10px;
        margin-top: 16px;
      }

      .roster-list {
        display: grid;
        gap: 12px;
        margin-top: 16px;
      }

      .summary-row {
        border-radius: 16px;
        padding: 14px;
      }

      .roster-row {
        display: grid;
        gap: 12px;
        border-radius: 16px;
        padding: 14px;
        border: 1px solid var(--border);
        background: var(--panel-strong);
      }

      .roster-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }

      .roster-title {
        font-size: 16px;
        font-weight: 600;
      }

      .roster-meta {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
        word-break: break-word;
      }

      .summary-label {
        color: var(--muted);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .summary-value {
        margin-top: 6px;
        font-family: ui-monospace, "SFMono-Regular", monospace;
        word-break: break-all;
      }

      .actions {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        margin-top: 18px;
      }

      .button {
        border: 1px solid var(--border);
        border-radius: 12px;
        padding: 12px 16px;
        background: white;
        color: var(--text);
        font: inherit;
        cursor: pointer;
      }

      .button:hover { background: var(--panel-hover); }

      .button.primary {
        background: linear-gradient(180deg, rgba(83, 126, 210, 0.95), rgba(69, 108, 184, 1));
        border-color: rgba(62, 101, 177, 1);
        color: white;
      }

      .button.danger {
        border-color: color-mix(in srgb, #c44848 34%, var(--border));
        background: color-mix(in srgb, #c44848 7%, white 93%);
        color: #892e2e;
      }

      .button.primary[disabled],
      .button[disabled] {
        opacity: 0.45;
        cursor: not-allowed;
      }

      .notice {
        border-radius: 16px;
        padding: 14px;
        margin-top: 16px;
      }

      .notice.success {
        border-color: color-mix(in srgb, var(--success) 36%, var(--border));
        background: color-mix(in srgb, var(--success) 10%, white 90%);
      }

      .notice.error {
        border-color: color-mix(in srgb, #c44848 34%, var(--border));
        background: color-mix(in srgb, #c44848 8%, white 92%);
      }

      .mono {
        font-family: ui-monospace, "SFMono-Regular", monospace;
      }

      @media (max-width: 920px) {
        .panel-grid,
        .template-list,
        .stats {
          grid-template-columns: 1fr;
        }

        .tabs {
          flex-direction: column;
        }

        .actions {
          flex-direction: column;
        }
      }
    </style>
  </head>
  <body>
    <div class="page">
      <section class="hero">
        <div>
          <div class="eyebrow">${GUI_PRODUCT_NAME}</div>
          <h1>${GUI_SHORT_NAME}</h1>
          <p class="subtitle">Recruit, dismiss, and connect agents from one stable local workbench. The shell stays fixed, and each tab keeps one job clear.</p>
        </div>
      </section>

      <section class="shell">
        <div class="tabs" id="tabs"></div>
        <div class="content" id="content">
          <p class="section-copy">Loading ${GUI_SHORT_NAME}...</p>
        </div>
      </section>
    </div>

    <script>
      const state = {
        bootstrap: null,
        activeTab: 'recruit',
        createStep: 'positioning',
        draft: {
          templateId: 'scout',
          name: '',
          workspaceRoot: '${DEFAULT_WORKSPACE_ROOT.replace(/'/g, "\\'")}',
          avatarMode: 'preset',
          avatarValue: 'scout',
          avatarDataUri: '',
        },
        agents: [],
        preview: null,
        createResult: null,
        createError: '',
        agentsError: '',
        dismissError: '',
        dismissBusyId: '',
        copyFeedback: '',
      };

      const tabs = [
        { id: 'recruit', label: 'Recruit' },
        { id: 'dismiss', label: 'Dismiss' },
        { id: 'connect', label: 'iPhone Connection' },
      ];

      const steps = [
        { id: 'positioning', label: 'Positioning' },
        { id: 'name', label: 'Name' },
        { id: 'workspace', label: 'Workspace' },
        { id: 'done', label: 'Done' },
      ];

      const tabsEl = document.getElementById('tabs');
      const contentEl = document.getElementById('content');

      function escapeHtml(value) {
        return String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      async function boot() {
        await refreshBootstrap();
        state.activeTab = state.bootstrap.defaultActiveTab || 'recruit';
        state.draft.workspaceRoot = state.bootstrap.defaultWorkspaceRoot || state.draft.workspaceRoot;
        await refreshAgents();
        await refreshPreview();
        render();
      }

      async function refreshBootstrap() {
        const response = await fetch('${GUI_API_BASE_PATH}/bootstrap');
        state.bootstrap = await response.json();
      }

      async function refreshConnectSummary() {
        const response = await fetch('${GUI_API_BASE_PATH}/connect-summary');
        state.bootstrap.connectSummary = await response.json();
      }

      async function refreshPreview() {
        const response = await fetch('${GUI_API_BASE_PATH}/agent-preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: state.draft.name,
            workspaceRoot: state.draft.workspaceRoot,
            templateId: state.draft.templateId,
          }),
        });
        state.preview = await response.json();
      }

      async function refreshAgents() {
        const response = await fetch('${GUI_API_BASE_PATH}/agents');
        const result = await response.json();
        state.agents = Array.isArray(result.agents) ? result.agents : [];
      }

      function render() {
        renderTabs();
        if (!state.bootstrap) {
          contentEl.innerHTML = '<p class="section-copy">Loading...</p>';
          return;
        }
        if (state.activeTab === 'recruit') {
          renderCreateTab();
          return;
        }
        if (state.activeTab === 'dismiss') {
          renderDismissTab();
          return;
        }
        renderConnectTab();
      }

      function renderTabs() {
        tabsEl.innerHTML = tabs.map((tab) => {
          const activeClass = tab.id === state.activeTab ? 'tab is-active' : 'tab';
          return '<button class="' + activeClass + '" data-tab="' + tab.id + '">' + escapeHtml(tab.label) + '</button>';
        }).join('');
        for (const button of tabsEl.querySelectorAll('[data-tab]')) {
          button.addEventListener('click', async () => {
            state.activeTab = button.getAttribute('data-tab');
            state.copyFeedback = '';
            state.dismissError = '';
            if (state.activeTab === 'dismiss') {
              await refreshAgents();
            }
            if (state.activeTab === 'connect') {
              await refreshConnectSummary();
            }
            render();
          });
        }
      }

      function renderCreateTab() {
        const preview = state.preview || {};
        const issues = Array.isArray(preview.issues) ? preview.issues : [];
        const hasBlocking = issues.some((issue) => issue.blocking);
        const stepMarkup = steps.map((step) => {
          const activeClass = step.id === state.createStep ? 'step-pill is-active' : 'step-pill';
          return '<div class="' + activeClass + '">' + escapeHtml(step.label) + '</div>';
        }).join('');

        let mainMarkup = '';

        if (state.createStep === 'positioning') {
          mainMarkup = '<div class="panel-grid">' +
            '<section class="panel">' +
              '<h2 class="section-title">Choose a role for the new agent</h2>' +
              '<p class="section-copy">Each role brings its own perspective and working style. Pick the one that matches what this agent should do day to day.</p>' +
              '<div class="template-list">' +
                state.bootstrap.templates.map((template) => {
                  const selectedClass = template.id === state.draft.templateId ? 'template-card is-selected' : 'template-card';
                  const emoji = template.identityDefaults ? template.identityDefaults.emoji : '';
                  return '<button class="' + selectedClass + '" data-template="' + template.id + '">' +
                    '<div class="template-emoji">' + escapeHtml(emoji) + '</div>' +
                    '<h3>' + escapeHtml(template.label) + '</h3>' +
                    '<div class="small-copy">' + escapeHtml(template.description) + '</div>' +
                  '</button>';
                }).join('') +
              '</div>' +
              '<div class="actions">' +
                '<button class="button" data-action="reset">Reset draft</button>' +
                '<button class="button primary" data-action="next-positioning">Continue</button>' +
              '</div>' +
            '</section>' +
            '<aside class="side-panel">' +
              '<h3 class="section-title">Flow snapshot</h3>' +
              '<p class="section-copy">Each role template seeds IDENTITY.md, SOUL.md, and USER.md into the new workspace so the agent starts with a clear sense of who it is.</p>' +
              '<div class="stats">' +
                '<div class="stat"><div class="stat-label">Active tab</div><div class="stat-value">Recruit</div></div>' +
                '<div class="stat"><div class="stat-label">Current step</div><div class="stat-value">Positioning</div></div>' +
                '<div class="stat"><div class="stat-label">Template</div><div class="stat-value">' + escapeHtml(titleForTemplate(state.draft.templateId)) + '</div></div>' +
              '</div>' +
            '</aside>' +
          '</div>';
        }

        if (state.createStep === 'name') {
          mainMarkup = '<div class="panel-grid">' +
            '<section class="panel">' +
              '<h2 class="section-title">Name &amp; Identity</h2>' +
              '<p class="section-copy">Give the agent a name, then pick or upload an avatar. Both help you recognize who you are talking to at a glance.</p>' +
              '<div class="field"><label for="agent-name">Agent name</label><input id="agent-name" value="' + escapeHtml(state.draft.name) + '" placeholder="e.g. Molly, John" /></div>' +
              '<div class="field"><label>Avatar</label>' +
                renderAvatarPicker() +
              '</div>' +
              renderIssues(issues) +
              '<div class="actions">' +
                '<button class="button" data-action="back-name">Back</button>' +
                '<button class="button primary" data-action="next-name">Continue</button>' +
              '</div>' +
            '</section>' +
            '<aside class="side-panel">' +
              '<h3 class="section-title">Name &amp; avatar</h3>' +
              '<div class="summary-list">' +
                '<div class="summary-row"><div class="summary-label">Agent name</div><div class="summary-value">Pick a name like you are naming a new team member, not a tool. The ID and workspace folder are derived from it automatically.</div></div>' +
                '<div class="summary-row"><div class="summary-label">Avatar</div><div class="summary-value">Helps you recognize this agent in chat and the agent list. Pick a preset or upload your own.</div></div>' +
                '<div class="summary-row"><div class="summary-label">Example</div><div class="summary-value mono">ID: research-lead → Workspace: ~/Documents/OpenClaw/Research Lead</div></div>' +
              '</div>' +
            '</aside>' +
          '</div>';
        }

        if (state.createStep === 'workspace') {
          mainMarkup = '<div class="panel-grid">' +
            '<section class="panel">' +
              '<h2 class="section-title">Confirm workspace root</h2>' +
              '<p class="section-copy">The agent gets its own workspace under a shared employee-office root.</p>' +
              '<div class="field"><label for="workspace-root">Root workspace folder</label><input id="workspace-root" value="' + escapeHtml(state.draft.workspaceRoot) + '" placeholder="~/Documents/Agent Workspaces" /></div>' +
              (state.createError ? '<div class="notice error">' + escapeHtml(state.createError) + '</div>' : '') +
              '<div class="actions">' +
                '<button class="button" data-action="back-workspace">Back</button>' +
                '<button class="button primary" data-action="create-agent">Create Agent</button>' +
              '</div>' +
            '</section>' +
            '<aside class="side-panel">' +
              '<h3 class="section-title">Workspace location</h3>' +
              '<div class="summary-list">' +
                '<div class="summary-row"><div class="summary-label">Root</div><div class="summary-value">All agent workspaces live under this shared root. Default is ~/Documents/OpenClaw.</div></div>' +
                '<div class="summary-row"><div class="summary-label">Result</div><div class="summary-value mono">' + escapeHtml(state.draft.workspaceRoot) + '/' + escapeHtml(state.draft.name || 'New Agent') + '</div></div>' +
                '<div class="summary-row"><div class="summary-label">Tip</div><div class="summary-value">You can use ~ as a shortcut for your home directory.</div></div>' +
              '</div>' +
            '</aside>' +
          '</div>';
        }

        if (state.createStep === 'done') {
          const created = state.createResult && state.createResult.agent ? state.createResult.agent : preview;
          mainMarkup = '<div class="panel-grid">' +
            '<section class="panel">' +
              '<h2 class="section-title">Agent created</h2>' +
              '<p class="section-copy">The flow stayed inside the same shell, and the new agent was created through the public OpenClaw CLI path.</p>' +
              '<div class="notice success">The work agent is ready. You can stay here, switch tabs, or start another draft.</div>' +
              '<div class="actions">' +
                '<button class="button" data-action="open-connect">Open iPhone Connection</button>' +
                '<button class="button primary" data-action="restart-create">Create Another Agent</button>' +
              '</div>' +
            '</section>' +
            '<aside class="side-panel">' +
              '<h3 class="section-title">Result</h3>' +
              renderPreviewSummary(created) +
            '</aside>' +
          '</div>';
        }

        contentEl.innerHTML = '<div class="steps">' + stepMarkup + '</div>' + mainMarkup;

        for (const button of contentEl.querySelectorAll('[data-template]')) {
          button.addEventListener('click', async () => {
            state.draft.templateId = button.getAttribute('data-template');
            state.draft.avatarMode = 'preset';
            state.draft.avatarValue = state.draft.templateId;
            state.draft.avatarDataUri = '';
            render();
          });
        }

        const nameInput = document.getElementById('agent-name');
        if (nameInput) {
          nameInput.addEventListener('input', (event) => {
            state.draft.name = event.target.value;
          });
        }

        const workspaceInput = document.getElementById('workspace-root');
        if (workspaceInput) {
          workspaceInput.addEventListener('input', (event) => {
            state.draft.workspaceRoot = event.target.value;
          });
        }

        bindAction('reset', async () => {
          state.createResult = null;
          state.createError = '';
          state.dismissError = '';
          state.createStep = 'positioning';
          state.draft = { templateId: 'scout', name: '', workspaceRoot: state.bootstrap.defaultWorkspaceRoot, avatarMode: 'preset', avatarValue: 'scout', avatarDataUri: '' };
          await refreshPreview();
          render();
        });
        bindAction('next-positioning', () => { state.createStep = 'name'; render(); });
        bindAction('back-name', () => { state.createStep = 'positioning'; render(); });
        bindAction('next-name', async () => {
          await refreshPreview();
          const issues = Array.isArray(state.preview.issues) ? state.preview.issues : [];
          if (issues.some(function (i) { return i.blocking; })) {
            render();
            return;
          }
          state.createStep = 'workspace';
          render();
        });
        bindAction('back-workspace', () => { state.createStep = 'name'; render(); });
        bindAction('open-connect', async () => {
          state.activeTab = 'connect';
          state.copyFeedback = '';
          await refreshConnectSummary();
          render();
        });
        bindAction('restart-create', async () => {
          state.createResult = null;
          state.createError = '';
          state.dismissError = '';
          state.createStep = 'positioning';
          state.draft.name = '';
          state.draft.avatarMode = 'preset';
          state.draft.avatarValue = state.draft.templateId;
          state.draft.avatarDataUri = '';
          await refreshPreview();
          render();
        });
        bindAction('create-agent', async () => {
          state.createError = '';
          const body = {
            templateId: state.draft.templateId,
            name: state.draft.name,
            workspaceRoot: state.draft.workspaceRoot,
            avatarMode: state.draft.avatarMode,
            avatarValue: state.draft.avatarValue,
            avatarDataUri: state.draft.avatarDataUri || undefined,
          };
          const response = await fetch('${GUI_API_BASE_PATH}/agents', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          });
          const result = await response.json();
          if (!response.ok) {
            state.createError = result.error || 'Create agent failed.';
            render();
            return;
          }
          state.createResult = result;
          state.createStep = 'done';
          await refreshAgents();
          await refreshConnectSummary();
          await refreshPreview();
          render();
        });

      }

      function renderDismissTab() {
        contentEl.innerHTML = '<div class="panel-grid">' +
          '<section class="panel">' +
            '<h2 class="section-title">Dismiss an existing work agent</h2>' +
            '<p class="section-copy">This tab stays separate from recruiting so the roster can be scanned calmly before removing anything.</p>' +
            renderAgentRoster() +
          '</section>' +
          '<aside class="side-panel">' +
            '<h3 class="section-title">Dismiss rules</h3>' +
            '<div class="summary-list">' +
              '<div class="summary-row"><div class="summary-label">Guardrail</div><div class="summary-value">main is reserved and cannot be dismissed here.</div></div>' +
              '<div class="summary-row"><div class="summary-label">Deletion path</div><div class="summary-value">Agent Team calls the public OpenClaw CLI delete flow with force + json.</div></div>' +
              '<div class="summary-row"><div class="summary-label">File handling</div><div class="summary-value">OpenClaw moves agent files to Trash instead of hard-deleting them.</div></div>' +
            '</div>' +
          '</aside>' +
        '</div>';

        for (const button of contentEl.querySelectorAll('[data-dismiss-agent]')) {
          button.addEventListener('click', async () => {
            const agentId = button.getAttribute('data-dismiss-agent');
            if (!agentId || state.dismissBusyId) {
              return;
            }
            const confirmed = window.confirm('Dismiss agent "' + agentId + '"? OpenClaw will remove the agent and move its files to Trash.');
            if (!confirmed) {
              return;
            }
            state.dismissError = '';
            state.dismissBusyId = agentId;
            render();
            const response = await fetch('${GUI_API_BASE_PATH}/agents/dismiss', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ agentId }),
            });
            const result = await response.json();
            state.dismissBusyId = '';
            if (!response.ok) {
              state.dismissError = result.error || 'Dismiss agent failed.';
              render();
              return;
            }
            await refreshAgents();
            await refreshPreview();
            render();
          });
        }
      }

      function renderConnectTab() {
        const summary = state.bootstrap.connectSummary || {};
        const alternateHosts = Array.isArray(summary.alternateHosts) ? summary.alternateHosts : [];
        const encoded = summary.encoded ? '<div class="summary-row"><div class="summary-label">Connection line</div><div class="summary-value">' + escapeHtml(summary.encoded) + '</div></div>' : '';
        const freshness = summary.updatedAt ? new Date(summary.updatedAt).toLocaleString() : 'Pending';
        const copyFeedback = state.copyFeedback ? '<div class="notice success">' + escapeHtml(state.copyFeedback) + '</div>' : '';
        const statusLabel = summary.status ? '<div class="summary-row"><div class="summary-label">Bridge status</div><div class="summary-value">' + escapeHtml(summary.status) + '</div></div>' : '';
        contentEl.innerHTML = '<div class="panel-grid">' +
          '<section class="panel">' +
            '<h2 class="section-title">iPhone Connection</h2>' +
            '<p class="section-copy">This tab prepares the connection details that Thou on iPhone uses to initiate the bridge. In most cases, you only need to copy the full connection line below.</p>' +
            '<div class="notice ' + (summary.ready ? 'success' : '') + '">' + escapeHtml(summary.instruction || 'Connection details are not ready yet.') + '</div>' +
            '<div class="summary-list">' +
              '<div class="summary-row"><div class="summary-label">Account</div><div class="summary-value">' + escapeHtml(summary.accountName || 'Unavailable') + '</div></div>' +
              statusLabel +
              '<div class="summary-row"><div class="summary-label">Preferred host</div><div class="summary-value">' + escapeHtml(summary.preferredHost || 'Unavailable') + '</div></div>' +
              '<div class="summary-row"><div class="summary-label">Port and path</div><div class="summary-value">' + escapeHtml(summary.port ? String(summary.port) + ' ' + (summary.path || '') : 'Unavailable') + '</div></div>' +
              '<div class="summary-row"><div class="summary-label">Alternate hosts</div><div class="summary-value">' + escapeHtml(alternateHosts.length ? alternateHosts.join(', ') : 'None') + '</div></div>' +
              '<div class="summary-row"><div class="summary-label">Last refreshed</div><div class="summary-value">' + escapeHtml(freshness) + '</div></div>' +
              encoded +
            '</div>' +
            copyFeedback +
            '<div class="actions"><button class="button primary" data-action="copy-connection" ' + (!summary.encoded ? 'disabled' : '') + '>Copy full connection line</button></div>' +
          '</section>' +
          '<aside class="side-panel">' +
            '<h3 class="section-title">Start from iPhone</h3>' +
            '<div class="summary-list">' +
              '<div class="summary-row"><div class="summary-label">Step 1</div><div class="summary-value">Open Thou, then choose OpenClaw.</div></div>' +
              '<div class="summary-row"><div class="summary-label">Step 2</div><div class="summary-value">On iPhone, tap the field for pasting a connection line.</div></div>' +
              '<div class="summary-row"><div class="summary-label">Step 3</div><div class="summary-value">Paste the full line copied from this page to initiate the connection.</div></div>' +
            '</div>' +
          '</aside>' +
        '</div>';
        bindAction('copy-connection', async () => {
          if (summary.encoded) {
            await navigator.clipboard.writeText(summary.encoded);
            state.copyFeedback = 'Connection line copied to clipboard.';
            render();
          }
        });
      }

      function renderPreviewSummary(preview) {
        const agentId = preview.agentId || preview.id || 'Pending';
        const workspacePath = preview.workspacePath || preview.workspace || 'Pending';
        const workspaceFolderName = preview.workspaceFolderName || preview.name || extractWorkspaceFolderName(workspacePath);
        return '<div class="summary-list">' +
          '<div class="summary-row"><div class="summary-label">Agent ID</div><div class="summary-value">' + escapeHtml(agentId) + '</div></div>' +
          '<div class="summary-row"><div class="summary-label">Workspace folder</div><div class="summary-value">' + escapeHtml(workspaceFolderName || 'Pending') + '</div></div>' +
          '<div class="summary-row"><div class="summary-label">Workspace path</div><div class="summary-value">' + escapeHtml(workspacePath) + '</div></div>' +
        '</div>';
      }

      function extractWorkspaceFolderName(workspacePath) {
        if (!workspacePath || workspacePath === 'Pending') {
          return 'Pending';
        }
        const normalized = String(workspacePath).replace(/[\\/]+$/, '');
        const segments = normalized.split(/[\\/]/).filter(Boolean);
        return segments.length ? segments[segments.length - 1] : 'Pending';
      }

      function renderIssues(issues) {
        if (!issues.length) {
          return '';
        }
        return '<div class="notice error">' + issues.map((issue) => escapeHtml(issue.message)).join('<br />') + '</div>';
      }

      function renderAgentRoster() {
        if (state.dismissError) {
          return '<div class="notice error">' + escapeHtml(state.dismissError) + '</div>' + renderAgentRosterList();
        }
        return renderAgentRosterList();
      }

      function renderAgentRosterList() {
        if (!Array.isArray(state.agents) || !state.agents.length) {
          return '<div class="notice">No agents found in the current OpenClaw profile yet.</div>';
        }
        return '<div class="roster-list">' + state.agents.map((agent) => {
          const disabled = !agent.canDismiss || state.dismissBusyId === agent.id;
          const label = state.dismissBusyId === agent.id ? 'Dismissing…' : 'Dismiss';
          const hint = agent.dismissHint ? '<div class="roster-meta">' + escapeHtml(agent.dismissHint) + '</div>' : '';
          return '<div class="roster-row">' +
            '<div class="roster-head">' +
              '<div>' +
                '<div class="roster-title">' + escapeHtml(agent.id) + '</div>' +
                '<div class="roster-meta">' + escapeHtml(agent.workspacePath || 'Workspace unavailable') + '</div>' +
              '</div>' +
              '<button class="button danger" data-dismiss-agent="' + escapeHtml(agent.id) + '" ' + (disabled ? 'disabled' : '') + '>' + escapeHtml(label) + '</button>' +
            '</div>' +
            hint +
          '</div>';
        }).join('') + '</div>';
      }

      function bindAction(action, handler) {
        const button = contentEl.querySelector('[data-action="' + action + '"]');
        if (button) {
          button.addEventListener('click', handler);
        }
      }

      function titleForTemplate(templateId) {
        const template = (state.bootstrap.templates || []).find((entry) => entry.id === templateId);
        return template ? template.label : 'Unselected';
      }

      function renderAvatarPicker() {
        const presetIds = (state.bootstrap.templates || []).map(function (t) { return t.id; });
        var html = '<div class="avatar-picker">';
        for (var i = 0; i < presetIds.length; i++) {
          var pid = presetIds[i];
          var selectedClass = state.draft.avatarMode === 'preset' && state.draft.avatarValue === pid ? 'avatar-option is-selected' : 'avatar-option';
          html += '<button class="' + selectedClass + '" data-avatar-preset="' + pid + '">' +
            '<img src="' + escapeHtml('${GUI_ASSETS_PATH}/avatars/' + pid + '.svg') + '" alt="' + escapeHtml(titleForTemplate(pid)) + '" />' +
          '</button>';
        }
        // Upload trigger
        var uploadSelected = state.draft.avatarMode === 'upload' && state.draft.avatarDataUri;
        var uploadClass = uploadSelected ? 'avatar-option is-selected' : 'avatar-option upload-trigger';
        html += '<button class="' + uploadClass + '" data-avatar-upload="1" title="Upload custom image">' +
          (uploadSelected ? '<img src="' + escapeHtml(state.draft.avatarDataUri) + '" alt="Custom" />' : '+') +
        '</button>';
        html += '<input type="file" id="avatar-file-input" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" style="display:none" />';
        html += '</div>';
        html += '<div class="small-copy" style="margin-top:6px">' + (state.draft.avatarMode === 'upload' ? 'Custom image selected' : 'Pick a preset or upload your own') + '</div>';

        // Attach handlers after DOM insertion
        setTimeout(function () {
          var presetBtns = document.querySelectorAll('[data-avatar-preset]');
          for (var b = 0; b < presetBtns.length; b++) {
            presetBtns[b].addEventListener('click', function () {
              state.draft.avatarMode = 'preset';
              state.draft.avatarValue = this.getAttribute('data-avatar-preset');
              state.draft.avatarDataUri = '';
              render();
            });
          }
          var uploadBtn = document.querySelector('[data-avatar-upload]');
          var fileInput = document.getElementById('avatar-file-input');
          if (uploadBtn && fileInput) {
            uploadBtn.addEventListener('click', function () {
              fileInput.click();
            });
            fileInput.addEventListener('change', function () {
              var file = fileInput.files && fileInput.files[0];
              if (!file) return;
              if (file.size > ${AVATAR_MAX_BYTES}) {
                alert('Image too large. Maximum size is ' + Math.round(${AVATAR_MAX_BYTES} / 1024 / 1024 * 10) / 10 + ' MB.');
                return;
              }
              var reader = new FileReader();
              reader.onload = function () {
                state.draft.avatarMode = 'upload';
                state.draft.avatarValue = '';
                state.draft.avatarDataUri = reader.result;
                render();
              };
              reader.readAsDataURL(file);
            });
          }
        }, 0);

        return html;
      }

      boot().catch((error) => {
        contentEl.innerHTML = '<div class="notice error">' + escapeHtml(error && error.message ? error.message : 'Failed to boot Agent Team.') + '</div>';
      });
    </script>
  </body>
</html>`;
}