import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WebSocket } from "ws";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";

const GATEWAY_CLIENT_ID = "gateway-client";
const GATEWAY_CLIENT_MODE = "backend";
const GATEWAY_OPERATOR_SCOPES = ["operator.read", "operator.write"];
const GATEWAY_PROTOCOL_VERSION = 3;

type GatewayRuntimeConfig = {
  wsUrl: string;
  token: string;
};

type GatewayRpcPending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  method: string;
};

type GatewayChatRunParams = {
  text: string;
  agentId?: string;
  sessionKey?: string;
  onStart: () => void | Promise<void>;
  onChunk: (chunk: string) => void | Promise<void>;
  onDone: (reason?: string) => void | Promise<void>;
  onError: (message: string) => void | Promise<void>;
};

export type ThouInboundChatRun = {
  completion: Promise<string>;
  abort: () => Promise<boolean>;
};

export type ThouGatewayAgentSummary = {
  id: string;
  name: string;
  workspace?: string | null;
};

export type ThouGatewaySessionSummary = {
  key: string;
  label: string;
  updatedAt?: number | null;
  preview?: string | null;
};

export type ThouGatewayHistoryMessage = {
  role: "user" | "assistant";
  text: string;
  timestamp?: number | null;
};

type GatewayEventMessage = {
  type?: string;
  event?: string;
  payload?: {
    sessionKey?: string;
    runId?: string;
    state?: string;
    message?: {
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    };
    errorMessage?: string;
  };
};

function base64UrlEncode(value: Buffer | string): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Buffer {
  const normalized = String(value ?? "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, "base64");
}

function normalizeDeviceMetadataForAuth(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

function extractChatText(message: GatewayEventMessage["payload"]["message"]): string {
  if (!message || !Array.isArray(message.content)) {
    return "";
  }

  return message.content
    .filter((item) => item?.type === "text" && typeof item.text === "string")
    .map((item) => item.text ?? "")
    .join("");
}

function extractHistoryText(message: Record<string, unknown>): string {
  if (typeof message.text === "string" && message.text.trim()) {
    return message.text.trim();
  }

  const content = message.content;
  if (!Array.isArray(content)) {
    return "";
  }

  return content
    .filter((item) => item && typeof item === "object")
    .map((item) => {
      const block = item as { type?: unknown; text?: unknown };
      return block.type === "text" && typeof block.text === "string" ? block.text : "";
    })
    .join("")
    .trim();
}

function getAppendedText(previousText: string, nextText: string): string {
  if (!nextText) {
    return "";
  }

  if (nextText.startsWith(previousText)) {
    return nextText.slice(previousText.length);
  }

  return nextText;
}

function parseAgentSessionKey(sessionKey: string): {
  agentId: string;
  rest: string;
} | null {
  const normalized = String(sessionKey ?? "").trim().toLowerCase();

  if (!normalized.startsWith("agent:")) {
    return null;
  }

  const parts = normalized.split(":");
  if (parts.length < 3) {
    return null;
  }

  return {
    agentId: parts[1] ?? "",
    rest: parts.slice(2).join(":"),
  };
}

function isSameSessionKey(left: string | null | undefined, right: string | null | undefined): boolean {
  const normalizedLeft = String(left ?? "").trim().toLowerCase();
  const normalizedRight = String(right ?? "").trim().toLowerCase();

  if (!normalizedLeft || !normalizedRight) {
    return false;
  }

  if (normalizedLeft === normalizedRight) {
    return true;
  }

  const parsedLeft = parseAgentSessionKey(normalizedLeft);
  const parsedRight = parseAgentSessionKey(normalizedRight);

  if (parsedLeft && parsedRight) {
    return parsedLeft.agentId === parsedRight.agentId && parsedLeft.rest === parsedRight.rest;
  }

  if (parsedLeft) {
    return parsedLeft.rest === normalizedRight;
  }

  if (parsedRight) {
    return normalizedLeft === parsedRight.rest;
  }

  return false;
}

function normalizeSessionKey(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function isThouSessionKeyForConversation(sessionKey: string, conversationId: string): boolean {
  const normalizedKey = normalizeSessionKey(sessionKey);
  const normalizedConversationId = normalizeSessionKey(conversationId);
  if (!normalizedKey || !normalizedConversationId) {
    return false;
  }

  if (isSameSessionKey(normalizedKey, normalizedConversationId)) {
    return true;
  }

  const parsed = parseAgentSessionKey(normalizedKey);
  const rest = parsed?.rest ?? normalizedKey;
  return rest === normalizedConversationId || rest.startsWith(`dashboard:${normalizedConversationId}:`);
}

function isThouDashboardSessionKeyForConversation(sessionKey: string, conversationId: string): boolean {
  const normalizedKey = normalizeSessionKey(sessionKey);
  const normalizedConversationId = normalizeSessionKey(conversationId);
  if (!normalizedKey || !normalizedConversationId) {
    return false;
  }

  const parsed = parseAgentSessionKey(normalizedKey);
  const rest = parsed?.rest ?? normalizedKey;
  return rest.startsWith(`dashboard:${normalizedConversationId}:`);
}

function normalizeAgentId(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase() || "main";
}

function createThouMainSessionKey(agentId: string): string {
  return `agent:${normalizeAgentId(agentId)}:main`;
}

function createThouDashboardSessionKey(agentId: string): string {
  return `agent:${normalizeAgentId(agentId)}:dashboard:${crypto.randomUUID()}`;
}

async function withGatewayClient<T>(run: (client: GatewayRpcClient) => Promise<T>): Promise<T> {
  const gateway = createGatewayRuntime();
  const client = new GatewayRpcClient({
    url: gateway.wsUrl,
    token: gateway.token,
  });

  try {
    await client.connect();
    return await run(client);
  } finally {
    await client.stop();
  }
}

export async function listThouGatewayAgents(): Promise<ThouGatewayAgentSummary[]> {
  return await withGatewayClient(async (client) => {
    const response = (await client.request("agents.list", {}, 15000)) as {
      agents?: Array<{
        id?: string;
        name?: string;
        workspace?: string | null;
      }>;
    };

    const agents = Array.isArray(response?.agents) ? response.agents : [];
    return agents
      .map((agent) => {
        const id = typeof agent?.id === "string" ? agent.id.trim() : "";
        if (!id) {
          return null;
        }

        const name = typeof agent?.name === "string" ? agent.name.trim() : "";
        const workspace = typeof agent?.workspace === "string" ? agent.workspace.trim() : null;
        return {
          id,
          name: name || id,
          workspace: workspace || null,
        } satisfies ThouGatewayAgentSummary;
      })
      .filter((agent) => agent !== null);
  });
}

export async function listThouGatewaySessions(params: {
  agentId: string;
  limit?: number;
}): Promise<ThouGatewaySessionSummary[]> {
  const limit = Math.max(1, Math.min(50, Math.floor(params.limit ?? 12)));
  const agentId = normalizeAgentId(params.agentId);
  const mainSessionKey = createThouMainSessionKey(agentId);

  return await withGatewayClient(async (client) => {
    const response = (await client.request(
      "sessions.list",
      {
        limit: Math.max(limit * 3, 24),
        includeUnknown: true,
        includeDerivedTitles: true,
        includeLastMessage: true,
        agentId,
      },
      15000,
    )) as {
      sessions?: Array<{
        key?: string;
        label?: string;
        displayName?: string;
        derivedTitle?: string;
        lastMessagePreview?: string;
        updatedAt?: number | null;
      }>;
    };

    const rawSessions = Array.isArray(response?.sessions) ? response.sessions : [];
    const normalized = rawSessions
      .map((session) => {
        const key = typeof session?.key === "string" ? session.key.trim() : "";
        if (!key) {
          return null;
        }
        const label =
          (typeof session.label === "string" && session.label.trim()) ||
          (typeof session.displayName === "string" && session.displayName.trim()) ||
          (typeof session.derivedTitle === "string" && session.derivedTitle.trim()) ||
          key;
        const preview =
          typeof session.lastMessagePreview === "string" && session.lastMessagePreview.trim()
            ? session.lastMessagePreview.trim()
            : null;

        return {
          key,
          label,
          updatedAt: typeof session.updatedAt === "number" ? session.updatedAt : null,
          preview,
        } satisfies ThouGatewaySessionSummary;
      })
      .filter((session) => session !== null);

    const deduped = new Map<string, ThouGatewaySessionSummary>();
    for (const session of normalized) {
      deduped.set(session.key.toLowerCase(), session);
    }

    if (!deduped.has(mainSessionKey.toLowerCase())) {
      deduped.set(mainSessionKey.toLowerCase(), {
        key: mainSessionKey,
        label: "Main Session",
        updatedAt: null,
        preview: null,
      });
    }

    return Array.from(deduped.values())
      .sort((left, right) => {
        const leftIsMain = isSameSessionKey(left.key, mainSessionKey);
        const rightIsMain = isSameSessionKey(right.key, mainSessionKey);
        if (leftIsMain && !rightIsMain) {
          return -1;
        }
        if (!leftIsMain && rightIsMain) {
          return 1;
        }
        return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
      })
      .slice(0, limit);
  });
}

export async function createThouGatewaySession(params: {
  agentId: string;
  label?: string;
}): Promise<ThouGatewaySessionSummary> {
  const requestedLabel = String(params.label ?? "").trim() || "新会话";
  const agentId = normalizeAgentId(params.agentId);
  const requestedKey = createThouDashboardSessionKey(agentId);

  return await withGatewayClient(async (client) => {
    const response = (await client.request(
      "sessions.create",
      {
        agentId,
        key: requestedKey,
        label: requestedLabel,
      },
      15000,
    )) as {
      key?: string;
      entry?: {
        label?: string;
      };
    };

    const key = typeof response?.key === "string" && response.key.trim() ? response.key.trim() : requestedKey;
    const label =
      (typeof response?.entry?.label === "string" && response.entry.label.trim()) || requestedLabel;

    return {
      key,
      label,
      updatedAt: Date.now(),
      preview: null,
    } satisfies ThouGatewaySessionSummary;
  });
}

export async function loadThouGatewayHistory(params: {
  agentId?: string;
  sessionKey?: string;
  limit?: number;
}): Promise<ThouGatewayHistoryMessage[]> {
  const sessionKey =
    String(params.sessionKey ?? "").trim() || createThouMainSessionKey(normalizeAgentId(params.agentId));
  if (!sessionKey) {
    return [];
  }

  const limit = Math.max(1, Math.min(200, Math.floor(params.limit ?? 80)));

  return await withGatewayClient(async (client) => {
    const response = (await client.request(
      "chat.history",
      {
        sessionKey,
        limit,
      },
      15000,
    )) as {
      messages?: Array<Record<string, unknown>>;
    };

    const rawMessages = Array.isArray(response?.messages) ? response.messages : [];

    return rawMessages
      .map((message) => {
        const role = message.role;
        if (role !== "user" && role !== "assistant") {
          return null;
        }

        const text = extractHistoryText(message);
        if (!text) {
          return null;
        }

        return {
          role,
          text,
          timestamp: typeof message.timestamp === "number" ? message.timestamp : null,
        } satisfies ThouGatewayHistoryMessage;
      })
      .filter((message) => message !== null);
  });
}

function buildDeviceAuthPayloadV3(params: {
  deviceId: string;
  clientId: string;
  clientMode: string;
  role: string;
  scopes: string[];
  signedAtMs: number;
  token: string;
  nonce: string;
  platform: string;
  deviceFamily: string;
}): string {
  const scopes = params.scopes.join(",");
  return [
    "v3",
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    params.token,
    params.nonce,
    normalizeDeviceMetadataForAuth(params.platform),
    normalizeDeviceMetadataForAuth(params.deviceFamily),
  ].join("|");
}

function deriveDeviceIdentityFromPublicKey(publicKeyPem: string): {
  deviceId: string;
  publicKeyBase64Url: string;
} {
  const publicKey = crypto.createPublicKey(publicKeyPem);
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };
  if (typeof jwk?.x !== "string" || !jwk.x) {
    throw new Error("无法从 Gateway 设备公钥导出 JWK。");
  }

  const rawPublicKey = base64UrlDecode(jwk.x);
  const deviceId = crypto.createHash("sha256").update(rawPublicKey).digest("hex");

  return {
    deviceId,
    publicKeyBase64Url: jwk.x,
  };
}

function getGatewayIdentityFile(): string {
  return path.join(resolveStateDir(), "channels", "thou", "bridge", "gateway-device-identity.json");
}

function ensureGatewayDeviceIdentity(): {
  deviceId: string;
  publicKeyPem: string;
  privateKeyPem: string;
  publicKeyBase64Url: string;
} {
  const identityFile = getGatewayIdentityFile();
  fs.mkdirSync(path.dirname(identityFile), { recursive: true });

  if (fs.existsSync(identityFile)) {
    try {
      const stored = JSON.parse(fs.readFileSync(identityFile, "utf8")) as {
        deviceId?: string;
        publicKeyPem?: string;
        privateKeyPem?: string;
      };

      if (
        typeof stored.deviceId === "string" &&
        stored.deviceId &&
        typeof stored.publicKeyPem === "string" &&
        stored.publicKeyPem &&
        typeof stored.privateKeyPem === "string" &&
        stored.privateKeyPem
      ) {
        const derived = deriveDeviceIdentityFromPublicKey(stored.publicKeyPem);
        if (derived.deviceId === stored.deviceId) {
          return {
            deviceId: stored.deviceId,
            publicKeyPem: stored.publicKeyPem,
            privateKeyPem: stored.privateKeyPem,
            publicKeyBase64Url: derived.publicKeyBase64Url,
          };
        }
      }
    } catch {
      // Fall through to regeneration.
    }
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ format: "pem", type: "spki" }).toString();
  const privateKeyPem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const derived = deriveDeviceIdentityFromPublicKey(publicKeyPem);
  fs.writeFileSync(
    identityFile,
    `${JSON.stringify(
      {
        deviceId: derived.deviceId,
        publicKeyPem,
        privateKeyPem,
      },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );

  return {
    deviceId: derived.deviceId,
    publicKeyPem,
    privateKeyPem,
    publicKeyBase64Url: derived.publicKeyBase64Url,
  };
}

function signDevicePayload(privateKeyPem: string, payload: string): string {
  return base64UrlEncode(
    crypto.sign(null, Buffer.from(payload, "utf8"), crypto.createPrivateKey(privateKeyPem)),
  );
}

function createGatewayRuntime(): GatewayRuntimeConfig {
  const configFile = path.join(os.homedir(), ".openclaw", "openclaw.json");
  if (!fs.existsSync(configFile)) {
    throw new Error(`找不到 OpenClaw 配置文件: ${configFile}`);
  }

  const config = JSON.parse(fs.readFileSync(configFile, "utf8")) as {
    gateway?: { port?: number; auth?: { token?: string } };
    auth?: { token?: string };
  };
  const port = config?.gateway?.port ?? 18789;
  const token =
    process.env.OPENCLAW_GATEWAY_TOKEN ?? config?.gateway?.auth?.token ?? config?.auth?.token ?? "";

  if (!token.trim()) {
    throw new Error("OpenClaw 缺少 gateway.auth.token，无法转发 Thou 入站对话。");
  }

  return {
    wsUrl: `ws://127.0.0.1:${port}`,
    token: token.trim(),
  };
}

class GatewayRpcClient {
  readonly options: {
    url: string;
    token: string;
    onEvent?: (event: GatewayEventMessage) => void;
    onClose?: (code: number, reason: string) => void;
  };

  ws: WebSocket | null = null;
  pending = new Map<string, GatewayRpcPending>();
  nextRequestId = 1;
  connectNonce: string | null = null;
  connectSent = false;
  connected = false;
  handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  connectPromise: Promise<unknown> | null = null;
  resolveConnect: ((value: unknown) => void) | null = null;
  rejectConnect: ((error: Error) => void) | null = null;
  readonly deviceIdentity = ensureGatewayDeviceIdentity();

  constructor(options: GatewayRpcClient["options"]) {
    this.options = options;
  }

  connect(): Promise<unknown> {
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      this.resolveConnect = resolve;
      this.rejectConnect = reject;
    });

    const ws = new WebSocket(this.options.url);
    this.ws = ws;

    this.handshakeTimer = setTimeout(() => {
      this.failConnect(new Error("Gateway WS 握手超时。"));
      void this.stop();
    }, 5000);

    ws.on("message", (data) => {
      this.handleMessage(data.toString());
    });

    ws.on("error", (error) => {
      const nextError = error instanceof Error ? error : new Error(String(error));
      this.failConnect(nextError);
      this.rejectAllPending(nextError);
    });

    ws.on("close", (code, reasonBuffer) => {
      const reason = typeof reasonBuffer === "string" ? reasonBuffer : reasonBuffer.toString();
      const error = new Error(`Gateway WS 已断开: ${code} ${reason || "unknown"}`);
      if (!this.connected) {
        this.failConnect(error);
      }
      this.rejectAllPending(error);
      this.options.onClose?.(code, reason);
    });

    return this.connectPromise;
  }

  async request(method: string, params: unknown, timeoutMs = 15000): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Gateway WS 尚未连接。");
    }

    const id = String(this.nextRequestId++);

    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Gateway 请求超时: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve,
        reject: (error) => reject(error),
        timer,
        method,
      });

      this.ws?.send(
        JSON.stringify({
          type: "req",
          id,
          method,
          params,
        }),
      );
    });
  }

  async stop(): Promise<void> {
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }

    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
    }
  }

  private handleMessage(raw: string): void {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }

    if (message.type === "event") {
      if (message.event === "connect.challenge") {
        const payload = (message.payload ?? {}) as { nonce?: string };
        const nonce = typeof payload.nonce === "string" ? payload.nonce.trim() : "";
        if (!nonce) {
          const error = new Error("Gateway connect challenge 缺少 nonce。");
          this.failConnect(error);
          void this.stop();
          return;
        }
        this.connectNonce = nonce;
        if (!this.connectSent) {
          void this.sendConnect();
        }
        return;
      }

      this.options.onEvent?.(message as GatewayEventMessage);
      return;
    }

    if (message.type !== "res" || typeof message.id !== "string") {
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) {
      return;
    }

    this.pending.delete(message.id);
    clearTimeout(pending.timer);

    if (message.ok === true) {
      pending.resolve(message.payload);
      return;
    }

    const errorShape = (message.error ?? {}) as { message?: string; code?: string };
    pending.reject(new Error(errorShape.message ?? errorShape.code ?? `Gateway 请求失败: ${pending.method}`));
  }

  private async sendConnect(): Promise<void> {
    if (this.connectSent) {
      return;
    }

    const nonce = this.connectNonce?.trim() ?? "";
    if (!nonce) {
      const error = new Error("Gateway connect challenge missing nonce");
      this.failConnect(error);
      void this.stop();
      return;
    }

    this.connectSent = true;

    const signedAtMs = Date.now();
    const payload = buildDeviceAuthPayloadV3({
      deviceId: this.deviceIdentity.deviceId,
      clientId: GATEWAY_CLIENT_ID,
      clientMode: GATEWAY_CLIENT_MODE,
      role: "operator",
      scopes: GATEWAY_OPERATOR_SCOPES,
      signedAtMs,
      token: this.options.token,
      nonce,
      platform: process.platform,
      deviceFamily: "desktop",
    });

    try {
      const helloOk = await this.request(
        "connect",
        {
          minProtocol: GATEWAY_PROTOCOL_VERSION,
          maxProtocol: GATEWAY_PROTOCOL_VERSION,
          client: {
            id: GATEWAY_CLIENT_ID,
            displayName: "Thou Native Plugin",
            version: "0.1.0",
            platform: process.platform,
            deviceFamily: "desktop",
            mode: GATEWAY_CLIENT_MODE,
            instanceId: crypto.randomUUID(),
          },
          caps: [],
          auth: { token: this.options.token },
          role: "operator",
          scopes: GATEWAY_OPERATOR_SCOPES,
          device: {
            id: this.deviceIdentity.deviceId,
            publicKey: this.deviceIdentity.publicKeyBase64Url,
            signature: signDevicePayload(this.deviceIdentity.privateKeyPem, payload),
            signedAt: signedAtMs,
            nonce,
          },
        },
        15000,
      );

      this.connected = true;
      if (this.handshakeTimer) {
        clearTimeout(this.handshakeTimer);
        this.handshakeTimer = null;
      }
      this.resolveConnect?.(helloOk);
      this.resolveConnect = null;
      this.rejectConnect = null;
    } catch (error) {
      const nextError = error instanceof Error ? error : new Error(String(error));
      this.failConnect(nextError);
      void this.stop();
    }
  }

  private failConnect(error: Error): void {
    if (!this.rejectConnect) {
      return;
    }
    if (this.handshakeTimer) {
      clearTimeout(this.handshakeTimer);
      this.handshakeTimer = null;
    }
    const reject = this.rejectConnect;
    this.resolveConnect = null;
    this.rejectConnect = null;
    reject(error);
  }

  private rejectAllPending(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      clearTimeout(pending.timer);
      pending.reject(error);
      this.pending.delete(id);
    }
  }
}

export function createThouGatewayChatRun(params: GatewayChatRunParams): ThouInboundChatRun {
  const targetSessionKey =
    String(params.sessionKey ?? "").trim() || createThouMainSessionKey(normalizeAgentId(params.agentId));
  const gateway = createGatewayRuntime();
  const client = new GatewayRpcClient({
    url: gateway.wsUrl,
    token: gateway.token,
    onClose: () => {
      if (!streamFinished) {
        disconnectError = new Error("Gateway WS 连接已关闭。");
        settleReject(disconnectError);
      }
    },
    onEvent: (event) => {
      if (event.event !== "chat") {
        return;
      }

      const payload = event.payload;
      if (!payload || !isSameSessionKey(payload.sessionKey, targetSessionKey)) {
        return;
      }
      if (activeRunId && payload.runId !== activeRunId) {
        return;
      }

      const nextText = extractChatText(payload.message);

      if (payload.state === "delta") {
        const appendedText = getAppendedText(lastText, nextText);
        if (appendedText) {
          lastText = nextText;
          void params.onChunk(appendedText);
        }
        return;
      }

      if (payload.state === "final") {
        const appendedText = getAppendedText(lastText, nextText);
        if (appendedText) {
          lastText = nextText;
          void params.onChunk(appendedText);
        }
        void finishStream(async () => {
          await params.onDone("completed");
          settleResolve("completed");
        });
        return;
      }

      if (payload.state === "aborted") {
        void finishStream(async () => {
          await params.onDone("aborted");
          settleResolve("aborted");
        });
        return;
      }

      if (payload.state === "error") {
        void finishStream(async () => {
          const message = payload.errorMessage ?? "OpenClaw Gateway 运行失败。";
          await params.onError(message);
          settleReject(new Error(message));
        });
      }
    },
  });

  const idempotencyKey = crypto.randomUUID();
  let activeRunId: string | null = null;
  let lastText = "";
  let streamFinished = false;
  let abortRequested = false;
  let disconnectError: Error | null = null;
  let settled = false;

  let resolveCompletion!: (value: string) => void;
  let rejectCompletion!: (error: Error) => void;
  const streamPromise = new Promise<string>((resolve, reject) => {
    resolveCompletion = resolve;
    rejectCompletion = reject;
  });

  const settleResolve = (value: string) => {
    if (settled) {
      return;
    }
    settled = true;
    resolveCompletion(value);
  };

  const settleReject = (error: Error) => {
    if (settled) {
      return;
    }
    settled = true;
    rejectCompletion(error);
  };

  const finishStream = async (finalize: () => void | Promise<void>) => {
    if (streamFinished) {
      return;
    }
    streamFinished = true;
    await client.stop();
    await finalize();
  };

  const completion = (async () => {
    try {
      await client.connect();
      const response = (await client.request(
        "chat.send",
        {
          sessionKey: targetSessionKey,
          message: params.text,
          idempotencyKey,
        },
        15000,
      )) as { status?: string; runId?: string };

      if (!response || !["started", "in_flight", "ok"].includes(response.status ?? "")) {
        throw new Error("Gateway chat.send 未返回可接受的启动状态。");
      }

      activeRunId = typeof response.runId === "string" && response.runId ? response.runId : null;
      await params.onStart();

      return await Promise.race([
        streamPromise,
        new Promise<string>((_, reject) => {
          setTimeout(() => reject(new Error("Gateway chat 事件等待超时。")), 120000);
        }),
      ]);
    } catch (error) {
      const nextError =
        disconnectError ?? (error instanceof Error ? error : new Error(String(error)));
      await client.stop();
      if (!abortRequested) {
        await params.onError(nextError.message);
      }
      throw nextError;
    }
  })();

  const abort = async (): Promise<boolean> => {
    if (streamFinished || abortRequested) {
      return false;
    }
    abortRequested = true;

    try {
      if (!client.connected) {
        await client.stop();
        return true;
      }

      await client.request(
        "chat.abort",
        {
          sessionKey: targetSessionKey,
        },
        10000,
      );
      return true;
    } catch {
      await client.stop();
      return false;
    }
  };

  return {
    completion,
    abort,
  };
}