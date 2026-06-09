import { resolveThouAccount } from "./accounts.js";
export function createThouNotImplementedError(scope) {
    return new Error(`OpenClaw Agent Team v1 only defines ownership boundaries for ${scope}; live transport still stays on the sidecar reference path.`);
}
export function collectThouChannelWarnings(params) {
    const account = resolveThouAccount({
        cfg: params.cfg,
        accountId: params.accountId,
    });
    const warnings = [...account.notes];
    if (account.transport.mode === "native-node") {
        warnings.push("native-node transport 已建模但未实现，当前不要把它当成可运行链路。");
    }
    if (account.dmPolicy === "open") {
        warnings.push("Thou dmPolicy=open 会绕过设备白名单，当前阶段不建议默认开放。");
    }
    return warnings;
}
