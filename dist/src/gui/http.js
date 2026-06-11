export async function readJsonBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks).toString("utf8").trim();
    return raw ? JSON.parse(raw) : {};
}
export function respondJson(res, statusCode, payload) {
    respondText(res, statusCode, JSON.stringify(payload), "application/json; charset=utf-8");
}
export function respondHtml(res, html) {
    respondText(res, 200, html, "text/html; charset=utf-8");
}
export function respondText(res, statusCode, text, contentType) {
    res.statusCode = statusCode;
    res.setHeader("content-type", contentType);
    res.setHeader("cache-control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("pragma", "no-cache");
    res.setHeader("expires", "0");
    res.end(text);
}
