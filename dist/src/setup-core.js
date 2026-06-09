import { normalizeAccountId } from "openclaw/plugin-sdk/routing";
import { DEFAULT_THOU_ACCOUNT_ID } from "./types.js";
function normalizeResolvedAccountId(accountId) {
    return normalizeAccountId(accountId) || DEFAULT_THOU_ACCOUNT_ID;
}
function parsePort(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    const trimmed = String(value ?? "").trim();
    if (!trimmed) {
        return fallback;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 65535 ? parsed : fallback;
}
function parsePositiveInt(value, fallback) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return value;
    }
    const trimmed = String(value ?? "").trim();
    if (!trimmed) {
        return fallback;
    }
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function parseAllowFrom(value) {
    if (Array.isArray(value)) {
        return value.map((entry) => entry.trim()).filter(Boolean);
    }
    if (typeof value === "string") {
        return value
            .split(/[\n,;]+/g)
            .map((entry) => entry.trim())
            .filter(Boolean);
    }
    return undefined;
}
function patchThouAccountConfig(cfg, accountId, patch) {
    const channelCfg = cfg.channels?.thou ?? {};
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            thou: {
                ...channelCfg,
                enabled: channelCfg.enabled ?? true,
                accounts: {
                    ...channelCfg.accounts,
                    [accountId]: {
                        ...(channelCfg.accounts?.[accountId] ?? {}),
                        ...patch,
                    },
                },
            },
        },
    };
}
export function setThouDmPolicy(cfg, dmPolicy) {
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            thou: {
                ...(cfg.channels?.thou ?? {}),
                dmPolicy,
            },
        },
    };
}
export function setThouAllowFrom(cfg, allowFrom) {
    return {
        ...cfg,
        channels: {
            ...cfg.channels,
            thou: {
                ...(cfg.channels?.thou ?? {}),
                allowFrom,
            },
        },
    };
}
export const thouSetupAdapter = {
    resolveAccountId: ({ accountId }) => normalizeResolvedAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) => patchThouAccountConfig(cfg, normalizeResolvedAccountId(accountId), {
        name: name?.trim(),
    }),
    validateInput: () => null,
    applyAccountConfig: ({ cfg, accountId, input }) => {
        const setupInput = input;
        const normalizedAccountId = normalizeResolvedAccountId(accountId);
        const patch = {
            enabled: true,
            name: setupInput.name?.trim(),
            deviceLabel: setupInput.deviceLabel?.trim(),
            ...(setupInput.transportMode
                ? {
                    transport: {
                        mode: setupInput.transportMode,
                        listenHost: setupInput.listenHost?.trim(),
                        listenPort: parsePort(setupInput.listenPort, 8080),
                    },
                }
                : {}),
            ...(setupInput.bootstrapMode
                ? {
                    bootstrap: {
                        mode: setupInput.bootstrapMode,
                    },
                }
                : {}),
            ...(setupInput.textChunkLimit
                ? {
                    outbound: {
                        textChunkLimit: parsePositiveInt(setupInput.textChunkLimit, 1200),
                    },
                }
                : {}),
            ...(setupInput.dmPolicy ? { dmPolicy: setupInput.dmPolicy } : {}),
            ...(parseAllowFrom(setupInput.allowFrom)
                ? { allowFrom: parseAllowFrom(setupInput.allowFrom) }
                : {}),
        };
        return patchThouAccountConfig(cfg, normalizedAccountId, patch);
    },
};
