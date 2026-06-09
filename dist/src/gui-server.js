import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ensureThouBridgeAuthToken } from "./bridge-auth.js";
import { buildThouConnectionSharePayload, buildThouConnectionShareText, } from "./connection-share.js";
const execFileAsync = promisify(execFile);
const GUI_PRODUCT_NAME = "OpenClaw Agent Team";
const GUI_SHORT_NAME = "Agent Team";
const GUI_BASE_PATH = "/agent-team";
const GUI_ASSETS_PATH = `${GUI_BASE_PATH}/assets`;
const GUI_API_BASE_PATH = `${GUI_BASE_PATH}/api/v1`;
const DEFAULT_WORKSPACE_ROOT = "~/Documents/OpenClaw";
const PREFERRED_GUI_PORT = 38127;
const STABLE_GUI_URL = `http://127.0.0.1:${PREFERRED_GUI_PORT}${GUI_BASE_PATH}/`;
const CONNECT_ARTIFACT_TTL_MS = 15 * 60 * 1000;
const TEMPLATES = [
    {
        id: "coding",
        label: "Coding",
        description: "For building, debugging, and shipping software.",
    },
    {
        id: "writing",
        label: "Writing",
        description: "For drafting, revising, and organizing long-form output.",
    },
    {
        id: "research",
        label: "Research",
        description: "For gathering, comparing, and synthesizing information.",
    },
];
let guiServerPromise = null;
let guiState = {
    account: null,
    connectionPayload: null,
    connectionText: null,
    connectionCacheKey: null,
    connectionUpdatedAt: 0,
    updatedAt: 0,
};
export async function ensureAgentWorkGuiServer(params) {
    if (params) {
        const nextAccount = params.account ?? guiState.account;
        const accountChanged = buildConnectionCacheKey(nextAccount) !== guiState.connectionCacheKey;
        const connectionPayload = params.connectionPayload === undefined
            ? accountChanged
                ? null
                : guiState.connectionPayload
            : params.connectionPayload;
        const connectionText = params.connectionText === undefined
            ? accountChanged
                ? null
                : guiState.connectionText
            : params.connectionText;
        guiState = {
            account: nextAccount,
            connectionPayload,
            connectionText,
            connectionCacheKey: buildConnectionCacheKey(nextAccount),
            connectionUpdatedAt: connectionPayload && connectionText
                ? params.connectionPayload !== undefined || params.connectionText !== undefined || accountChanged
                    ? Date.now()
                    : guiState.connectionUpdatedAt
                : 0,
            updatedAt: Date.now(),
        };
    }
    guiServerPromise ??= startAgentWorkGuiServer();
    const server = await guiServerPromise;
    return { url: server.url };
}
async function startAgentWorkGuiServer() {
    const server = createServer(async (req, res) => {
        try {
            await routeAgentWorkRequest(req, res);
        }
        catch (error) {
            respondJson(res, 500, {
                ok: false,
                error: error instanceof Error ? error.message : "unknown error",
            });
        }
    });
    await listenOnPreferredLoopbackPort(server);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const url = STABLE_GUI_URL;
    return {
        url,
        port,
        stop: async () => {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
            guiServerPromise = null;
        },
    };
}
async function routeAgentWorkRequest(req, res) {
    const method = req.method ?? "GET";
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname;
    if (method === "GET" && (pathname === GUI_BASE_PATH || pathname === `${GUI_BASE_PATH}/`)) {
        respondHtml(res, renderAgentWorkShellHtml());
        return;
    }
    if (method === "GET" && pathname === `${GUI_API_BASE_PATH}/health`) {
        respondJson(res, 200, { ok: true });
        return;
    }
    if (method === "GET" && pathname === `${GUI_API_BASE_PATH}/bootstrap`) {
        const { url } = await ensureAgentWorkGuiServer();
        respondJson(res, 200, {
            locale: "en",
            guiBaseUrl: url,
            defaultActiveTab: "recruit",
            defaultWorkspaceRoot: DEFAULT_WORKSPACE_ROOT,
            templates: TEMPLATES,
            connectSummary: await buildConnectSummary(url),
        });
        return;
    }
    if (method === "GET" && pathname === `${GUI_API_BASE_PATH}/connect-summary`) {
        const { url } = await ensureAgentWorkGuiServer();
        respondJson(res, 200, await buildConnectSummary(url));
        return;
    }
    if (method === "GET" && pathname === `${GUI_API_BASE_PATH}/agents`) {
        respondJson(res, 200, {
            agents: await listAgents(),
        });
        return;
    }
    if (method === "POST" && pathname === `${GUI_API_BASE_PATH}/agent-preview`) {
        const payload = (await readJsonBody(req));
        const preview = await buildAgentPreview(payload);
        respondJson(res, 200, preview);
        return;
    }
    if (method === "POST" && pathname === `${GUI_API_BASE_PATH}/agents`) {
        const payload = (await readJsonBody(req));
        const preview = await buildAgentPreview(payload);
        if (!preview.canCreate) {
            respondJson(res, 400, {
                ok: false,
                error: "preview validation failed",
                preview,
            });
            return;
        }
        await mkdir(expandHomeDir(preview.workspaceRoot), { recursive: true });
        try {
            await execFileAsync("openclaw", [
                "agents",
                "add",
                preview.agentId,
                "--workspace",
                expandHomeDir(preview.workspacePath),
                "--non-interactive",
                "--json",
            ], {
                timeout: 15000,
                maxBuffer: 512 * 1024,
            });
        }
        catch (error) {
            const stderr = typeof error === "object" && error && "stderr" in error
                ? String(error.stderr ?? "")
                : "";
            respondJson(res, 409, {
                ok: false,
                error: humanizeAgentCreateError(stderr, preview),
                preview,
            });
            return;
        }
        respondJson(res, 200, {
            ok: true,
            agent: {
                id: preview.agentId,
                name: preview.name,
                workspace: preview.workspacePath,
            },
            next: {
                returnTo: `${GUI_BASE_PATH}/`,
                canOpenConnect: true,
            },
        });
        return;
    }
    if (method === "POST" && pathname === `${GUI_API_BASE_PATH}/agents/dismiss`) {
        const payload = (await readJsonBody(req));
        const agentId = String(payload.agentId ?? "").trim();
        if (!agentId) {
            respondJson(res, 400, {
                ok: false,
                error: "Agent id is required.",
            });
            return;
        }
        if (agentId === "main") {
            respondJson(res, 400, {
                ok: false,
                error: "main is reserved and cannot be dismissed from Agent Team.",
            });
            return;
        }
        try {
            await dismissAgent(agentId);
        }
        catch (error) {
            const stderr = typeof error === "object" && error && "stderr" in error
                ? String(error.stderr ?? "")
                : "";
            respondJson(res, 409, {
                ok: false,
                error: humanizeAgentDismissError(agentId, stderr),
            });
            return;
        }
        respondJson(res, 200, {
            ok: true,
            agentId,
        });
        return;
    }
    if (method === "GET" && pathname.startsWith(`${GUI_ASSETS_PATH}/`)) {
        respondText(res, 404, "asset not found", "text/plain; charset=utf-8");
        return;
    }
    respondText(res, 404, "not found", "text/plain; charset=utf-8");
}
async function buildConnectSummary(guiUrl) {
    if (!guiState.account) {
        return {
            ready: false,
            status: "pending-account",
            instruction: "Agent Team is waiting for the plugin runtime to publish a Thou account snapshot. If the plugin just started, refresh this page in a few seconds.",
            alternateHosts: [],
            guiUrl,
            updatedAt: guiState.updatedAt || undefined,
        };
    }
    if (!guiState.account.configured) {
        return {
            ready: false,
            status: "needs-config",
            instruction: "Finish the basic Thou setup first. Agent Team will show a copy-ready iPhone connection line after the Thou account is configured.",
            alternateHosts: [],
            guiUrl,
            accountName: guiState.account.name,
            updatedAt: guiState.updatedAt || undefined,
        };
    }
    const connectionArtifacts = await resolveConnectArtifacts();
    if (!connectionArtifacts) {
        return {
            ready: false,
            status: "bridge-pending",
            instruction: "The Thou account is configured, but Agent Team could not derive a copy-ready connection profile yet. Confirm the Thou channel is still using the current bridge settings, then refresh this tab.",
            alternateHosts: [],
            guiUrl,
            accountName: guiState.account?.name,
            updatedAt: guiState.updatedAt || undefined,
        };
    }
    return {
        ready: true,
        status: "ready",
        instruction: "Open Thou on iPhone, choose OpenClaw, then start the connection by pasting the full connection line shown below.",
        preferredHost: connectionArtifacts.connectionPayload.preferredHost,
        alternateHosts: connectionArtifacts.connectionPayload.hosts.filter((host) => host !== connectionArtifacts.connectionPayload.preferredHost),
        port: connectionArtifacts.connectionPayload.port,
        path: connectionArtifacts.connectionPayload.path,
        encoded: connectionArtifacts.connectionText,
        guiUrl,
        accountName: guiState.account?.name,
        updatedAt: guiState.updatedAt || undefined,
    };
}
async function resolveConnectArtifacts() {
    if (!guiState.account?.configured) {
        return null;
    }
    if (guiState.connectionPayload &&
        guiState.connectionText &&
        !haveConnectArtifactsExpired() &&
        guiState.connectionCacheKey === buildConnectionCacheKey(guiState.account)) {
        return {
            connectionPayload: guiState.connectionPayload,
            connectionText: guiState.connectionText,
        };
    }
    const { token } = ensureThouBridgeAuthToken({
        accountId: guiState.account.accountId,
    });
    const [connectionPayload, connectionText] = await Promise.all([
        buildThouConnectionSharePayload({
            account: guiState.account,
            authToken: token,
        }),
        buildThouConnectionShareText({
            account: guiState.account,
            authToken: token,
        }),
    ]);
    if (!connectionPayload || !connectionText) {
        return null;
    }
    guiState = {
        ...guiState,
        connectionPayload,
        connectionText,
        connectionCacheKey: buildConnectionCacheKey(guiState.account),
        connectionUpdatedAt: Date.now(),
        updatedAt: Date.now(),
    };
    return {
        connectionPayload,
        connectionText,
    };
}
async function buildAgentPreview(payload) {
    const name = String(payload.name ?? "").trim();
    const workspaceRoot = normalizeWorkspaceRoot(payload.workspaceRoot);
    const workspaceFolderName = name || "New Agent";
    const agentId = slugifyAgentId(name);
    const workspacePath = joinWorkspacePath(workspaceRoot, workspaceFolderName);
    const issues = [];
    if (!name) {
        issues.push({
            field: "name",
            message: "Agent name is required.",
            blocking: true,
        });
    }
    if (!agentId) {
        issues.push({
            field: "agentId",
            message: "Agent ID could not be derived from this name.",
            blocking: true,
        });
    }
    if (agentId === "main") {
        issues.push({
            field: "agentId",
            message: "main is reserved and cannot be used as a new agent id.",
            blocking: true,
        });
    }
    if (agentId && (await doesAgentIdExist(agentId))) {
        issues.push({
            field: "agentId",
            message: "Agent ID already exists in the current OpenClaw profile.",
            blocking: true,
        });
    }
    if (!(await isWorkspaceRootWritable(workspaceRoot))) {
        issues.push({
            field: "workspaceRoot",
            message: "Workspace root is not writable from the current environment.",
            blocking: true,
        });
    }
    if (await pathExists(workspacePath)) {
        issues.push({
            field: "workspacePath",
            message: "Workspace path already exists.",
            blocking: true,
        });
    }
    return {
        name,
        agentId,
        workspaceRoot,
        workspaceFolderName,
        workspacePath,
        issues,
        canCreate: issues.every((issue) => !issue.blocking),
    };
}
function humanizeAgentCreateError(errorMessage, preview) {
    const normalized = errorMessage.trim();
    const lower = normalized.toLowerCase();
    if (lower.includes("already exists") && lower.includes(preview.agentId.toLowerCase())) {
        return `Agent ID \"${preview.agentId}\" already exists. Pick a different name and try again.`;
    }
    if (lower.includes("reserved") || lower.includes("cannot be used as the new agent id")) {
        return `Agent ID \"${preview.agentId}\" is reserved by OpenClaw. Choose a different name.`;
    }
    if (lower.includes("workspace") && lower.includes("retain")) {
        return `OpenClaw refused the workspace path \"${preview.workspacePath}\" because it overlaps an existing agent workspace.`;
    }
    if (lower.includes("eacces") || lower.includes("permission") || lower.includes("not writable")) {
        return `OpenClaw could not write to \"${preview.workspaceRoot}\". Choose a writable root folder and try again.`;
    }
    if (!normalized) {
        return "OpenClaw rejected the create request, but did not return a detailed error. Check the Gateway logs and try again.";
    }
    return normalized;
}
function humanizeAgentDismissError(agentId, errorMessage) {
    const normalized = errorMessage.trim();
    const lower = normalized.toLowerCase();
    if (agentId === "main" || lower.includes("main cannot be deleted") || lower.includes("main cannot be deleted")) {
        return 'main is reserved and cannot be dismissed.';
    }
    if (lower.includes("not found") || lower.includes("unknown agent")) {
        return `Agent "${agentId}" no longer exists in the current OpenClaw profile.`;
    }
    if (!normalized) {
        return `OpenClaw rejected dismissing "${agentId}" without a detailed error. Check Gateway logs and try again.`;
    }
    return normalized;
}
async function dismissAgent(agentId) {
    try {
        await execFileAsync("openclaw", ["agents", "delete", agentId, "--force", "--json"], {
            timeout: 15000,
            maxBuffer: 512 * 1024,
        });
        return;
    }
    catch (error) {
        const stderr = typeof error === "object" && error && "stderr" in error
            ? String(error.stderr ?? "")
            : "";
        const lower = stderr.trim().toLowerCase();
        if (!(lower.includes("not found") || lower.includes("unknown agent"))) {
            throw error;
        }
        if (!(await doesAgentIdExist(agentId))) {
            throw error;
        }
        await execFileAsync("openclaw", ["gateway", "restart"], {
            timeout: 30000,
            maxBuffer: 512 * 1024,
        });
        await execFileAsync("openclaw", ["agents", "delete", agentId, "--force", "--json"], {
            timeout: 15000,
            maxBuffer: 512 * 1024,
        });
    }
}
function normalizeWorkspaceRoot(workspaceRoot) {
    const trimmed = String(workspaceRoot ?? "").trim();
    return trimmed || DEFAULT_WORKSPACE_ROOT;
}
function slugifyAgentId(name) {
    return name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
}
function joinWorkspacePath(root, folderName) {
    return `${root.replace(/[\\/]+$/g, "")}/${folderName.trim()}`;
}
async function isWorkspaceRootWritable(workspaceRoot) {
    const expanded = expandHomeDir(workspaceRoot);
    const target = await findNearestExistingParent(expanded);
    if (!target) {
        return false;
    }
    try {
        await access(target, fsConstants.W_OK);
        return true;
    }
    catch {
        return false;
    }
}
async function doesAgentIdExist(agentId) {
    const agents = await listAgents();
    return agents.some((agent) => agent.id === agentId);
}
async function listAgents() {
    try {
        const { stdout } = await execFileAsync("openclaw", ["agents", "list", "--json"], {
            timeout: 8000,
            maxBuffer: 512 * 1024,
        });
        const parsed = JSON.parse(stdout);
        const candidateRows = Array.isArray(parsed)
            ? parsed
            : typeof parsed === "object" && parsed && "agents" in parsed && Array.isArray(parsed.agents)
                ? (parsed.agents)
                : [];
        return candidateRows
            .filter((row) => Boolean(row && typeof row === "object"))
            .map((row) => {
            const id = String(row.id ?? "").trim();
            const workspacePath = String(row.workspace ?? row.workspacePath ?? "").trim();
            const canDismiss = id !== "main";
            return {
                id,
                workspacePath,
                canDismiss,
                dismissHint: canDismiss ? undefined : "main is reserved by OpenClaw",
            };
        })
            .filter((agent) => Boolean(agent.id))
            .sort((left, right) => left.id.localeCompare(right.id));
    }
    catch {
        return [];
    }
}
async function listenOnPreferredLoopbackPort(server) {
    try {
        await listenServer(server, PREFERRED_GUI_PORT);
    }
    catch (error) {
        if (!isAddressInUseError(error)) {
            throw error;
        }
        throw new Error(`Agent Team requires ${STABLE_GUI_URL}, but port ${String(PREFERRED_GUI_PORT)} is already in use. Close the old listener and try again.`);
    }
}
async function listenServer(server, port) {
    await new Promise((resolve, reject) => {
        const onError = (error) => {
            server.off("listening", onListening);
            reject(error);
        };
        const onListening = () => {
            server.off("error", onError);
            resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
    });
}
function isAddressInUseError(error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE");
}
async function findNearestExistingParent(candidate) {
    let current = path.resolve(candidate);
    while (true) {
        if (await pathExists(current)) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            return null;
        }
        current = parent;
    }
}
async function pathExists(candidate) {
    try {
        await stat(expandHomeDir(candidate));
        return true;
    }
    catch {
        return false;
    }
}
function expandHomeDir(candidate) {
    if (!candidate.startsWith("~/")) {
        return candidate;
    }
    return path.join(os.homedir(), candidate.slice(2));
}
async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    return raw ? JSON.parse(raw) : {};
}
function respondJson(res, statusCode, payload) {
    respondText(res, statusCode, JSON.stringify(payload), "application/json; charset=utf-8");
}
function respondHtml(res, html) {
    respondText(res, 200, html, "text/html; charset=utf-8");
}
function respondText(res, statusCode, text, contentType) {
    res.statusCode = statusCode;
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("pragma", "no-cache");
    res.setHeader("expires", "0");
    res.end(text);
}
function buildConnectionCacheKey(account) {
    if (!account) {
        return null;
    }
    return JSON.stringify({
        accountId: account.accountId,
        configured: account.configured,
        host: account.transport.listenHost,
        port: account.transport.listenPort,
        path: account.transport.listenPath,
    });
}
function haveConnectArtifactsExpired() {
    if (!guiState.connectionUpdatedAt) {
        return true;
    }
    return Date.now() - guiState.connectionUpdatedAt > CONNECT_ARTIFACT_TTL_MS;
}
function renderAgentWorkShellHtml() {
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
          templateId: 'coding',
          name: '',
          workspaceRoot: '${DEFAULT_WORKSPACE_ROOT.replace(/'/g, "\\'")}',
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
              '<h2 class="section-title">Recruit a new work agent</h2>' +
              '<p class="section-copy">This tab keeps the creation flow focused. Pick the posture first, then move through name and workspace without management noise mixed in.</p>' +
              '<div class="template-list">' +
                state.bootstrap.templates.map((template) => {
                  const selectedClass = template.id === state.draft.templateId ? 'template-card is-selected' : 'template-card';
                  return '<button class="' + selectedClass + '" data-template="' + template.id + '">' +
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
              '<p class="section-copy">Recruit stays narrow on purpose. Dismiss lives in its own tab so this page can stay about drafting one new agent at a time.</p>' +
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
              '<h2 class="section-title">Name the work agent</h2>' +
              '<p class="section-copy">We derive the agent id and workspace preview from one human-readable name.</p>' +
              '<div class="field"><label for="agent-name">Agent name</label><input id="agent-name" value="' + escapeHtml(state.draft.name) + '" placeholder="Research Lead" /></div>' +
              renderIssues(issues) +
              '<div class="actions">' +
                '<button class="button" data-action="back-name">Back</button>' +
                '<button class="button primary" data-action="next-name" ' + (hasBlocking ? 'disabled' : '') + '>Continue</button>' +
              '</div>' +
            '</section>' +
            '<aside class="side-panel">' +
              '<h3 class="section-title">Derived preview</h3>' +
              renderPreviewSummary(preview) +
            '</aside>' +
          '</div>';
        }

        if (state.createStep === 'workspace') {
          mainMarkup = '<div class="panel-grid">' +
            '<section class="panel">' +
              '<h2 class="section-title">Confirm workspace root</h2>' +
              '<p class="section-copy">The agent gets its own workspace under a shared employee-office root.</p>' +
              '<div class="field"><label for="workspace-root">Root workspace folder</label><input id="workspace-root" value="' + escapeHtml(state.draft.workspaceRoot) + '" placeholder="~/Documents/Agent Workspaces" /></div>' +
              renderIssues(issues) +
              '<div class="actions">' +
                '<button class="button" data-action="back-workspace">Back</button>' +
                '<button class="button primary" data-action="create-agent" ' + (hasBlocking ? 'disabled' : '') + '>Create Agent</button>' +
              '</div>' +
              (state.createError ? '<div class="notice error">' + escapeHtml(state.createError) + '</div>' : '') +
            '</section>' +
            '<aside class="side-panel">' +
              '<h3 class="section-title">Creation target</h3>' +
              renderPreviewSummary(preview) +
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
            render();
          });
        }

        const nameInput = document.getElementById('agent-name');
        if (nameInput) {
          nameInput.addEventListener('input', async (event) => {
            state.draft.name = event.target.value;
            await refreshPreview();
            render();
          });
        }

        const workspaceInput = document.getElementById('workspace-root');
        if (workspaceInput) {
          workspaceInput.addEventListener('input', async (event) => {
            state.draft.workspaceRoot = event.target.value;
            await refreshPreview();
            render();
          });
        }

        bindAction('reset', async () => {
          state.createResult = null;
          state.createError = '';
          state.dismissError = '';
          state.createStep = 'positioning';
          state.draft = { templateId: 'coding', name: '', workspaceRoot: state.bootstrap.defaultWorkspaceRoot };
          await refreshPreview();
          render();
        });
        bindAction('next-positioning', () => { state.createStep = 'name'; render(); });
        bindAction('back-name', () => { state.createStep = 'positioning'; render(); });
        bindAction('next-name', () => { state.createStep = 'workspace'; render(); });
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
          await refreshPreview();
          render();
        });
        bindAction('create-agent', async () => {
          state.createError = '';
          const response = await fetch('${GUI_API_BASE_PATH}/agents', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              templateId: state.draft.templateId,
              name: state.draft.name,
              workspaceRoot: state.draft.workspaceRoot,
            }),
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

      boot().catch((error) => {
        contentEl.innerHTML = '<div class="notice error">' + escapeHtml(error && error.message ? error.message : 'Failed to boot Agent Team.') + '</div>';
      });
    </script>
  </body>
</html>`;
}
