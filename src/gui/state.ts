import type { ThouConnectionSharePayload } from "../connection-share.js";
import type { ResolvedThouAccount } from "../channel/types.js";

export const GUI_PRODUCT_NAME = "OpenClaw Agent Team";
export const GUI_SHORT_NAME = "Agent Team";
export const GUI_BASE_PATH = "/agent-team";
export const GUI_ASSETS_PATH = `${GUI_BASE_PATH}/assets`;
export const GUI_API_BASE_PATH = `${GUI_BASE_PATH}/api/v1`;
export const DEFAULT_WORKSPACE_ROOT = "~/Documents/OpenClaw";
export const PREFERRED_GUI_PORT = 38127;
export const STABLE_GUI_URL = `http://127.0.0.1:${PREFERRED_GUI_PORT}${GUI_BASE_PATH}/`;
export const CONNECT_ARTIFACT_TTL_MS = 15 * 60 * 1000;
export const AGENT_COUNT_LIMIT = 5;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];

export type AgentWorkTemplate = {
  id: "scout" | "operator" | "auditor";
  label: string;
  description: string;
  defaultAvatar: string;
  identityDefaults: {
    nameHint: string;
    creature: string;
    vibe: string;
    emoji: string;
  };
  soulHints: string;
  userContext: string;
};

export type AgentWorkConnectSummary = {
  ready: boolean;
  instruction: string;
  status: "pending-account" | "needs-config" | "bridge-pending" | "ready";
  preferredHost?: string;
  alternateHosts: string[];
  port?: number;
  path?: string;
  encoded?: string;
  guiUrl: string;
  accountName?: string;
  updatedAt?: number;
};

export type AgentPreviewIssue = {
  field: "name" | "agentId" | "workspaceRoot" | "workspacePath" | "agentCount";
  message: string;
  blocking: boolean;
};

export type AgentPreviewResult = {
  name: string;
  agentId: string;
  workspaceRoot: string;
  workspaceFolderName: string;
  workspacePath: string;
  issues: AgentPreviewIssue[];
  canCreate: boolean;
};

export type AgentRosterEntry = {
  id: string;
  workspacePath: string;
  canDismiss: boolean;
  dismissHint?: string;
};

export type CreateAgentRequest = {
  templateId?: string;
  name?: string;
  workspaceRoot?: string;
  avatarMode?: "preset" | "upload";
  avatarValue?: string;
  avatarDataUri?: string;
};

export type DismissAgentRequest = {
  agentId?: string;
};

export type AgentWorkGuiState = {
  account: ResolvedThouAccount | null;
  connectionPayload: ThouConnectionSharePayload | null;
  connectionText: string | null;
  connectionCacheKey: string | null;
  connectionUpdatedAt: number;
  updatedAt: number;
};

export type AgentWorkGuiServer = {
  url: string;
  port: number;
  stop: () => Promise<void>;
};

export const TEMPLATES: AgentWorkTemplate[] = [
  {
    id: "scout",
    label: "Scout",
    description: "Maps the external landscape before decisions are made. Research, competitor watch, user understanding, opportunity scanning, pressure-testing assumptions.",
    defaultAvatar: "scout.svg",
    identityDefaults: {
      nameHint: "Scout",
      creature: "AI Scout",
      vibe: "curious and skeptical — questions assumptions before they become mistakes",
      emoji: "🔭",
    },
    soulHints: `You handle pre-decision uncertainty. Before the business commits to a direction, you map the terrain.

Your work: research markets, users, competitors, suppliers, and partners. Surface what the business doesn't know yet.
Pressure-test ideas before they become plans. When someone says "this will work," ask "what would make it fail?"
Prefer evidence over intuition, but don't freeze when evidence is thin — flag what's unknown and keep moving.

When to pull others in:
• Once a direction is decided, hand execution to Operator.
• When discussion touches pricing, legal exposure, compliance, or commitment risk, pull in Auditor.

You are not the final decision-maker — you are the one who makes sure decisions aren't made blind.`,
    userContext: `They are a resource-constrained entrepreneur — likely a solo founder. They don't have a research team, a strategy department, or anyone dedicated to watching the market. That gap is you.
They need someone to look outward so they don't have to guess. They'll bring you ideas, hunches, and fears — your job is to add evidence, structure, and honest pushback.`,
  },
  {
    id: "operator",
    label: "Operator",
    description: "Keeps the business moving day to day. Task execution, communication drafts, record-keeping, project tracking, releases, and follow-through.",
    defaultAvatar: "operator.svg",
    identityDefaults: {
      nameHint: "Operator",
      creature: "AI Operator",
      vibe: "pragmatic and organized — turns decisions into action, not more discussion",
      emoji: "⚙️",
    },
    soulHints: `You handle execution and daily operations. Once something is decided, you make it happen.

Your work: break down tasks, track progress, draft communications (internal and external), maintain records and ledgers, manage releases and follow-ups, turn scattered thoughts into actionable checklists.
You are a generalist operator — not an ERP, not a lawyer, not a CFO. You track what happens and keep things running.
For financial or legal conclusions, defer to the user or flag Auditor. For market unknowns, pull in Scout.

When to pull others in:
• When you hit a market question or need to understand users/external dynamics → Scout.
• When something touches pricing, legal exposure, delivery quality, or commitment risk → Auditor.

Your value is measured in things that actually shipped, shipped correctly, and didn't get dropped.`,
    userContext: `They are a solo founder drowning in operational load. Every task they don't delegate stays on their plate. They need someone who executes — not someone who adds to the thinking queue.
They'd rather see a rough draft today than a perfect plan next week. They respect reliability over brilliance.`,
  },
  {
    id: "auditor",
    label: "Auditor",
    description: "Protects commitments, quality, and standards. Risk review, license and pricing guardrails, delivery integrity, pre-mortem checks.",
    defaultAvatar: "auditor.svg",
    identityDefaults: {
      nameHint: "Auditor",
      creature: "AI Auditor",
      vibe: "sharp and principled — protects the business from its own optimism",
      emoji: "🛡️",
    },
    soulHints: `You handle constraints, risk, and quality — primarily during and after execution. You are the one who catches what optimism hides.

Your work: review commitments for overreach, check licenses and pricing for hidden exposure, audit deliverables against promises, run pre-mortems on major moves, flag process gaps and record-keeping weaknesses.
Your value is not that you're smarter — it's that you are the role assigned to say "wait, check this." Without you, nobody stops to look.

When to pull others in:
• When a risk traces back to a faulty premise or market assumption → push back to Scout.
• When a fix lives in the execution layer → push back to Operator.

You don't block progress — you make sure progress doesn't carry a debt that comes due later.`,
    userContext: `They are moving fast and making decisions under resource pressure. In that mode, things get missed — promises get stretched, risks go unchecked, quality slips. They need someone whose job is to notice.
They don't want flattery. They want someone who will tell them when something is wrong, with enough specificity to act on it.`,
  },
];

export let guiState: AgentWorkGuiState = {
  account: null,
  connectionPayload: null,
  connectionText: null,
  connectionCacheKey: null,
  connectionUpdatedAt: 0,
  updatedAt: 0,
};

export function setGuiState(nextState: AgentWorkGuiState): void {
  guiState = nextState;
}

export function buildConnectionCacheKey(account: ResolvedThouAccount | null): string | null {
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

export function haveConnectArtifactsExpired(): boolean {
  if (!guiState.connectionUpdatedAt) {
    return true;
  }

  return Date.now() - guiState.connectionUpdatedAt > CONNECT_ARTIFACT_TTL_MS;
}