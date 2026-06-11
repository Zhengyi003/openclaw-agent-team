import type { ChannelSetupAdapter, ChannelSetupInput } from "openclaw/plugin-sdk/channel-setup";
import { normalizeAccountId } from "openclaw/plugin-sdk/routing";
import { DEFAULT_THOU_ACCOUNT_ID } from "../channel/types.js";
import type {
	ThouAccountConfig,
	ThouBootstrapMode,
	ThouDmPolicy,
	ThouRootConfig,
	ThouTransportMode,
} from "../channel/types.js";

type ThouSetupInput = ChannelSetupInput & {
	deviceLabel?: string;
	transportMode?: string;
	listenHost?: string;
	listenPort?: number | string;
	bootstrapMode?: string;
	textChunkLimit?: number | string;
	dmPolicy?: ThouDmPolicy;
	allowFrom?: string[] | string;
};

function normalizeResolvedAccountId(accountId?: string | null): string {
	return normalizeAccountId(accountId) || DEFAULT_THOU_ACCOUNT_ID;
}

function parsePort(value: string | number | undefined, fallback: number): number {
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

function parsePositiveInt(value: string | number | undefined, fallback: number): number {
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

function parseAllowFrom(value?: string[] | string): string[] | undefined {
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

function patchThouAccountConfig(
	cfg: ThouRootConfig,
	accountId: string,
	patch: Partial<ThouAccountConfig>,
): ThouRootConfig {
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

export function setThouDmPolicy(cfg: ThouRootConfig, dmPolicy: ThouDmPolicy): ThouRootConfig {
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

export function setThouAllowFrom(cfg: ThouRootConfig, allowFrom: string[]): ThouRootConfig {
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

export const thouSetupAdapter: ChannelSetupAdapter = {
	resolveAccountId: ({ accountId }) => normalizeResolvedAccountId(accountId),
	applyAccountName: ({ cfg, accountId, name }) =>
		patchThouAccountConfig(cfg as ThouRootConfig, normalizeResolvedAccountId(accountId), {
			name: name?.trim(),
		}),
	validateInput: () => null,
	applyAccountConfig: ({ cfg, accountId, input }) => {
		const setupInput = input as ThouSetupInput;
		const normalizedAccountId = normalizeResolvedAccountId(accountId);
		const patch: Partial<ThouAccountConfig> = {
			enabled: true,
			name: setupInput.name?.trim(),
			deviceLabel: setupInput.deviceLabel?.trim(),
			...(setupInput.transportMode
				? {
						transport: {
							mode: setupInput.transportMode as ThouTransportMode,
							listenHost: setupInput.listenHost?.trim(),
							listenPort: parsePort(setupInput.listenPort, 8080),
						},
					}
				: {}),
			...(setupInput.bootstrapMode
				? {
						bootstrap: {
							mode: setupInput.bootstrapMode as ThouBootstrapMode,
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

		return patchThouAccountConfig(cfg as ThouRootConfig, normalizedAccountId, patch);
	},
};