import { defineSetupPluginEntry } from "openclaw/plugin-sdk/core";
import { thouSetupPlugin } from "./src/channel.setup.js";
export { thouSetupPlugin } from "./src/channel.setup.js";
export default defineSetupPluginEntry(thouSetupPlugin);
