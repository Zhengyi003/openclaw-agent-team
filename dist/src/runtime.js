import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
const { setRuntime: setThouRuntime, getRuntime: getThouRuntime } = createPluginRuntimeStore("Thou runtime not initialized");
const thouBridgeRegistry = new Map();
export function registerThouBridge(entry) {
    thouBridgeRegistry.set(entry.accountId, entry);
}
export function unregisterThouBridge(accountId) {
    thouBridgeRegistry.delete(accountId);
}
export function tryGetThouBridge(accountId) {
    return thouBridgeRegistry.get(accountId) ?? null;
}
export { getThouRuntime, setThouRuntime };
