import { describeAccountSnapshot } from "openclaw/plugin-sdk/account-helpers";
import { formatAllowFromLowercase } from "openclaw/plugin-sdk/allow-from";
import { adaptScopedAccountAccessor, createHybridChannelConfigAdapter, } from "openclaw/plugin-sdk/channel-config-helpers";
import { createChannelPluginBase } from "openclaw/plugin-sdk/core";
import { listThouAccountIds, resolveDefaultThouAccountId, resolveThouAccount, } from "./accounts.js";
import { thouSetupWizard } from "../setup/wizard.js";
import { thouSetupAdapter } from "../setup/core.js";
export const thouMeta = {
    id: "thou",
    label: "Thou",
    selectionLabel: "Thou (iOS)",
    docsPath: "/channels/thou",
    docsLabel: "thou",
    blurb: "Thou iOS native channel with explicit boundary separation between setup, security, pairing, and transport.",
    order: 120,
};
const thouConfigAdapter = createHybridChannelConfigAdapter({
    sectionKey: "thou",
    listAccountIds: listThouAccountIds,
    resolveAccount: adaptScopedAccountAccessor(resolveThouAccount),
    defaultAccountId: resolveDefaultThouAccountId,
    clearBaseFields: [],
    resolveAllowFrom: (account) => account.allowFrom,
    formatAllowFrom: (allowFrom) => formatAllowFromLowercase({ allowFrom }),
});
export const thouChannelBase = createChannelPluginBase({
    id: "thou",
    meta: thouMeta,
    setup: thouSetupAdapter,
    setupWizard: thouSetupWizard,
    capabilities: {
        chatTypes: ["direct"],
        media: false,
        blockStreaming: true,
    },
    reload: {
        configPrefixes: ["channels.thou"],
    },
    config: {
        ...thouConfigAdapter,
        isConfigured: (account) => account.configured,
        describeAccount: (account) => describeAccountSnapshot({
            account,
            configured: account.configured,
            extra: {
                deviceLabel: account.deviceLabel,
                transportMode: account.transport.mode,
                listenPort: account.transport.listenPort,
                bootstrapMode: account.bootstrap.mode,
                notes: account.notes,
            },
        }),
    },
});
export const thouChatChannelBase = thouChannelBase;
