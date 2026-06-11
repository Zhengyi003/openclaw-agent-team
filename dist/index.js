import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { thouPlugin } from "./src/channel/entry.js";
import { getThouConnectionProfileSnapshot, getThouMobileConnectionProfile, } from "./src/bridge/runtime.js";
import { setThouRuntime } from "./src/runtime.js";
export { thouPlugin } from "./src/channel/entry.js";
export { getThouConnectionProfileSnapshot } from "./src/bridge/runtime.js";
export { getThouMobileConnectionProfile } from "./src/bridge/runtime.js";
export { setThouRuntime } from "./src/runtime.js";
export default defineChannelPluginEntry({
    id: "openclaw-agent-team",
    name: "OpenClaw Agent Team",
    description: "OpenClaw Agent Team plugin",
    plugin: thouPlugin,
    setRuntime: setThouRuntime,
});
