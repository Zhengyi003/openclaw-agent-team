import crypto from "node:crypto";
import type { ThouBridgeServer } from "./bridge-server.js";

const DEFAULT_THOU_ACCOUNT_ID = "ios";

export type ThouOutboundPayload = {
  accountId?: string | null;
  to: string;
  text: string;
  replyToId?: string | null;
  mediaUrl?: string | null;
};

export type ThouOutboundResult = {
  messageId: string;
  target: string;
  accountId: string;
  transport: "delegate" | "sidecar-bridge";
  text: string;
  mediaUrl?: string;
};

export type ThouOutboundSender = (
  payload: Required<Pick<ThouOutboundPayload, "to" | "text">> & {
    accountId: string;
    replyToId?: string;
    mediaUrl?: string;
  },
) => Promise<ThouOutboundResult>;

export type ThouBridgeDeliveryResolver = (
  payload: Required<Pick<ThouOutboundPayload, "to" | "text">> & {
    accountId: string;
    replyToId?: string;
    mediaUrl?: string;
  },
) => Promise<ThouOutboundResult | null>;

let thouOutboundSender: ThouOutboundSender | null = null;
let thouBridgeDeliveryResolver: ThouBridgeDeliveryResolver | null = null;

function createThouOutboundNotImplementedError(scope: string): Error {
  return new Error(`Thou transport is not implemented yet: ${scope}`);
}

function normalizeAccountId(accountId?: string | null): string {
  const trimmed = typeof accountId === "string" ? accountId.trim() : "";
  return trimmed || DEFAULT_THOU_ACCOUNT_ID;
}

function requireTarget(to: string): string {
  const trimmed = to.trim();
  if (!trimmed) {
    throw new Error("Thou outbound target is required");
  }
  return trimmed;
}

function requireText(text: string, mediaUrl?: string): string {
  const trimmed = text.trim();
  if (trimmed) {
    return trimmed;
  }
  if (mediaUrl) {
    return "[media]";
  }
  throw new Error("Thou outbound text is required");
}

function buildFallbackMediaText(text: string, mediaUrl: string): string {
  return text.trim() ? `${text.trim()}\n\nAttachment: ${mediaUrl}` : `[media]\n\nAttachment: ${mediaUrl}`;
}

export function setThouOutboundSender(sender: ThouOutboundSender): void {
  thouOutboundSender = sender;
}

export function clearThouOutboundSender(): void {
  thouOutboundSender = null;
}

export function hasThouOutboundSender(): boolean {
  return thouOutboundSender !== null;
}

export function setThouBridgeDeliveryResolver(resolver: ThouBridgeDeliveryResolver): void {
  thouBridgeDeliveryResolver = resolver;
}

export function clearThouBridgeDeliveryResolver(): void {
  thouBridgeDeliveryResolver = null;
}

export async function deliverThouText(payload: ThouOutboundPayload): Promise<ThouOutboundResult> {
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

export async function deliverThouMedia(payload: ThouOutboundPayload): Promise<ThouOutboundResult> {
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

export function createMemoryThouOutboundSender(params?: {
  delivered?: ThouOutboundResult[];
}): ThouOutboundSender {
  const delivered = params?.delivered ?? [];

  return async (payload) => {
    const result: ThouOutboundResult = {
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

export function createThouBridgeOutboundSender(server: ThouBridgeServer): ThouOutboundSender {
  return async (payload) =>
    await server.deliver({
      accountId: payload.accountId,
      to: payload.to,
      text: payload.text,
      ...(payload.replyToId ? { replyToId: payload.replyToId } : {}),
      ...(payload.mediaUrl ? { mediaUrl: payload.mediaUrl } : {}),
    });
}