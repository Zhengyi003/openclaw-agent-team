import crypto from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer, WebSocket } from "ws";

const THOU_HEARTBEAT_INTERVAL_MS = 12000;
const THOU_HEARTBEAT_GRACE_MS = 8000;

export type ThouBridgeAuthMessage = {
  type: "auth";
  token?: string;
  deviceId?: string;
  deviceLabel?: string;
};

export type ThouBridgeChatMessage = {
  type: "chat";
  text?: string;
  agentId?: string;
  sessionKey?: string;
};

export type ThouBridgeChatAbortMessage = {
  type: "chat.abort";
};

export type ThouBridgeChatHistoryMessage = {
  type: "chat.history";
  requestId?: string;
  agentId?: string;
  sessionKey?: string;
  limit?: number;
};

export type ThouBridgeAgentsListMessage = {
  type: "agents.list";
  requestId?: string;
};

export type ThouBridgeSessionsListMessage = {
  type: "sessions.list";
  requestId?: string;
  agentId?: string;
  limit?: number;
};

export type ThouBridgeSessionsCreateMessage = {
  type: "sessions.create";
  requestId?: string;
  agentId?: string;
  label?: string;
};

export type ThouBridgeAgentSummary = {
  id: string;
  name: string;
  workspace?: string | null;
};

export type ThouBridgeSessionSummary = {
  key: string;
  label: string;
  updatedAt?: number | null;
  preview?: string | null;
};

export type ThouBridgeHistoryMessage = {
  role: "user" | "assistant";
  text: string;
  timestamp?: number | null;
};

export type ThouBridgeDeliveryInput = {
  accountId: string;
  to: string;
  text: string;
  replyToId?: string;
  mediaUrl?: string;
};

export type ThouBridgeDeliveryResult = {
  messageId: string;
  target: string;
  accountId: string;
  transport: "sidecar-bridge";
  text: string;
  mediaUrl?: string;
};

export type ThouBridgeServerOptions = {
  authToken: string;
  host?: string;
  port: number;
  path?: string;
  getMobileConnectionProfile?: () => {
    generatedAt: number;
    bridge: {
      listenPort: number;
      listenPath: string;
      hostHints: string[];
    };
    auth: {
      pairingTokenPrefix: string;
    };
  } | null;
  createInboundChatRun?: (params: {
    deviceId: string;
    deviceLabel: string;
    text: string;
    agentId?: string;
    sessionKey?: string;
    onStart: () => void | Promise<void>;
    onChunk: (chunk: string) => void | Promise<void>;
    onDone: (reason?: string) => void | Promise<void>;
    onError: (message: string) => void | Promise<void>;
  }) => {
    completion: Promise<unknown>;
    abort: () => Promise<boolean>;
  };
  listAgents?: (params: {
    deviceId: string;
    deviceLabel: string;
  }) => Promise<ThouBridgeAgentSummary[]>;
  listSessions?: (params: {
    deviceId: string;
    deviceLabel: string;
    agentId?: string;
    limit?: number;
  }) => Promise<ThouBridgeSessionSummary[]>;
  createSession?: (params: {
    deviceId: string;
    deviceLabel: string;
    agentId?: string;
    label?: string;
  }) => Promise<ThouBridgeSessionSummary>;
  loadHistory?: (params: {
    deviceId: string;
    deviceLabel: string;
    agentId?: string;
    sessionKey?: string;
    limit?: number;
  }) => Promise<ThouBridgeHistoryMessage[]>;
  onAuthorized?: (connection: { deviceId: string; deviceLabel: string }) => void;
  onInbound?: (message: { deviceId: string; deviceLabel: string; text: string }) => void;
  onDisconnected?: (connection: {
    deviceId: string;
    deviceLabel: string;
    code: number;
    reason: string;
  }) => void;
  onAuthFailed?: (attempt: {
    deviceId?: string;
    deviceLabel?: string;
    providedToken: string;
  }) => void;
  onDelivered?: (delivery: { target: string; accountId: string; messageId: string }) => void;
};

type ThouBridgeConnection = {
  deviceId: string;
  deviceLabel: string;
  ws: WebSocket;
};

type ThouBridgeHeartbeatState = {
  awaitingPong: boolean;
  lastPingAt: number;
  lastPongAt: number;
};

function normalizeToken(value?: string): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeDeviceId(value?: string): string {
  const trimmed = String(value ?? "").trim();
  return trimmed || `device:${crypto.randomUUID()}`;
}

function normalizeDeviceLabel(value?: string, deviceId?: string): string {
  const trimmed = String(value ?? "").trim();
  return trimmed || deviceId || "Thou iOS";
}

function sendJson(ws: WebSocket, payload: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.send(JSON.stringify(payload), (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export class ThouBridgeServer {
  readonly options: Required<Pick<ThouBridgeServerOptions, "authToken" | "port">> &
    Pick<
      ThouBridgeServerOptions,
      "host" | "path" | "getMobileConnectionProfile" | "createInboundChatRun" | "listAgents" | "listSessions" | "createSession" | "loadHistory" | "onAuthorized" | "onInbound" | "onDisconnected" | "onAuthFailed" | "onDelivered"
    >;

  readonly connections = new Map<string, ThouBridgeConnection>();

  private readonly server: WebSocketServer;

  private readonly connectionBySocket = new Map<WebSocket, ThouBridgeConnection>();

  private readonly heartbeatBySocket = new Map<WebSocket, ThouBridgeHeartbeatState>();

  private readonly heartbeatTimer: NodeJS.Timeout;

  private isStopped = false;

  constructor(options: ThouBridgeServerOptions) {
    this.options = {
      authToken: options.authToken,
      host: options.host,
      port: options.port,
      path: options.path ?? "/thou",
      getMobileConnectionProfile: options.getMobileConnectionProfile,
      createInboundChatRun: options.createInboundChatRun,
      listAgents: options.listAgents,
      listSessions: options.listSessions,
      createSession: options.createSession,
      loadHistory: options.loadHistory,
      onAuthorized: options.onAuthorized,
      onInbound: options.onInbound,
      onDisconnected: options.onDisconnected,
      onAuthFailed: options.onAuthFailed,
      onDelivered: options.onDelivered,
    };

    this.server = new WebSocketServer({
      host: this.options.host,
      port: this.options.port,
      path: this.options.path,
    });

    this.heartbeatTimer = setInterval(() => {
      this.sweepHeartbeat();
    }, THOU_HEARTBEAT_INTERVAL_MS);

    this.server.on("connection", (ws) => {
      let authorized = false;
      let connection: ThouBridgeConnection | null = null;
      let activeInboundChatRun: {
        completion: Promise<unknown>;
        abort: () => Promise<boolean>;
      } | null = null;

      this.heartbeatBySocket.set(ws, {
        awaitingPong: false,
        lastPingAt: 0,
        lastPongAt: Date.now(),
      });

      ws.on("pong", () => {
        const state = this.heartbeatBySocket.get(ws);
        if (!state) {
          return;
        }
        state.awaitingPong = false;
        state.lastPongAt = Date.now();
      });

      ws.on("message", async (data) => {
        let message:
          | ThouBridgeAuthMessage
          | ThouBridgeChatMessage
          | ThouBridgeChatAbortMessage
          | ThouBridgeChatHistoryMessage
          | ThouBridgeAgentsListMessage
          | ThouBridgeSessionsListMessage
          | ThouBridgeSessionsCreateMessage
          | null = null;

        try {
          message = JSON.parse(data.toString()) as
            | ThouBridgeAuthMessage
            | ThouBridgeChatMessage
            | ThouBridgeChatAbortMessage
            | ThouBridgeChatHistoryMessage
            | ThouBridgeAgentsListMessage
            | ThouBridgeSessionsListMessage
            | ThouBridgeSessionsCreateMessage;
        } catch {
          await sendJson(ws, { type: "error", message: "invalid json" });
          return;
        }

        if (!authorized) {
          if (message?.type !== "auth") {
            await sendJson(ws, { type: "error", message: "auth required" });
            return;
          }
          const candidate = normalizeToken(message.token);
          const configured = normalizeToken(this.options.authToken);
          const allowed = new Set([configured, configured.slice(0, 4)]);

          if (!allowed.has(candidate)) {
            this.options.onAuthFailed?.({
              deviceId: typeof message.deviceId === "string" ? message.deviceId.trim() || undefined : undefined,
              deviceLabel:
                typeof message.deviceLabel === "string" ? message.deviceLabel.trim() || undefined : undefined,
              providedToken: candidate,
            });
            await sendJson(ws, { type: "error", message: "auth failed" });
            ws.close(1008, "auth failed");
            return;
          }

          const deviceId = normalizeDeviceId(message.deviceId);
          const deviceLabel = normalizeDeviceLabel(message.deviceLabel, deviceId);
          connection = { deviceId, deviceLabel, ws };
          authorized = true;
          this.connections.set(deviceId, connection);
          this.connectionBySocket.set(ws, connection);
          this.options.onAuthorized?.({ deviceId, deviceLabel });

          await sendJson(ws, {
            type: "auth-ok",
            deviceId,
            deviceLabel,
            connectionProfile: this.options.getMobileConnectionProfile?.() ?? null,
          });

          return;
        }

        if (message?.type === "auth") {
          await sendJson(ws, { type: "error", message: "already authorized" });
          return;
        }

        if (!connection) {
          await sendJson(ws, { type: "error", message: "connection state lost" });
          return;
        }

        if (message?.type === "chat") {
          const text = String(message.text ?? "").trim();
          if (!text) {
            await sendJson(ws, { type: "error", message: "message text is required" });
            return;
          }

          if (!this.options.createInboundChatRun) {
            await sendJson(ws, { type: "error", message: "inbound chat is not implemented yet" });
            return;
          }

          if (activeInboundChatRun) {
            await sendJson(ws, { type: "error", message: "a chat run is already in progress" });
            return;
          }

          this.options.onInbound?.({
            deviceId: connection.deviceId,
            deviceLabel: connection.deviceLabel,
            text,
          });

          activeInboundChatRun = this.options.createInboundChatRun({
            deviceId: connection.deviceId,
            deviceLabel: connection.deviceLabel,
            text,
            agentId: typeof message.agentId === "string" ? message.agentId.trim() : undefined,
            sessionKey: typeof message.sessionKey === "string" ? message.sessionKey.trim() : undefined,
            onStart: async () => {
              await sendJson(ws, { type: "chat-start" });
            },
            onChunk: async (chunk) => {
              await sendJson(ws, { type: "chat.chunk", content: chunk });
            },
            onDone: async (reason = "completed") => {
              activeInboundChatRun = null;
              await sendJson(ws, { type: "chat.done", reason });
            },
            onError: async (errorMessage) => {
              activeInboundChatRun = null;
              await sendJson(ws, { type: "error", message: errorMessage });
            },
          });

          try {
            await activeInboundChatRun.completion;
          } catch {
            activeInboundChatRun = null;
          }

          return;
        }

        if (message?.type === "chat.history") {
          const requestId = typeof message.requestId === "string" ? message.requestId.trim() : "";
          if (!requestId) {
            await sendJson(ws, {
              type: "error",
              message: "requestId is required",
              requestId: null,
            });
            return;
          }

          if (!this.options.loadHistory) {
            await sendJson(ws, {
              type: "error",
              message: "chat history is not implemented yet",
              requestId,
            });
            return;
          }

          try {
            const messages = await this.options.loadHistory({
              deviceId: connection.deviceId,
              deviceLabel: connection.deviceLabel,
              agentId: typeof message.agentId === "string" ? message.agentId.trim() : undefined,
              sessionKey: typeof message.sessionKey === "string" ? message.sessionKey.trim() : undefined,
              limit: typeof message.limit === "number" ? message.limit : undefined,
            });
            await sendJson(ws, {
              type: "chat.history.result",
              requestId,
              messages,
            });
          } catch (error) {
            await sendJson(ws, {
              type: "error",
              message: error instanceof Error ? error.message : String(error),
              requestId,
            });
          }
          return;
        }

        if (message?.type === "agents.list") {
          const requestId = typeof message.requestId === "string" ? message.requestId.trim() : "";
          if (!requestId) {
            await sendJson(ws, {
              type: "error",
              message: "requestId is required",
              requestId: null,
            });
            return;
          }

          if (!this.options.listAgents) {
            await sendJson(ws, {
              type: "error",
              message: "agent listing is not implemented yet",
              requestId,
            });
            return;
          }

          try {
            const agents = await this.options.listAgents({
              deviceId: connection.deviceId,
              deviceLabel: connection.deviceLabel,
            });
            await sendJson(ws, {
              type: "agents.list.result",
              requestId,
              agents,
            });
          } catch (error) {
            await sendJson(ws, {
              type: "error",
              message: error instanceof Error ? error.message : String(error),
              requestId,
            });
          }
          return;
        }

        if (message?.type === "sessions.list") {
          const requestId = typeof message.requestId === "string" ? message.requestId.trim() : "";
          if (!requestId) {
            await sendJson(ws, {
              type: "error",
              message: "requestId is required",
              requestId: null,
            });
            return;
          }

          if (!this.options.listSessions) {
            await sendJson(ws, {
              type: "error",
              message: "session listing is not implemented yet",
              requestId,
            });
            return;
          }

          try {
            const sessions = await this.options.listSessions({
              deviceId: connection.deviceId,
              deviceLabel: connection.deviceLabel,
              agentId: typeof message.agentId === "string" ? message.agentId.trim() : undefined,
              limit: typeof message.limit === "number" ? message.limit : undefined,
            });
            await sendJson(ws, {
              type: "sessions.list.result",
              requestId,
              sessions,
            });
          } catch (error) {
            await sendJson(ws, {
              type: "error",
              message: error instanceof Error ? error.message : String(error),
              requestId,
            });
          }
          return;
        }

        if (message?.type === "sessions.create") {
          const requestId = typeof message.requestId === "string" ? message.requestId.trim() : "";
          if (!requestId) {
            await sendJson(ws, {
              type: "error",
              message: "requestId is required",
              requestId: null,
            });
            return;
          }

          if (!this.options.createSession) {
            await sendJson(ws, {
              type: "error",
              message: "session creation is not implemented yet",
              requestId,
            });
            return;
          }

          try {
            const session = await this.options.createSession({
              deviceId: connection.deviceId,
              deviceLabel: connection.deviceLabel,
              agentId: typeof message.agentId === "string" ? message.agentId.trim() : undefined,
              label: typeof message.label === "string" ? message.label.trim() : undefined,
            });
            await sendJson(ws, {
              type: "sessions.create.result",
              requestId,
              session,
            });
          } catch (error) {
            await sendJson(ws, {
              type: "error",
              message: error instanceof Error ? error.message : String(error),
              requestId,
            });
          }
          return;
        }

        if (message?.type === "chat.abort") {
          if (!activeInboundChatRun) {
            await sendJson(ws, { type: "error", message: "no active chat run" });
            return;
          }

          const aborted = await activeInboundChatRun.abort();
          if (!aborted) {
            await sendJson(ws, { type: "error", message: "abort failed" });
          }
          return;
        }

        await sendJson(ws, { type: "error", message: "unsupported message type" });
      });

      ws.on("close", (code, reasonBuffer) => {
        void activeInboundChatRun?.abort();
        this.heartbeatBySocket.delete(ws);

        if (!connection) {
          return;
        }

        const reason =
          typeof reasonBuffer === "string" ? reasonBuffer : reasonBuffer.toString("utf8");

        this.connections.delete(connection.deviceId);
        this.connectionBySocket.delete(ws);
        this.options.onDisconnected?.({
          deviceId: connection.deviceId,
          deviceLabel: connection.deviceLabel,
          code,
          reason,
        });
      });
    });
  }

  static async listen(options: ThouBridgeServerOptions): Promise<ThouBridgeServer> {
    const server = new ThouBridgeServer(options);

    await new Promise<void>((resolve, reject) => {
      server.server.once("listening", () => resolve());
      server.server.once("error", (error) => reject(error));
    });

    return server;
  }

  get url(): string {
    const address = this.server.address() as AddressInfo | null;
    const host =
      address?.address && address.address !== "::"
        ? address.address
        : this.options.host ?? "127.0.0.1";
    const port = address?.port ?? this.options.port;
    return `ws://${host}:${port}${this.options.path}`;
  }

  get connectionCount(): number {
    return this.connections.size;
  }

  async deliver(input: ThouBridgeDeliveryInput): Promise<ThouBridgeDeliveryResult> {
    const target = input.to.trim();
    if (!target) {
      throw new Error("Thou bridge target is required");
    }

    const connection = this.connections.get(target);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      throw new Error(`Thou bridge target is not connected: ${target}`);
    }

    const messageId = `thou-bridge-${crypto.randomUUID()}`;

    await sendJson(connection.ws, {
      type: "chat-start",
      messageId,
      accountId: input.accountId,
      to: target,
      ...(input.replyToId ? { replyToId: input.replyToId } : {}),
    });
    await sendJson(connection.ws, {
      type: "chat.chunk",
      messageId,
      content: input.text,
      ...(input.mediaUrl ? { mediaUrl: input.mediaUrl } : {}),
    });
    await sendJson(connection.ws, {
      type: "chat.done",
      messageId,
      reason: "completed",
    });

    this.options.onDelivered?.({
      target,
      accountId: input.accountId,
      messageId,
    });

    return {
      messageId,
      target,
      accountId: input.accountId,
      transport: "sidecar-bridge",
      text: input.text,
      ...(input.mediaUrl ? { mediaUrl: input.mediaUrl } : {}),
    };
  }

  async stop(): Promise<void> {
    if (this.isStopped) {
      return;
    }

    this.isStopped = true;
    clearInterval(this.heartbeatTimer);
    this.heartbeatBySocket.clear();

    for (const connection of this.connectionBySocket.values()) {
      connection.ws.close(1001, "server stopping");
    }

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private sweepHeartbeat(): void {
    const now = Date.now();

    for (const ws of this.server.clients) {
      if (ws.readyState !== WebSocket.OPEN) {
        continue;
      }

      const state = this.heartbeatBySocket.get(ws);
      if (!state) {
        continue;
      }

      if (state.awaitingPong) {
        if (now - state.lastPingAt >= THOU_HEARTBEAT_GRACE_MS) {
          this.heartbeatBySocket.delete(ws);
          ws.terminate();
        }
        continue;
      }

      state.awaitingPong = true;
      state.lastPingAt = now;

      try {
        ws.ping();
      } catch {
        this.heartbeatBySocket.delete(ws);
        ws.terminate();
      }
    }
  }
}
