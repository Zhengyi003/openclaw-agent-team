import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolveStateDir } from "openclaw/plugin-sdk/state-paths";
function resolveThouBridgeTokenFile(params) {
    const stateDir = resolveStateDir();
    return path.join(stateDir, "channels", "thou", "bridge", `${params.accountId}.auth.token`);
}
export function ensureThouBridgeAuthToken(params) {
    const tokenFile = resolveThouBridgeTokenFile(params);
    fs.mkdirSync(path.dirname(tokenFile), { recursive: true });
    if (fs.existsSync(tokenFile)) {
        const token = fs.readFileSync(tokenFile, "utf8").trim();
        if (token) {
            return { token, tokenFile };
        }
    }
    const token = crypto.randomBytes(8).toString("hex");
    fs.writeFileSync(tokenFile, `${token}\n`, { encoding: "utf8", mode: 0o600 });
    return { token, tokenFile };
}
