export const GUI_PRODUCT_NAME = "OpenClaw Agent Team";
export const GUI_SHORT_NAME = "Agent Team";
export const GUI_BASE_PATH = "/agent-team";
export const GUI_ASSETS_PATH = `${GUI_BASE_PATH}/assets`;
export const GUI_API_BASE_PATH = `${GUI_BASE_PATH}/api/v1`;
export const DEFAULT_WORKSPACE_ROOT = "~/Documents/OpenClaw";
export const PREFERRED_GUI_PORT = 38127;
export const STABLE_GUI_URL = `http://127.0.0.1:${PREFERRED_GUI_PORT}${GUI_BASE_PATH}/`;
export const CONNECT_ARTIFACT_TTL_MS = 15 * 60 * 1000;
export const TEMPLATES = [
    {
        id: "coding",
        label: "Coding",
        description: "For building, debugging, and shipping software.",
    },
    {
        id: "writing",
        label: "Writing",
        description: "For drafting, revising, and organizing long-form output.",
    },
    {
        id: "research",
        label: "Research",
        description: "For gathering, comparing, and synthesizing information.",
    },
];
export let guiState = {
    account: null,
    connectionPayload: null,
    connectionText: null,
    connectionCacheKey: null,
    connectionUpdatedAt: 0,
    updatedAt: 0,
};
export function setGuiState(nextState) {
    guiState = nextState;
}
export function buildConnectionCacheKey(account) {
    if (!account) {
        return null;
    }
    return JSON.stringify({
        accountId: account.accountId,
        configured: account.configured,
        host: account.transport.listenHost,
        port: account.transport.listenPort,
        path: account.transport.listenPath,
    });
}
export function haveConnectArtifactsExpired() {
    if (!guiState.connectionUpdatedAt) {
        return true;
    }
    return Date.now() - guiState.connectionUpdatedAt > CONNECT_ARTIFACT_TTL_MS;
}
