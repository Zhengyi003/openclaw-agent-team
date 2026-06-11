import { createChatChannelPlugin } from "openclaw/plugin-sdk/core";
import { thouChatChannelBase } from "./base.js";

export const thouSetupPlugin = createChatChannelPlugin({
	base: thouChatChannelBase,
});