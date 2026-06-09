import type { PluginRuntime } from "openclaw/plugin-sdk/core";
import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { ThouBridgeServer } from "./bridge-server.js";

const { setRuntime: setThouRuntime, getRuntime: getThouRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Thou runtime not initialized");

export type RegisteredThouBridge = {
  accountId: string;
  server: ThouBridgeServer;
  authToken: string;
  tokenFile: string;
};

const thouBridgeRegistry = new Map<string, RegisteredThouBridge>();

export function registerThouBridge(entry: RegisteredThouBridge): void {
  thouBridgeRegistry.set(entry.accountId, entry);
}

export function unregisterThouBridge(accountId: string): void {
  thouBridgeRegistry.delete(accountId);
}

export function tryGetThouBridge(accountId: string): RegisteredThouBridge | null {
  return thouBridgeRegistry.get(accountId) ?? null;
}

export { getThouRuntime, setThouRuntime };