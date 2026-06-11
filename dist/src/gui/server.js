import { createServer } from "node:http";
import { readJsonBody, respondHtml, respondJson, respondText } from "./http.js";
import { renderAgentWorkShellHtml } from "./render.js";
import { buildAgentPreview, buildConnectSummary, createAgent, dismissAgent, humanizeAgentCreateError, humanizeAgentDismissError, listAgents, } from "./service.js";
import { buildConnectionCacheKey, DEFAULT_WORKSPACE_ROOT, GUI_API_BASE_PATH, GUI_ASSETS_PATH, GUI_BASE_PATH, PREFERRED_GUI_PORT, STABLE_GUI_URL, TEMPLATES, guiState, setGuiState, } from "./state.js";
let guiServerPromise = null;
export async function ensureAgentWorkGuiServer(params) {
    if (params) {
        const nextAccount = params.account ?? guiState.account;
        const accountChanged = buildConnectionCacheKey(nextAccount) !== guiState.connectionCacheKey;
        const connectionPayload = params.connectionPayload === undefined
            ? accountChanged
                ? null
                : guiState.connectionPayload
            : params.connectionPayload;
        const connectionText = params.connectionText === undefined
            ? accountChanged
                ? null
                : guiState.connectionText
            : params.connectionText;
        setGuiState({
            account: nextAccount,
            connectionPayload,
            connectionText,
            connectionCacheKey: buildConnectionCacheKey(nextAccount),
            connectionUpdatedAt: connectionPayload && connectionText
                ? params.connectionPayload !== undefined || params.connectionText !== undefined || accountChanged
                    ? Date.now()
                    : guiState.connectionUpdatedAt
                : 0,
            updatedAt: Date.now(),
        });
    }
    guiServerPromise ??= startAgentWorkGuiServer();
    const server = await guiServerPromise;
    return { url: server.url };
}
async function startAgentWorkGuiServer() {
    const server = createServer(async (req, res) => {
        try {
            await routeAgentWorkRequest(req, res);
        }
        catch (error) {
            respondJson(res, 500, {
                ok: false,
                error: error instanceof Error ? error.message : "unknown error",
            });
        }
    });
    await listenOnPreferredLoopbackPort(server);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const url = STABLE_GUI_URL;
    return {
        url,
        port,
        stop: async () => {
            await new Promise((resolve, reject) => {
                server.close((error) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve();
                });
            });
            guiServerPromise = null;
        },
    };
}
async function routeAgentWorkRequest(req, res) {
    const method = req.method ?? "GET";
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = requestUrl.pathname;
    if (method === "GET" && (pathname === GUI_BASE_PATH || pathname === `${GUI_BASE_PATH}/`)) {
        respondHtml(res, renderAgentWorkShellHtml());
        return;
    }
    if (method === "GET" && pathname === `${GUI_API_BASE_PATH}/health`) {
        respondJson(res, 200, { ok: true });
        return;
    }
    if (method === "GET" && pathname === `${GUI_API_BASE_PATH}/bootstrap`) {
        const { url } = await ensureAgentWorkGuiServer();
        respondJson(res, 200, {
            locale: "en",
            guiBaseUrl: url,
            defaultActiveTab: "recruit",
            defaultWorkspaceRoot: DEFAULT_WORKSPACE_ROOT,
            templates: TEMPLATES,
            connectSummary: await buildConnectSummary(url),
        });
        return;
    }
    if (method === "GET" && pathname === `${GUI_API_BASE_PATH}/connect-summary`) {
        const { url } = await ensureAgentWorkGuiServer();
        respondJson(res, 200, await buildConnectSummary(url));
        return;
    }
    if (method === "GET" && pathname === `${GUI_API_BASE_PATH}/agents`) {
        respondJson(res, 200, {
            agents: await listAgents(),
        });
        return;
    }
    if (method === "POST" && pathname === `${GUI_API_BASE_PATH}/agent-preview`) {
        const payload = (await readJsonBody(req));
        const preview = await buildAgentPreview(payload);
        respondJson(res, 200, preview);
        return;
    }
    if (method === "POST" && pathname === `${GUI_API_BASE_PATH}/agents`) {
        const payload = (await readJsonBody(req));
        const preview = await buildAgentPreview(payload);
        if (!preview.canCreate) {
            respondJson(res, 400, {
                ok: false,
                error: "preview validation failed",
                preview,
            });
            return;
        }
        try {
            await createAgent(preview);
        }
        catch (error) {
            const stderr = typeof error === "object" && error && "stderr" in error
                ? String(error.stderr ?? "")
                : "";
            respondJson(res, 409, {
                ok: false,
                error: humanizeAgentCreateError(stderr, preview),
                preview,
            });
            return;
        }
        respondJson(res, 200, {
            ok: true,
            agent: {
                id: preview.agentId,
                name: preview.name,
                workspace: preview.workspacePath,
            },
            next: {
                returnTo: `${GUI_BASE_PATH}/`,
                canOpenConnect: true,
            },
        });
        return;
    }
    if (method === "POST" && pathname === `${GUI_API_BASE_PATH}/agents/dismiss`) {
        const payload = (await readJsonBody(req));
        const agentId = String(payload.agentId ?? "").trim();
        if (!agentId) {
            respondJson(res, 400, {
                ok: false,
                error: "Agent id is required.",
            });
            return;
        }
        if (agentId === "main") {
            respondJson(res, 400, {
                ok: false,
                error: "main is reserved and cannot be dismissed from Agent Team.",
            });
            return;
        }
        try {
            await dismissAgent(agentId);
        }
        catch (error) {
            const stderr = typeof error === "object" && error && "stderr" in error
                ? String(error.stderr ?? "")
                : "";
            respondJson(res, 409, {
                ok: false,
                error: humanizeAgentDismissError(agentId, stderr),
            });
            return;
        }
        respondJson(res, 200, {
            ok: true,
            agentId,
        });
        return;
    }
    if (method === "GET" && pathname.startsWith(`${GUI_ASSETS_PATH}/`)) {
        respondText(res, 404, "asset not found", "text/plain; charset=utf-8");
        return;
    }
    respondText(res, 404, "not found", "text/plain; charset=utf-8");
}
async function listenOnPreferredLoopbackPort(server) {
    try {
        await listenServer(server, PREFERRED_GUI_PORT);
    }
    catch (error) {
        if (!isAddressInUseError(error)) {
            throw error;
        }
        throw new Error(`Agent Team requires ${STABLE_GUI_URL}, but port ${String(PREFERRED_GUI_PORT)} is already in use. Close the old listener and try again.`);
    }
}
async function listenServer(server, port) {
    await new Promise((resolve, reject) => {
        const onError = (error) => {
            server.off("listening", onListening);
            reject(error);
        };
        const onListening = () => {
            server.off("error", onError);
            resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
    });
}
function isAddressInUseError(error) {
    return Boolean(error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE");
}
