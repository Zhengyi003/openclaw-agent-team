import type { IncomingMessage, ServerResponse } from "node:http";

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

export function respondJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  respondText(res, statusCode, JSON.stringify(payload), "application/json; charset=utf-8");
}

export function respondHtml(res: ServerResponse, html: string): void {
  respondText(res, 200, html, "text/html; charset=utf-8");
}

export function respondText(
  res: ServerResponse,
  statusCode: number,
  text: string,
  contentType: string,
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", contentType);
  res.setHeader("cache-control", "no-store, no-cache, must-revalidate, private");
  res.setHeader("pragma", "no-cache");
  res.setHeader("expires", "0");
  res.end(text);
}