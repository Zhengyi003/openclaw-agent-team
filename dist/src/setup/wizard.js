import { formatDocsLink } from "openclaw/plugin-sdk/channel-setup";
import { resolveDefaultThouAccountId, resolveThouAccount } from "../channel/accounts.js";
import { ensureThouBridgeAuthToken } from "../bridge/auth.js";
import { buildThouConnectionSharePayload, buildThouConnectionShareText, } from "../connection-share.js";
export const thouSetupWizard = {
    channel: "thou",
    status: {
        configuredLabel: "可连接 iPhone",
        unconfiguredLabel: "待完成 Thou 配置",
        configuredHint: "打开卡片，复制连接信息到 iPhone 端 Thou。",
        unconfiguredHint: `先完成 Thou 基础配置，再回到这里复制连接信息。Docs: ${formatDocsLink("/channels/thou", "channels/thou")}`,
        configuredScore: 120,
        unconfiguredScore: 20,
        resolveSelectionHint: ({ configured }) => configured ? "复制连接信息" : "先完成 Thou 配置",
        resolveConfigured: ({ cfg }) => {
            const accountId = resolveDefaultThouAccountId(cfg);
            return resolveThouAccount({ cfg: cfg, accountId }).configured;
        },
        resolveStatusLines: async ({ cfg, configured }) => {
            const accountId = resolveDefaultThouAccountId(cfg);
            const account = resolveThouAccount({ cfg: cfg, accountId });
            if (!configured) {
                return [
                    "Thou 尚未完成基础配置。",
                    "完成后，这里会出现可复制到 iPhone 的连接信息。",
                ];
            }
            const { token } = ensureThouBridgeAuthToken({ accountId: account.accountId });
            const connectionPayload = await buildThouConnectionSharePayload({
                account,
                authToken: token,
            });
            const connectionText = await buildThouConnectionShareText({
                account,
                authToken: token,
            });
            if (!connectionPayload || !connectionText) {
                return [
                    "当前无法生成可复制的连接信息。",
                    "请先确认 Thou bridge 已启动，然后再刷新这个卡片。",
                ];
            }
            const alternateHosts = connectionPayload.hosts.filter((host) => host !== connectionPayload.preferredHost);
            return [
                "在 iPhone 端打开 Thou -> OpenClaw -> 连接我的 Mac。",
                "把下面这整行连接信息复制到剪贴板，再到 iPhone 端点“粘贴连接信息”。",
                `推荐宿主: ${connectionPayload.preferredHost}:${connectionPayload.port}${connectionPayload.path}`,
                alternateHosts.length > 0 ? `备选宿主: ${alternateHosts.join(", ")}` : "备选宿主: 无",
                `连接信息: ${connectionText}`,
            ];
        },
    },
    credentials: [],
    textInputs: [],
};
