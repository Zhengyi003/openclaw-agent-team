import { execFile } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);
const CONNECTION_SHARE_PREFIX = "THOU_OPENCLAW_V1:";
export async function buildThouConnectionSharePayload(params) {
    const listenHost = (params.listenHost ?? params.account.transport.listenHost).trim();
    const listenPort = params.listenPort ?? params.account.transport.listenPort;
    const listenPath = (params.listenPath ?? params.account.transport.listenPath).trim() || "/thou";
    const token = params.authToken.trim();
    if (!token || !(listenPort > 0 && listenPort <= 65535)) {
        return null;
    }
    const hostHints = await resolveConnectionHostHints(listenHost);
    const preferredHost = hostHints[0];
    if (!preferredHost) {
        return null;
    }
    return {
        version: 1,
        kind: "openclaw-connection",
        label: normalizeHostHint(os.hostname()) || "my-mac",
        preferredHost,
        port: listenPort,
        path: listenPath,
        token,
        hosts: hostHints,
    };
}
export function encodeThouConnectionSharePayload(payload) {
    const json = JSON.stringify(payload);
    return `${CONNECTION_SHARE_PREFIX}${toBase64Url(Buffer.from(json, "utf8"))}`;
}
export async function buildThouConnectionShareText(params) {
    const payload = await buildThouConnectionSharePayload(params);
    return payload ? encodeThouConnectionSharePayload(payload) : null;
}
async function resolveConnectionHostHints(listenHost) {
    const tailscale = await readTailscaleStatus();
    const tailnetIPv4Hosts = (tailscale?.ips ?? [])
        .map((ip) => normalizeHostHint(ip))
        .filter((host) => Boolean(host));
    if (tailnetIPv4Hosts.length > 0) {
        return tailnetIPv4Hosts;
    }
    const fallbackHost = normalizeHostHint(listenHost);
    return fallbackHost ? [fallbackHost] : [];
}
async function readTailscaleStatus() {
    try {
        const { stdout } = await execFileAsync("tailscale", ["status", "--json"], {
            timeout: 1500,
            maxBuffer: 256 * 1024,
        });
        const parsed = JSON.parse(stdout);
        if (parsed.BackendState !== "Running") {
            return null;
        }
        const rawDnsName = parsed.Self?.DNSName?.trim() ?? "";
        const dnsName = normalizeHostHint(rawDnsName.replace(/\.$/u, ""));
        const ips = (parsed.Self?.TailscaleIPs ?? [])
            .map((entry) => normalizeHostHint(entry))
            .filter((entry) => Boolean(entry))
            .filter((entry) => shouldExposeIpHost(entry));
        return { dnsName: dnsName || undefined, ips };
    }
    catch {
        return null;
    }
}
function normalizeHostHint(candidate) {
    const host = String(candidate ?? "").trim().toLowerCase();
    if (!host || host === "0.0.0.0" || host === "::" || host === "127.0.0.1" || host === "localhost") {
        return null;
    }
    if (looksLikeIpHost(host) && !shouldExposeIpHost(host)) {
        return null;
    }
    return host;
}
function looksLikeIpHost(host) {
    return host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/u.test(host);
}
function shouldExposeIpHost(host) {
    if (host.includes(":")) {
        return false;
    }
    const octets = host.split(".").map((part) => Number(part));
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return false;
    }
    const [first, second] = octets;
    if (first === 127) {
        return false;
    }
    if (first === 169 && second === 254) {
        return false;
    }
    if (first === 198 && (second === 18 || second === 19)) {
        return false;
    }
    return true;
}
function toBase64Url(buffer) {
    return buffer
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/g, "");
}
