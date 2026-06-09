export function createThouConversationId(deviceId, agentId = "main") {
    void deviceId;
    return `agent:${String(agentId ?? "main").trim().toLowerCase() || "main"}:main`;
}
