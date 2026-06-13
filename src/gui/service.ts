import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { ensureThouBridgeAuthToken } from "../bridge/auth.js";
import {
  buildThouConnectionSharePayload,
  buildThouConnectionShareText,
} from "../connection-share.js";
import type { ThouConnectionSharePayload } from "../connection-share.js";
import {
  buildConnectionCacheKey,
  DEFAULT_WORKSPACE_ROOT,
  guiState,
  haveConnectArtifactsExpired,
  setGuiState,
  AGENT_COUNT_LIMIT,
  AVATAR_MAX_BYTES,
  AVATAR_ALLOWED_EXTENSIONS,
  TEMPLATES,
  type AgentPreviewIssue,
  type AgentPreviewResult,
  type AgentRosterEntry,
  type AgentWorkConnectSummary,
  type AgentWorkTemplate,
  type CreateAgentRequest,
} from "./state.js";

const execFileAsync = promisify(execFile);

export async function buildConnectSummary(guiUrl: string): Promise<AgentWorkConnectSummary> {
  if (!guiState.account) {
    return {
      ready: false,
      status: "pending-account",
      instruction:
        "Agent Team is waiting for the plugin runtime to publish a Thou account snapshot. If the plugin just started, refresh this page in a few seconds.",
      alternateHosts: [],
      guiUrl,
      updatedAt: guiState.updatedAt || undefined,
    };
  }

  if (!guiState.account.configured) {
    return {
      ready: false,
      status: "needs-config",
      instruction:
        "Finish the basic Thou setup first. Agent Team will show a copy-ready iPhone connection line after the Thou account is configured.",
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
      instruction:
        "The Thou account is configured, but Agent Team could not derive a copy-ready connection profile yet. Confirm the Thou channel is still using the current bridge settings, then refresh this tab.",
      alternateHosts: [],
      guiUrl,
      accountName: guiState.account?.name,
      updatedAt: guiState.updatedAt || undefined,
    };
  }

  return {
    ready: true,
    status: "ready",
    instruction:
      "Open Thou on iPhone, choose OpenClaw, then start the connection by pasting the full connection line shown below.",
    preferredHost: connectionArtifacts.connectionPayload.preferredHost,
    alternateHosts: connectionArtifacts.connectionPayload.hosts.filter(
      (host) => host !== connectionArtifacts.connectionPayload.preferredHost,
    ),
    port: connectionArtifacts.connectionPayload.port,
    path: connectionArtifacts.connectionPayload.path,
    encoded: connectionArtifacts.connectionText,
    guiUrl,
    accountName: guiState.account?.name,
    updatedAt: guiState.updatedAt || undefined,
  };
}

export async function buildAgentPreview(payload: CreateAgentRequest): Promise<AgentPreviewResult> {
  const name = String(payload.name ?? "").trim();
  const workspaceRoot = normalizeWorkspaceRoot(payload.workspaceRoot);
  const workspaceFolderName = name || "New Agent";
  const agentId = slugifyAgentId(name);
  const workspacePath = joinWorkspacePath(workspaceRoot, workspaceFolderName);
  const issues: AgentPreviewIssue[] = [];

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

  if (!(await doesAgentIdExist("main"))) {
    // main always exists in a functional OpenClaw profile, so this is a canary.
    // But the real check: enforce the agent count limit.
  }
  const agentCount = await getAgentCount();
  if (agentCount >= AGENT_COUNT_LIMIT) {
    issues.push({
      field: "agentCount",
      message: `Agent limit reached (${AGENT_COUNT_LIMIT} maximum). Dismiss an existing agent before recruiting a new one.`,
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

export async function createAgent(
  preview: AgentPreviewResult,
  request: CreateAgentRequest,
): Promise<void> {
  await mkdir(expandHomeDir(preview.workspaceRoot), { recursive: true });

  await execFileAsync(
    "openclaw",
    [
      "agents",
      "add",
      preview.agentId,
      "--workspace",
      expandHomeDir(preview.workspacePath),
      "--non-interactive",
      "--json",
    ],
    {
      timeout: 15000,
      maxBuffer: 512 * 1024,
    },
  );

  const template = resolveTemplate(request.templateId);
  const workspaceAbs = expandHomeDir(preview.workspacePath);

  // Copy avatar into workspace root
  let avatarRelPath = template.defaultAvatar;
  try {
    if (request.avatarMode === "upload" && request.avatarDataUri) {
      const ext = detectDataUriExtension(request.avatarDataUri) ?? ".png";
      const avatarFilename = `agent${ext}`;
      const avatarAbsPath = path.join(workspaceAbs, avatarFilename);
      await writeFile(avatarAbsPath, decodeDataUri(request.avatarDataUri));
      avatarRelPath = avatarFilename;
    } else if (request.avatarMode === "preset" && request.avatarValue) {
      const bundledSvg = getBundledAvatarSvg(request.avatarValue);
      if (bundledSvg) {
        const avatarFilename = `${request.avatarValue}.svg`;
        await writeFile(path.join(workspaceAbs, avatarFilename), bundledSvg, "utf8");
        avatarRelPath = avatarFilename;
      }
    }
  } catch {
    // Avatar seeding is best-effort; the agent is already created.
    avatarRelPath = template.defaultAvatar;
  }

  // Write template workspace files
  await writeFile(
    path.join(workspaceAbs, "IDENTITY.md"),
    generateIdentityMd(template, preview.name, avatarRelPath),
    "utf8",
  );
  await writeFile(
    path.join(workspaceAbs, "SOUL.md"),
    generateSoulMd(template, preview.name),
    "utf8",
  );
  await writeFile(
    path.join(workspaceAbs, "USER.md"),
    generateUserMd(template),
    "utf8",
  );
}

export function humanizeAgentCreateError(errorMessage: string, preview: AgentPreviewResult): string {
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

export function humanizeAgentDismissError(agentId: string, errorMessage: string): string {
  const normalized = errorMessage.trim();
  const lower = normalized.toLowerCase();

  if (agentId === "main" || lower.includes("main cannot be deleted") || lower.includes("main cannot be deleted")) {
    return "main is reserved and cannot be dismissed.";
  }
  if (lower.includes("not found") || lower.includes("unknown agent")) {
    return `Agent "${agentId}" no longer exists in the current OpenClaw profile.`;
  }
  if (!normalized) {
    return `OpenClaw rejected dismissing "${agentId}" without a detailed error. Check Gateway logs and try again.`;
  }
  return normalized;
}

export async function dismissAgent(agentId: string): Promise<void> {
  try {
    await execFileAsync(
      "openclaw",
      ["agents", "delete", agentId, "--force", "--json"],
      {
        timeout: 15000,
        maxBuffer: 512 * 1024,
      },
    );
    return;
  } catch (error) {
    const stderr =
      typeof error === "object" && error && "stderr" in error
        ? String((error as { stderr?: string }).stderr ?? "")
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

    await execFileAsync(
      "openclaw",
      ["agents", "delete", agentId, "--force", "--json"],
      {
        timeout: 15000,
        maxBuffer: 512 * 1024,
      },
    );
  }
}

export async function listAgents(): Promise<AgentRosterEntry[]> {
  try {
    const { stdout } = await execFileAsync(
      "openclaw",
      ["agents", "list", "--json"],
      {
        timeout: 8000,
        maxBuffer: 512 * 1024,
      },
    );

    const parsed = JSON.parse(stdout) as unknown;
    const candidateRows = Array.isArray(parsed)
      ? parsed
      : typeof parsed === "object" && parsed && "agents" in parsed && Array.isArray((parsed as { agents?: unknown[] }).agents)
        ? ((parsed as { agents: unknown[] }).agents)
        : [];

    return candidateRows
      .filter((row): row is Record<string, unknown> => Boolean(row && typeof row === "object"))
      .map((row) => {
        const id = String(row.id ?? "").trim();
        const workspacePath = String(row.workspace ?? row.workspacePath ?? "").trim();
        const canDismiss = id !== "main";
        return {
          id,
          workspacePath,
          canDismiss,
          dismissHint: canDismiss ? undefined : "main is reserved by OpenClaw",
        } satisfies AgentRosterEntry;
      })
      .filter((agent) => Boolean(agent.id))
      .sort((left, right) => left.id.localeCompare(right.id));
  } catch {
    return [];
  }
}

async function resolveConnectArtifacts(): Promise<{
  connectionPayload: ThouConnectionSharePayload;
  connectionText: string;
} | null> {
  if (!guiState.account?.configured) {
    return null;
  }

  if (
    guiState.connectionPayload &&
    guiState.connectionText &&
    !haveConnectArtifactsExpired() &&
    guiState.connectionCacheKey === buildConnectionCacheKey(guiState.account)
  ) {
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

  setGuiState({
    ...guiState,
    connectionPayload,
    connectionText,
    connectionCacheKey: buildConnectionCacheKey(guiState.account),
    connectionUpdatedAt: Date.now(),
    updatedAt: Date.now(),
  });

  return {
    connectionPayload,
    connectionText,
  };
}

function normalizeWorkspaceRoot(workspaceRoot?: string): string {
  const trimmed = String(workspaceRoot ?? "").trim();
  return trimmed || DEFAULT_WORKSPACE_ROOT;
}

function slugifyAgentId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function joinWorkspacePath(root: string, folderName: string): string {
  return `${root.replace(/[\\/]+$/g, "")}/${folderName.trim()}`;
}

async function isWorkspaceRootWritable(workspaceRoot: string): Promise<boolean> {
  const expanded = expandHomeDir(workspaceRoot);
  const target = await findNearestExistingParent(expanded);
  if (!target) {
    return false;
  }
  try {
    await access(target, fsConstants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function doesAgentIdExist(agentId: string): Promise<boolean> {
  const agents = await listAgents();
  return agents.some((agent) => agent.id === agentId);
}

async function findNearestExistingParent(candidate: string): Promise<string | null> {
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

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await stat(expandHomeDir(candidate));
    return true;
  } catch {
    return false;
  }
}

function expandHomeDir(candidate: string): string {
  if (!candidate.startsWith("~/")) {
    return candidate;
  }
  return path.join(os.homedir(), candidate.slice(2));
}

// --- Template file generators ---

function resolveTemplate(templateId?: string): AgentWorkTemplate {
  return TEMPLATES.find((t) => t.id === templateId) ?? TEMPLATES[0];
}

function generateIdentityMd(
  template: AgentWorkTemplate,
  agentName: string,
  avatarRelPath: string,
): string {
  const d = template.identityDefaults;
  return `# IDENTITY.md — Who I Am

- **Name:** ${agentName}
- **Creature:** ${d.creature}
- **Vibe:** ${d.vibe}
- **Emoji:** ${d.emoji}
- **Avatar:** ${avatarRelPath}

---

This file was seeded by Agent Team based on the **${template.label}** template.
Edit it freely — it belongs to this agent now.

## Related

- [Agent workspace](https://openclaw.ai/docs/concepts/agent-workspace)
`;
}

function generateSoulMd(template: AgentWorkTemplate, agentName: string): string {
  return `# SOUL.md — How ${agentName} Shows Up

## Core Truth

${template.soulHints}

## Boundaries

- Private things stay private.
- When unsure about external actions, check first.
- Never send half-finished replies to messaging surfaces.
- You are not the user's spokesperson — be careful in group settings.

## Continuity

You wake up fresh in every session. These files *are* your memory.
Read them. Update them. This is how you carry yourself forward.

If you change this file, tell the user — this is your soul, and they should know.

---

_Seeded by Agent Team as part of the **${template.label}** template._
`;
}

function generateUserMd(template: AgentWorkTemplate): string {
  return `# USER.md — Who I Work With

- **Name:** _(fill this in together)_
- **Call them:** _(how should you address them?)_
- **Timezone:** _(ask them)_
- **Notes:** _(what you learn over time)_

## Context

${template.userContext}

---

_Seeded by Agent Team. Update as you learn more about the person you're helping._
`;
}

// --- Avatar helpers ---

function detectDataUriExtension(dataUri: string): string | null {
  const match = /^data:image\/([\w+-]+);base64,/.exec(dataUri);
  if (!match) {
    return null;
  }
  const mimeType = match[1].toLowerCase();
  const ext = `.${mimeType === "jpeg" ? "jpg" : mimeType}`;
  if (AVATAR_ALLOWED_EXTENSIONS.includes(ext)) {
    return ext;
  }
  return null;
}

function decodeDataUri(dataUri: string): Buffer {
  const base64 = dataUri.replace(/^data:[^;]+;base64,/, "");
  return Buffer.from(base64, "base64");
}

export function getBundledAvatarSvg(avatarId: string): string | null {
  const avatars: Record<string, string> = {
    scout: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
  <rect width="120" height="120" rx="24" fill="#0F3B3B"/>
  <circle cx="44" cy="44" r="16" stroke="#64B5F6" stroke-width="3" fill="none"/>
  <circle cx="60" cy="60" r="24" stroke="#64B5F6" stroke-width="2.5" fill="none"/>
  <circle cx="60" cy="60" r="5" fill="#64B5F6"/>
  <line x1="72" y1="36" x2="86" y2="22" stroke="#64B5F6" stroke-width="3" stroke-linecap="round"/>
  <line x1="86" y1="22" x2="90" y2="20" stroke="#64B5F6" stroke-width="2.5" stroke-linecap="round"/>
  <path d="M36 70 L42 90 L78 90 L84 70" stroke="#64B5F6" stroke-width="1.5" fill="none" opacity="0.5"/>
</svg>`,
    operator: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
  <rect width="120" height="120" rx="24" fill="#3D2B1A"/>
  <circle cx="60" cy="52" r="18" stroke="#F4A460" stroke-width="2.5" fill="none"/>
  <circle cx="60" cy="52" r="6" fill="#F4A460"/>
  <circle cx="60" cy="52" r="22" stroke="#F4A460" stroke-width="1.5" stroke-dasharray="6 4" fill="none" opacity="0.5"/>
  <line x1="36" y1="80" x2="84" y2="80" stroke="#F4A460" stroke-width="3" stroke-linecap="round"/>
  <line x1="44" y1="80" x2="44" y2="94" stroke="#F4A460" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="60" y1="80" x2="60" y2="94" stroke="#F4A460" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="76" y1="80" x2="76" y2="94" stroke="#F4A460" stroke-width="2.5" stroke-linecap="round"/>
</svg>`,
    auditor: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" fill="none">
  <rect width="120" height="120" rx="24" fill="#311B3D"/>
  <path d="M60 22 L88 38 L88 70 C88 85 72 96 60 100 C48 96 32 85 32 70 L32 38 Z" stroke="#C9A0DC" stroke-width="3" fill="none"/>
  <line x1="60" y1="42" x2="60" y2="68" stroke="#C9A0DC" stroke-width="2.5" stroke-linecap="round"/>
  <line x1="48" y1="54" x2="72" y2="54" stroke="#C9A0DC" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="60" cy="42" r="3" fill="#C9A0DC"/>
  <line x1="36" y1="28" x2="42" y2="26" stroke="#C9A0DC" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>
  <line x1="78" y1="26" x2="84" y2="28" stroke="#C9A0DC" stroke-width="1.5" stroke-linecap="round" opacity="0.4"/>
</svg>`,
  };
  return avatars[avatarId] ?? null;
}

async function getAgentCount(): Promise<number> {
  const agents = await listAgents();
  return agents.filter((a) => a.id !== "main").length;
}