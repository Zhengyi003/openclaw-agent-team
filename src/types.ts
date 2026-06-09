export const DEFAULT_THOU_ACCOUNT_ID = "ios";
export const THOU_DEFAULT_DEVICE_LABEL = "Thou iOS";
export const THOU_DEFAULT_DM_POLICY = "pairing";
export const THOU_DEFAULT_TRANSPORT_MODE = "sidecar-bridge";
export const THOU_DEFAULT_LISTEN_HOST = "0.0.0.0";
export const THOU_DEFAULT_LISTEN_PORT = 8080;
export const THOU_DEFAULT_LISTEN_PATH = "/thou";
export const THOU_DEFAULT_BOOTSTRAP_MODE = "sidecar-token";
export const THOU_DEFAULT_TEXT_CHUNK_LIMIT = 1200;
export const THOU_PAIRING_APPROVED_MESSAGE =
  "Thou device approved. Reconnect the app to continue in the shared OpenClaw session model.";

export type ThouDmPolicy = "pairing" | "allowlist" | "open" | "disabled";
export type ThouTransportMode = "sidecar-bridge" | "native-node";
export type ThouBootstrapMode = "sidecar-token" | "gateway-device-pair";

export type ThouTransportConfig = {
  mode?: ThouTransportMode;
  listenHost?: string;
  listenPort?: number;
  listenPath?: string;
};

export type ThouBootstrapConfig = {
  mode?: ThouBootstrapMode;
};

export type ThouOutboundConfig = {
  textChunkLimit?: number;
};

export type ThouAccountConfig = {
  enabled?: boolean;
  name?: string;
  deviceLabel?: string;
  dmPolicy?: ThouDmPolicy;
  allowFrom?: string[];
  transport?: ThouTransportConfig;
  bootstrap?: ThouBootstrapConfig;
  outbound?: ThouOutboundConfig;
};

export type ThouChannelConfig = {
  enabled?: boolean;
  defaultAccount?: string;
  dmPolicy?: ThouDmPolicy;
  allowFrom?: string[];
  transport?: ThouTransportConfig;
  bootstrap?: ThouBootstrapConfig;
  outbound?: ThouOutboundConfig;
  accounts?: Record<string, ThouAccountConfig>;
};

export type ThouRootConfig = {
  channels?: {
    thou?: ThouChannelConfig;
  };
};

export type ResolvedThouAccount = {
  accountId: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  deviceLabel: string;
  dmPolicy: ThouDmPolicy;
  allowFrom: string[];
  transport: {
    mode: ThouTransportMode;
    listenHost: string;
    listenPort: number;
    listenPath: string;
  };
  bootstrap: {
    mode: ThouBootstrapMode;
  };
  outbound: {
    textChunkLimit: number;
  };
  notes: string[];
};

export type ThouConnectionProfileSnapshot = {
  accountId: string;
  accountName: string;
  deviceLabel: string;
  generatedAt: number;
  bridge: {
    running: boolean;
    connectionCount: number;
    mode: ThouTransportMode;
    listenHost: string;
    listenPort: number;
    listenPath: string;
    url: string;
  };
  auth: {
    fullToken: string;
    pairingTokenPrefix: string;
    tokenFile: string;
    tokenSource: "runtime" | "state-file";
  };
};

export type ThouMobileConnectionProfile = {
  generatedAt: number;
  bridge: {
    listenPort: number;
    listenPath: string;
    hostHints: string[];
  };
  auth: {
    pairingTokenPrefix: string;
  };
};