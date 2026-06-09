import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { thouPlugin } from "./src/channel.js";
import { getThouConnectionProfileSnapshot, getThouMobileConnectionProfile, } from "./src/bridge-runtime.js";
import { setThouRuntime } from "./src/runtime.js";
export { thouPlugin } from "./src/channel.js";
export { getThouConnectionProfileSnapshot } from "./src/bridge-runtime.js";
export { getThouMobileConnectionProfile } from "./src/bridge-runtime.js";
export { setThouRuntime } from "./src/runtime.js";
export default defineChannelPluginEntry({
    id: "thou",
    name: "Thou",
    description: "Thou native iOS channel plugin",
    plugin: thouPlugin,
    setRuntime: setThouRuntime,
});
