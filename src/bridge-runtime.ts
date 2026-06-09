import type {
  ResolvedThouAccount,
  ThouConnectionProfileSnapshot,
  ThouMobileConnectionProfile,
} from "./types.js";
import os from "node:os";
import { ensureThouBridgeAuthToken } from "./bridge-auth.js";
import { createThouConversationId } from "./bridge-chat-session.js";
import {
  createThouGatewayChatRun,
  createThouGatewaySession,
  listThouGatewayAgents,
  listThouGatewaySessions,
  loadThouGatewayHistory,
} from "./bridge-chat-runtime.js";
import { ThouBridgeServer } from "./bridge-server.js";
import { registerThouBridge, tryGetThouBridge, unregisterThouBridge } from "./runtime.js";
import { setThouBridgeDeliveryResolver } from "./outbound.js";

export type ThouBridgeStatusSink = (patch: {
  running?: boolean;
  connected?: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastConnectedAt?: number | null;
  lastInboundAt?: number | null;
  lastDisconnect?: string | { at: number; error?: string } | null;
  lastOutboundAt?: number | null;
  lastEventAt?: number | null;
  lastError?: string | null;
  port?: number | null;
  mode?: string;
  dmPolicy?: string;
  tokenSource?: string;
}) => void;

setThouBridgeDeliveryResolver(async (payload) => {
  const bridge = tryGetThouBridge(payload.accountId);
  if (!bridge) {
    return null;
  }
  return await bridge.server.deliver(payload);
});

export function getThouConnectionProfileSnapshot(params: {
  account: ResolvedThouAccount;
}): ThouConnectionProfileSnapshot {
  const runningBridge = tryGetThouBridge(params.account.accountId);
  const tokenRecord = runningBridge
    ? {
        token: runningBridge.authToken,
        tokenFile: runningBridge.tokenFile,
        tokenSource: "runtime" as const,
      }
    : {
        ...ensureThouBridgeAuthToken({
          accountId: params.account.accountId,
        }),
        tokenSource: "state-file" as const,
      };

  const listenHost = runningBridge?.server.options.host ?? params.account.transport.listenHost;
  const listenPort = runningBridge?.server.options.port ?? params.account.transport.listenPort;
  const listenPath = runningBridge?.server.options.path ?? params.account.transport.listenPath;
  const bridgeUrl = runningBridge?.server.url ?? `ws://${listenHost}:${listenPort}${listenPath}`;

  return {
    accountId: params.account.accountId,
    accountName: params.account.name,
    deviceLabel: params.account.deviceLabel,
    generatedAt: Date.now(),
    bridge: {
      running: Boolean(runningBridge),
      connectionCount: runningBridge?.server.connectionCount ?? 0,
      mode: params.account.transport.mode,
      listenHost,
      listenPort,
      listenPath,
      url: bridgeUrl,
    },
    auth: {
      fullToken: tokenRecord.token,
      pairingTokenPrefix: tokenRecord.token.slice(0, 4),
      tokenFile: tokenRecord.tokenFile,
      tokenSource: tokenRecord.tokenSource,
    },
  };
}

export function getThouMobileConnectionProfile(params: {
  account: ResolvedThouAccount;
}): ThouMobileConnectionProfile {
  const snapshot = getThouConnectionProfileSnapshot(params);
  return {
    generatedAt: snapshot.generatedAt,
    bridge: {
      listenPort: snapshot.bridge.listenPort,
      listenPath: snapshot.bridge.listenPath,
      hostHints: collectMobileHostHints(snapshot.bridge.listenHost),
    },
    auth: {
      pairingTokenPrefix: snapshot.auth.pairingTokenPrefix,
    },
  };
}

function collectMobileHostHints(listenHost: string): string[] {
  const hints = new Set<string>();

  appendHostHint(listenHost, hints);

  const hostname = os.hostname();
  appendHostHint(hostname, hints);
  if (!hostname.includes(".")) {
    appendHostHint(`${hostname}.local`, hints);
  }

  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const address of addresses ?? []) {
      if (address.internal || address.family !== "IPv4") {
        continue;
      }
      appendHostHint(address.address, hints);
    }
  }

  return [...hints];
}

function appendHostHint(candidate: string | undefined, hints: Set<string>): void {
  const host = String(candidate ?? "").trim().toLowerCase();
  if (!host || host === "0.0.0.0" || host === "::" || host === "127.0.0.1" || host === "localhost") {
    return;
  }
  hints.add(host);
}

export async function startThouBridgeForAccount(params: {
  account: ResolvedThouAccount;
  statusSink: ThouBridgeStatusSink;
  log?: {
    info?: (message: string) => void;
    warn?: (message: string) => void;
    error?: (message: string) => void;
  };
}): Promise<{ stop: () => Promise<void> }> {
  params.log?.info?.(
    `[${params.account.accountId}] resolving Thou bridge auth token in plugin state dir`,
  );

  const { token, tokenFile } = ensureThouBridgeAuthToken({
    accountId: params.account.accountId,
  });

  params.log?.info?.(
    `[${params.account.accountId}] Thou bridge auth token ready (${tokenFile})`,
  );

  params.statusSink({
    running: true,
    connected: false,
    lastStartAt: Date.now(),
    lastError: null,
    port: params.account.transport.listenPort,
    mode: params.account.transport.mode,
    dmPolicy: params.account.dmPolicy,
    tokenSource: "state-file",
  });

  const server = await ThouBridgeServer.listen({
    authToken: token,
    host: params.account.transport.listenHost,
    port: params.account.transport.listenPort,
    path: params.account.transport.listenPath,
    getMobileConnectionProfile: () =>
      getThouMobileConnectionProfile({
        account: params.account,
      }),
    createInboundChatRun: ({ deviceId, text, agentId, sessionKey, onStart, onChunk, onDone, onError }) =>
      createThouGatewayChatRun({
        text,
        agentId: agentId?.trim() || "main",
        sessionKey: sessionKey?.trim() || createThouConversationId(deviceId, agentId?.trim() || "main"),
        onStart,
        onChunk,
        onDone,
        onError,
      }),
    listAgents: async () => {
      return await listThouGatewayAgents();
    },
    listSessions: async ({ agentId, limit }) => {
      return await listThouGatewaySessions({
        agentId: agentId?.trim() || "main",
        limit,
      });
    },
    createSession: async ({ agentId, label }) => {
      return await createThouGatewaySession({
        agentId: agentId?.trim() || "main",
        label,
      });
    },
    loadHistory: async ({ deviceId, agentId, sessionKey, limit }) => {
      return await loadThouGatewayHistory({
        agentId: agentId?.trim() || "main",
        sessionKey: sessionKey?.trim() || createThouConversationId(deviceId, agentId?.trim() || "main"),
        limit,
      });
    },
    onAuthorized: () => {
      params.log?.info?.(`[${params.account.accountId}] Thou device authorized (connections=${server.connectionCount})`);
      params.statusSink({
        connected: server.connectionCount > 0,
        lastConnectedAt: Date.now(),
        lastEventAt: Date.now(),
        lastError: null,
      });
    },
    onInbound: () => {
      params.statusSink({
        connected: server.connectionCount > 0,
        lastInboundAt: Date.now(),
        lastEventAt: Date.now(),
      });
    },
    onDisconnected: ({ deviceId, code, reason }) => {
      const reasonText = reason.trim();
      const resolvedReason = reasonText ? `${code} ${reasonText}` : String(code);
      params.log?.warn?.(
        `[${params.account.accountId}] Thou device disconnected (${deviceId}, code=${code}${reasonText ? `, reason=${reasonText}` : ""})`,
      );
      params.statusSink({
        connected: server.connectionCount > 0,
        lastDisconnect: {
          at: Date.now(),
          error: resolvedReason,
        },
        lastEventAt: Date.now(),
        lastError: `Thou device disconnected: ${resolvedReason}`,
      });
    },
    onAuthFailed: ({ deviceId, deviceLabel, providedToken }) => {
      const tokenHint = providedToken ? `${providedToken.slice(0, 4)}...` : "empty";
      params.log?.warn?.(
        `[${params.account.accountId}] Thou auth failed (deviceId=${deviceId ?? "unknown"}, deviceLabel=${deviceLabel ?? "unknown"}, token=${tokenHint})`,
      );
      params.statusSink({
        lastError: `Thou auth failed for ${deviceLabel ?? deviceId ?? "unknown device"}`,
        lastEventAt: Date.now(),
      });
    },
    onDelivered: () => {
      params.statusSink({
        connected: server.connectionCount > 0,
        lastOutboundAt: Date.now(),
        lastEventAt: Date.now(),
      });
    },
  });

  params.log?.info?.(
    `[${params.account.accountId}] Thou bridge listen completed (${params.account.transport.listenHost}:${params.account.transport.listenPort}${params.account.transport.listenPath})`,
  );

  registerThouBridge({
    accountId: params.account.accountId,
    server,
    authToken: token,
    tokenFile,
  });

  params.log?.info?.(
    `[${params.account.accountId}] Thou bridge listening on ${server.url} (token file: ${tokenFile})`,
  );

  return {
    stop: async () => {
      params.log?.info?.(`[${params.account.accountId}] closing Thou bridge server`);
      unregisterThouBridge(params.account.accountId);
      await server.stop();
      params.statusSink({
        running: false,
        connected: false,
        lastStopAt: Date.now(),
      });
    },
  };
}