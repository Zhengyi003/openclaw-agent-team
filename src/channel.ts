import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import { createChatChannelPlugin } from "openclaw/plugin-sdk/core";
import {
  createAccountStatusSink,
  runPassiveAccountLifecycle,
} from "openclaw/plugin-sdk/channel-lifecycle";
import { ensureThouBridgeAuthToken } from "./bridge-auth.js";
import {
  buildThouConnectionSharePayload,
  buildThouConnectionShareText,
} from "./connection-share.js";
import { ensureAgentWorkGuiServer } from "./gui-server.js";
import { getThouRuntime } from "./runtime.js";
import { thouChatChannelBase } from "./channel.base.js";
import {
  THOU_PAIRING_APPROVED_MESSAGE,
  THOU_DEFAULT_DM_POLICY,
} from "./types.js";
import type { ResolvedThouAccount, ThouRootConfig } from "./types.js";
import { collectThouChannelWarnings, createThouNotImplementedError } from "./transport.js";
import { normalizeThouAllowEntry } from "./accounts.js";
import { deliverThouMedia, deliverThouText } from "./outbound.js";
import { startThouBridgeForAccount } from "./bridge-runtime.js";

function normalizeThouMessagingTarget(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }

  const withoutPrefixes = trimmed.replace(/^(thou:)/i, "").trim();
  const normalized = withoutPrefixes.replace(/^(user:|device:)/i, "device:");
  return normalized || undefined;
}

function looksLikeThouTargetId(raw: string, normalized?: string): boolean {
  const candidate = (normalized ?? raw).trim();
  return /^device:[^\s]+$/i.test(candidate);
}

const thouChatPlugin = createChatChannelPlugin({
  base: thouChatChannelBase,
  security: {
    dm: {
      channelKey: "thou",
      resolvePolicy: (account) => account.dmPolicy,
      resolveAllowFrom: (account) => account.allowFrom,
      defaultPolicy: THOU_DEFAULT_DM_POLICY,
    },
    collectWarnings: ({ cfg, accountId }) =>
      collectThouChannelWarnings({
        cfg: cfg as ThouRootConfig,
        accountId,
      }),
  },
  pairing: {
    text: {
      idLabel: "thouDevice",
      message: THOU_PAIRING_APPROVED_MESSAGE,
      normalizeAllowEntry: normalizeThouAllowEntry,
      notify: async ({ id }) => {
        throw createThouNotImplementedError(`pairing notify (${id})`);
      },
    },
  },
  outbound: {
    base: {
      deliveryMode: "direct",
      chunker: (text, limit) => getThouRuntime().channel.text.chunkMarkdownText(text, limit),
      chunkerMode: "markdown",
      textChunkLimit: 1200,
    },
    attachedResults: {
      channel: "thou",
      sendText: async ({ to, text, accountId, replyToId }) =>
        await deliverThouText({
          to,
          text,
          accountId,
          replyToId,
        }),
      sendMedia: async ({ to, text, mediaUrl, accountId, replyToId }) =>
        await deliverThouMedia({
          to,
          text,
          mediaUrl,
          accountId,
          replyToId,
        }),
    },
  },
});

export const thouPlugin: ChannelPlugin<ResolvedThouAccount> = {
  ...thouChatPlugin,
  messaging: {
    normalizeTarget: normalizeThouMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeThouTargetId,
      hint: "Use a paired device id such as device:test-ios",
    },
    parseExplicitTarget: ({ raw }) => {
      const normalized = normalizeThouMessagingTarget(raw);
      if (!normalized || !looksLikeThouTargetId(raw, normalized)) {
        return null;
      }
      return {
        to: normalized,
        chatType: "direct",
      };
    },
  },
  status: {
    buildAccountSnapshot: async ({ account, runtime }) => {
      const { token } = ensureThouBridgeAuthToken({
        accountId: account.accountId,
      });
      const connectionPayload = await buildThouConnectionSharePayload({
        account,
        authToken: token,
      });
      const connectionText = await buildThouConnectionShareText({
        account,
        authToken: token,
      });

      return {
        accountId: account.accountId,
        name: account.name,
        enabled: account.enabled,
        configured: account.configured,
        dmPolicy: account.dmPolicy,
        allowFrom: account.allowFrom,
        mode: account.transport.mode,
        port: account.transport.listenPort,
        connectionSetup: connectionPayload
          ? {
              instruction:
                "在 iPhone 端打开 Thou -> OpenClaw -> 连接我的 Mac，然后粘贴下面这整行连接信息。",
              preferredHost: connectionPayload.preferredHost,
              alternateHosts: connectionPayload.hosts.filter(
                (host) => host !== connectionPayload.preferredHost,
              ),
              path: connectionPayload.path,
              port: connectionPayload.port,
              encoded: connectionText,
            }
          : null,
        ...(runtime ?? {}),
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const agentTeamUi = await ensureAgentWorkGuiServer({ account });
      ctx.log?.info?.(`[${account.accountId}] Agent Team UI available at ${agentTeamUi.url}`);

      const writeStatus = createAccountStatusSink({
        accountId: ctx.accountId,
        setStatus: ctx.setStatus,
      });
      const statusSink = (patch: Parameters<typeof writeStatus>[0]) => {
        ctx.log?.info?.(
          `[${account.accountId}] Thou runtime patch ${JSON.stringify(patch)}`,
        );
        writeStatus(patch);
      };

      if (!account.enabled || account.transport.mode !== "sidecar-bridge") {
        ctx.log?.info(
          `[${account.accountId}] Thou bridge skipped (enabled=${String(account.enabled)}, mode=${account.transport.mode})`,
        );
        statusSink({
          running: false,
          connected: false,
          mode: account.transport.mode,
        });
        return;
      }

      if (!account.configured) {
        ctx.log?.warn?.(`[${account.accountId}] Thou bridge skipped: account is not configured`);
        statusSink({
          running: false,
          connected: false,
          configured: false,
          mode: account.transport.mode,
          port: account.transport.listenPort,
          lastError: "Thou bridge 未启动：当前账号尚未完成配置。",
        });
        return;
      }

      const { token } = ensureThouBridgeAuthToken({
        accountId: account.accountId,
      });
      const connectionPayload = await buildThouConnectionSharePayload({
        account,
        authToken: token,
      });
      const connectionText = await buildThouConnectionShareText({
        account,
        authToken: token,
      });
      await ensureAgentWorkGuiServer({
        account,
        connectionPayload,
        connectionText,
      });

      ctx.log?.info(
        `[${account.accountId}] starting Thou bridge (${account.transport.listenHost}:${account.transport.listenPort}${account.transport.listenPath})`,
      );

      await runPassiveAccountLifecycle({
        abortSignal: ctx.abortSignal,
        start: async () =>
          await startThouBridgeForAccount({
            account,
            statusSink,
            log: ctx.log,
          }),
        stop: async (handle) => {
          ctx.log?.info?.(`[${account.accountId}] stopping Thou bridge`);
          await handle.stop();
        },
        onStop: async () => {
          ctx.log?.info?.(`[${account.accountId}] Thou bridge lifecycle stopped`);
        },
      });
    },
  },
};