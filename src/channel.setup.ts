import { createChatChannelPlugin } from "openclaw/plugin-sdk/core";
import { thouChatChannelBase } from "./channel.base.js";

export const thouSetupPlugin = createChatChannelPlugin({
  base: thouChatChannelBase,
});