import crypto from "node:crypto";
const DEFAULT_THOU_ACCOUNT_ID = "ios";
let thouOutboundSender = null;
let thouBridgeDeliveryResolver = null;
function createThouOutboundNotImplementedError(scope) {
    return new Error(`Thou transport is not implemented yet: ${scope}`);
}
function normalizeAccountId(accountId) {
    const trimmed = typeof accountId === "string" ? accountId.trim() : "";
    return trimmed || DEFAULT_THOU_ACCOUNT_ID;
}
function requireTarget(to) {
    const trimmed = to.trim();
    if (!trimmed) {
        throw new Error("Thou outbound target is required");
    }
    return trimmed;
}
function requireText(text, mediaUrl) {
    const trimmed = text.trim();
    if (trimmed) {
        return trimmed;
    }
    if (mediaUrl) {
        return "[media]";
    }
    throw new Error("Thou outbound text is required");
}
function buildFallbackMediaText(text, mediaUrl) {
    return text.trim() ? `${text.trim()}\n\nAttachment: ${mediaUrl}` : `[media]\n\nAttachment: ${mediaUrl}`;
}
export function setThouOutboundSender(sender) {
    thouOutboundSender = sender;
}
export function clearThouOutboundSender() {
    thouOutboundSender = null;
}
export function hasThouOutboundSender() {
    return thouOutboundSender !== null;
}
export function setThouBridgeDeliveryResolver(resolver) {
    thouBridgeDeliveryResolver = resolver;
}
export function clearThouBridgeDeliveryResolver() {
    thouBridgeDeliveryResolver = null;
}
export async function deliverThouText(payload) {
    const accountId = normalizeAccountId(payload.accountId);
    if (!thouOutboundSender) {
        if (thouBridgeDeliveryResolver) {
            const resolved = await thouBridgeDeliveryResolver({
                accountId,
                to: requireTarget(payload.to),
                text: requireText(payload.text, undefined),
                ...(payload.replyToId?.trim() ? { replyToId: payload.replyToId.trim() } : {}),
            });
            if (resolved) {
                return resolved;
            }
        }
        throw createThouOutboundNotImplementedError(`outbound text (${payload.to})`);
    }
    return await thouOutboundSender({
        accountId,
        to: requireTarget(payload.to),
        text: requireText(payload.text, undefined),
        ...(payload.replyToId?.trim() ? { replyToId: payload.replyToId.trim() } : {}),
    });
}
export async function deliverThouMedia(payload) {
    const accountId = normalizeAccountId(payload.accountId);
    const mediaUrl = payload.mediaUrl?.trim();
    if (!mediaUrl) {
        return await deliverThouText(payload);
    }
    if (!thouOutboundSender) {
        if (thouBridgeDeliveryResolver) {
            const resolved = await thouBridgeDeliveryResolver({
                accountId,
                to: requireTarget(payload.to),
                text: buildFallbackMediaText(payload.text, mediaUrl),
                ...(payload.replyToId?.trim() ? { replyToId: payload.replyToId.trim() } : {}),
                mediaUrl,
            });
            if (resolved) {
                return resolved;
            }
        }
        throw createThouOutboundNotImplementedError(`outbound media (${payload.to})`);
    }
    return await thouOutboundSender({
        accountId,
        to: requireTarget(payload.to),
        text: buildFallbackMediaText(payload.text, mediaUrl),
        ...(payload.replyToId?.trim() ? { replyToId: payload.replyToId.trim() } : {}),
        mediaUrl,
    });
}
export function createMemoryThouOutboundSender(params) {
    const delivered = params?.delivered ?? [];
    return async (payload) => {
        const result = {
            messageId: `thou-out-${crypto.randomUUID()}`,
            target: payload.to,
            accountId: payload.accountId,
            transport: "delegate",
            text: payload.text,
            ...(payload.mediaUrl ? { mediaUrl: payload.mediaUrl } : {}),
        };
        delivered.push(result);
        return result;
    };
}
export function createThouBridgeOutboundSender(server) {
    return async (payload) => await server.deliver({
        accountId: payload.accountId,
        to: payload.to,
        text: payload.text,
        ...(payload.replyToId ? { replyToId: payload.replyToId } : {}),
        ...(payload.mediaUrl ? { mediaUrl: payload.mediaUrl } : {}),
    });
}
