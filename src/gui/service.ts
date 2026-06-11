import { execFile } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, stat } from "node:fs/promises";
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
  type AgentPreviewIssue,
  type AgentPreviewResult,
  type AgentRosterEntry,
  type AgentWorkConnectSummary,
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

export async function createAgent(preview: AgentPreviewResult): Promise<void> {
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