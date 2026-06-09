import { DEFAULT_THOU_ACCOUNT_ID, THOU_DEFAULT_BOOTSTRAP_MODE, THOU_DEFAULT_DEVICE_LABEL, THOU_DEFAULT_DM_POLICY, THOU_DEFAULT_LISTEN_HOST, THOU_DEFAULT_LISTEN_PATH, THOU_DEFAULT_LISTEN_PORT, THOU_DEFAULT_TEXT_CHUNK_LIMIT, THOU_DEFAULT_TRANSPORT_MODE, } from "./types.js";
function normalizeAccountId(accountId) {
    const trimmed = typeof accountId === "string" ? accountId.trim() : "";
    return trimmed || DEFAULT_THOU_ACCOUNT_ID;
}
function getThouChannelConfig(cfg) {
    return (cfg?.channels?.thou ?? {});
}
function getThouAccountConfig(channelCfg, accountId) {
    return (channelCfg.accounts?.[accountId] ?? {});
}
function normalizeAllowFrom(values) {
    return Array.from(new Set((values ?? [])
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean)));
}
function hasTopLevelConfig(channelCfg) {
    return Boolean(channelCfg.enabled !== undefined ||
        channelCfg.defaultAccount !== undefined ||
        channelCfg.dmPolicy !== undefined ||
        (channelCfg.allowFrom?.length ?? 0) > 0 ||
        channelCfg.transport !== undefined ||
        channelCfg.bootstrap !== undefined ||
        channelCfg.outbound !== undefined);
}
function hasAccountConfig(accountCfg) {
    return Boolean(accountCfg.enabled !== undefined ||
        accountCfg.name !== undefined ||
        accountCfg.deviceLabel !== undefined ||
        accountCfg.dmPolicy !== undefined ||
        (accountCfg.allowFrom?.length ?? 0) > 0 ||
        accountCfg.transport !== undefined ||
        accountCfg.bootstrap !== undefined ||
        accountCfg.outbound !== undefined);
}
export function listThouAccountIds(cfg) {
    const channelCfg = getThouChannelConfig(cfg);
    const accountIds = Object.keys(channelCfg.accounts ?? {}).filter(Boolean);
    if (accountIds.length === 0) {
        return [DEFAULT_THOU_ACCOUNT_ID];
    }
    return Array.from(new Set(accountIds.map((accountId) => normalizeAccountId(accountId))));
}
export function resolveDefaultThouAccountId(cfg) {
    const channelCfg = getThouChannelConfig(cfg);
    const explicit = normalizeAccountId(channelCfg.defaultAccount);
    const knownIds = listThouAccountIds(cfg);
    return knownIds.includes(explicit) ? explicit : knownIds[0] ?? DEFAULT_THOU_ACCOUNT_ID;
}
export function normalizeThouAllowEntry(entry) {
    return entry.trim();
}
export function resolveThouAccount(params) {
    const channelCfg = getThouChannelConfig(params.cfg);
    const accountId = normalizeAccountId(params.accountId ?? resolveDefaultThouAccountId(params.cfg));
    const accountCfg = getThouAccountConfig(channelCfg, accountId);
    const enabled = accountCfg.enabled ?? channelCfg.enabled ?? true;
    const name = accountCfg.name?.trim() || accountId;
    const deviceLabel = accountCfg.deviceLabel?.trim() || accountCfg.name?.trim() || THOU_DEFAULT_DEVICE_LABEL;
    const allowFrom = normalizeAllowFrom(accountCfg.allowFrom ?? channelCfg.allowFrom);
    const transportMode = accountCfg.transport?.mode ?? channelCfg.transport?.mode ?? THOU_DEFAULT_TRANSPORT_MODE;
    const listenHost = accountCfg.transport?.listenHost ?? channelCfg.transport?.listenHost ?? THOU_DEFAULT_LISTEN_HOST;
    const listenPort = accountCfg.transport?.listenPort ?? channelCfg.transport?.listenPort ?? THOU_DEFAULT_LISTEN_PORT;
    const listenPath = accountCfg.transport?.listenPath ?? channelCfg.transport?.listenPath ?? THOU_DEFAULT_LISTEN_PATH;
    const bootstrapMode = accountCfg.bootstrap?.mode ?? channelCfg.bootstrap?.mode ?? THOU_DEFAULT_BOOTSTRAP_MODE;
    const textChunkLimit = accountCfg.outbound?.textChunkLimit ??
        channelCfg.outbound?.textChunkLimit ??
        THOU_DEFAULT_TEXT_CHUNK_LIMIT;
    const configured = enabled && (hasTopLevelConfig(channelCfg) || hasAccountConfig(accountCfg));
    const notes = [];
    if (transportMode === "sidecar-bridge") {
        notes.push("当前仍以 sidecar 传输层为参照组，原生 transport 尚未落地。");
    }
    if (bootstrapMode === "sidecar-token") {
        notes.push("设备接入仍兼容 sidecar token 配对语义，后续应迁移到 Gateway device pairing。");
    }
    if ((accountCfg.dmPolicy ?? channelCfg.dmPolicy ?? THOU_DEFAULT_DM_POLICY) === "allowlist" &&
        allowFrom.length === 0) {
        notes.push("dmPolicy=allowlist 但 allowFrom 为空，当前配置不会放行任何 Thou 设备。");
    }
    return {
        accountId,
        name,
        enabled,
        configured,
        deviceLabel,
        dmPolicy: accountCfg.dmPolicy ?? channelCfg.dmPolicy ?? THOU_DEFAULT_DM_POLICY,
        allowFrom,
        transport: {
            mode: transportMode,
            listenHost,
            listenPort,
            listenPath,
        },
        bootstrap: {
            mode: bootstrapMode,
        },
        outbound: {
            textChunkLimit,
        },
        notes,
    };
}
