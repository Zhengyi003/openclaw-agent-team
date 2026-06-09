import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { WebSocket } from "ws";

function createThouConversationId(deviceId: string): string {
  void deviceId;
  return "thou-main";
}

function parseGatewayCallJson(output: string): Record<string, unknown> {
  const trimmed = output.trim();
  const objectStart = trimmed.indexOf("{");
  if (objectStart < 0) {
    throw new Error(`Could not find JSON object in gateway output: ${trimmed}`);
  }

  return JSON.parse(trimmed.slice(objectStart)) as Record<string, unknown>;
}

function gatewayCall(method: string, params: Record<string, unknown>): Record<string, unknown> {
  const output = execFileSync(
    "openclaw",
    ["gateway", "call", method, "--params", JSON.stringify(params)],
    {
      encoding: "utf8",
    },
  );
  return parseGatewayCallJson(output);
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (error) => reject(error));
  });
}

async function main() {
  const tokenFile = `${process.env.HOME}/.openclaw/channels/thou/bridge/ios.auth.token`;
  const token = fs.readFileSync(tokenFile, "utf8").trim();
  const deviceId = "device:validate-session-routing";
  const conversationId = createThouConversationId(deviceId);
  const ws = new WebSocket("ws://127.0.0.1:8080/thou");
  const chunks: string[] = [];
  let requestSeq = 1;
  let createdSessionKey = "";

  const pending = new Map<
    string,
    {
      resolve: (value: Record<string, unknown>) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      type: string;
    }
  >();

  function send(message: Record<string, unknown>) {
    ws.send(JSON.stringify(message));
  }

  function sendRequest(type: string, payload: Record<string, unknown> = {}) {
    const requestId = `req-${requestSeq++}`;
    send({ type, requestId, ...payload });

    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`Timed out waiting for ${type}`));
      }, 15000);

      pending.set(requestId, {
        resolve,
        reject,
        timer,
        type,
      });
    });
  }

  await waitForOpen(ws);

  const completion = new Promise<void>((resolve, reject) => {
    let finished = false;

    const fail = (error: Error) => {
      if (finished) {
        return;
      }
      finished = true;
      try {
        ws.close();
      } catch {
        // Ignore close errors during validation teardown.
      }
      reject(error);
    };

    ws.on("message", async (data) => {
      const message = JSON.parse(data.toString()) as Record<string, unknown>;
      const requestId = typeof message.requestId === "string" ? message.requestId : "";

      if (requestId && pending.has(requestId)) {
        const entry = pending.get(requestId)!;
        pending.delete(requestId);
        clearTimeout(entry.timer);

        if (message.type === "error") {
          entry.reject(new Error(String(message.message ?? `${entry.type} failed`)));
        } else {
          entry.resolve(message);
        }
        return;
      }

      if (message.type === "auth-ok") {
        try {
          const createResult = await sendRequest("sessions.create", {
            label: `Session routing verify ${new Date().toISOString()}`,
          });
          const session = createResult.session as Record<string, unknown> | undefined;
          createdSessionKey = typeof session?.key === "string" ? session.key : "";
          assert.ok(createdSessionKey, "sessions.create must return a session key");
          send({
            type: "chat",
            text: "Session routing verification message",
            sessionKey: createdSessionKey,
          });
        } catch (error) {
          fail(error instanceof Error ? error : new Error(String(error)));
        }
        return;
      }

      if (message.type === "chat.chunk") {
        chunks.push(String(message.content ?? ""));
        return;
      }

      if (message.type === "chat.done") {
        if (finished) {
          return;
        }
        finished = true;
        resolve();
        try {
          ws.close();
        } catch {
          // Ignore close errors during validation teardown.
        }
        return;
      }

      if (message.type === "error") {
        fail(new Error(String(message.message ?? "bridge error")));
      }
    });

    ws.on("error", (error) => fail(error instanceof Error ? error : new Error(String(error))));
    ws.on("close", (code, reason) => {
      if (finished) {
        return;
      }
      fail(new Error(`Bridge closed early: ${code} ${reason.toString()}`));
    });
  });

  send({
    type: "auth",
    token,
    deviceId,
    deviceLabel: "Session Routing Validate",
  });

  await completion;

  const sessionsResponse = gatewayCall("sessions.list", {
    limit: 24,
    includeUnknown: true,
    includeDerivedTitles: true,
    includeLastMessage: true,
    agentId: "main",
  });
  const sessions = Array.isArray(sessionsResponse.sessions)
    ? sessionsResponse.sessions.filter((session) => {
        const key = typeof session?.key === "string" ? session.key.toLowerCase() : "";
        return key.startsWith(`agent:main:dashboard:${conversationId.toLowerCase()}:`);
      })
    : [];
  const matchedSession = sessions.find((session) => session.key === createdSessionKey);
  assert.ok(matchedSession, "created session must appear in Thou-scoped sessions.list");

  const historyResponse = gatewayCall("chat.history", {
    sessionKey: createdSessionKey,
    limit: 20,
  });
  const history = Array.isArray(historyResponse.messages)
    ? historyResponse.messages.flatMap((message) => {
        const role = typeof message?.role === "string" ? message.role : "";
        if (role !== "user" && role !== "assistant") {
          return [];
        }

        const content = Array.isArray(message?.content) ? message.content : [];
        const text = content
          .filter((item) => item?.type === "text" && typeof item.text === "string")
          .map((item) => item.text)
          .join("")
          .trim();
        if (!text) {
          return [];
        }

        return [{ role, text }];
      })
    : [];
  assert.ok(
    history.some((message) => message.role === "user" && message.text === "Session routing verification message"),
    "created session history must contain the user message",
  );
  assert.ok(
    history.some((message) => message.role === "assistant" && message.text.trim().length > 0),
    "created session history must contain the assistant reply",
  );

  assert.ok(chunks.join("").trim().length > 0, "bridge must stream a non-empty assistant response");

  console.log("[validate:session-routing] ok");
  console.log(
    JSON.stringify(
      {
        createdSessionKey,
        matchedSession,
        streamedAssistantText: chunks.join(""),
        history,
      },
      null,
      2,
    ),
  );
}

await main();