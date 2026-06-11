import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { ThouBridgeServer } from "../src/bridge/server.ts";
import {
  clearThouOutboundSender,
  createThouBridgeOutboundSender,
  deliverThouMedia,
  deliverThouText,
  setThouOutboundSender,
} from "../src/outbound.ts";

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", (error) => reject(error));
  });
}

function waitForMessages(received: Array<Record<string, unknown>>, count: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${count} messages; got ${received.length}`));
    }, 10000);

    const check = () => {
      if (received.length >= count) {
        clearTimeout(timeout);
        resolve();
      } else {
        setTimeout(check, 10);
      }
    };

    check();
  });
}

async function main() {
  const bridge = await ThouBridgeServer.listen({
    authToken: "test-token-1234",
    host: "127.0.0.1",
    port: 18080,
    path: "/thou",
  });
  const received: Array<Record<string, unknown>> = [];
  const ws = new WebSocket(bridge.url);

  await waitForOpen(ws);

  ws.on("message", (data) => {
    received.push(JSON.parse(data.toString()) as Record<string, unknown>);
  });

  ws.send(
    JSON.stringify({
      type: "auth",
      token: "test-token-1234",
      deviceId: "device:test-ios",
      deviceLabel: "Test iPhone",
    }),
  );

  await waitForMessages(received, 1);

  setThouOutboundSender(createThouBridgeOutboundSender(bridge));

  try {
    const textResult = await deliverThouText({
      accountId: "ios",
      to: "device:test-ios",
      text: "assistant says hello",
    });

    const mediaResult = await deliverThouMedia({
      accountId: "ios",
      to: "device:test-ios",
      text: "here is the screenshot",
      mediaUrl: "https://example.com/test.png",
    });

    await waitForMessages(received, 7);

    const [authOk, startOne, chunkOne, doneOne, startTwo, chunkTwo, doneTwo] = received;

    assert.equal(authOk.type, "auth-ok");
    assert.equal(authOk.deviceId, "device:test-ios");

    assert.equal(startOne.type, "chat-start");
    assert.equal(chunkOne.type, "chat.chunk");
    assert.equal(chunkOne.content, "assistant says hello");
    assert.equal(doneOne.type, "chat.done");

    assert.equal(startTwo.type, "chat-start");
    assert.equal(chunkTwo.type, "chat.chunk");
    assert.equal(chunkTwo.mediaUrl, "https://example.com/test.png");
    assert.match(String(chunkTwo.content), /Attachment: https:\/\/example.com\/test.png/);
    assert.equal(doneTwo.type, "chat.done");

    assert.equal(textResult.target, "device:test-ios");
    assert.equal(textResult.accountId, "ios");
    assert.equal(textResult.transport, "sidecar-bridge");
    assert.match(textResult.messageId, /^thou-bridge-/);

    assert.equal(mediaResult.target, "device:test-ios");
    assert.equal(mediaResult.accountId, "ios");
    assert.equal(mediaResult.transport, "sidecar-bridge");
    assert.equal(mediaResult.mediaUrl, "https://example.com/test.png");
    assert.match(mediaResult.text, /Attachment: https:\/\/example.com\/test.png/);

    console.log("[validate:outbound] ok");
    console.log(JSON.stringify({ received, textResult, mediaResult }, null, 2));
  } finally {
    clearThouOutboundSender();
    ws.close();
    await bridge.stop();
  }
}

await main();