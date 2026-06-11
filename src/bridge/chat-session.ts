export function createThouConversationId(deviceId: string, agentId = "main"): string {
  void deviceId;
  return `agent:${String(agentId ?? "main").trim().toLowerCase() || "main"}:main`;
}