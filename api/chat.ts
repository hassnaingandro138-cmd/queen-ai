import type { IncomingMessage } from "node:http";
import {
  handleChatRequest,
  sendJson,
  StreamResponseLike,
} from "./_lib/chatCore.js";

type ServerlessRequest = IncomingMessage & {
  body?: unknown;
};

async function readJsonBody(req: ServerlessRequest): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body === "string") {
      return JSON.parse(req.body);
    }
    if (Buffer.isBuffer(req.body)) {
      return JSON.parse(req.body.toString("utf8"));
    }
    return req.body;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  const maxBytes = 20 * 1024 * 1024;

  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buf.length;
    if (totalBytes > maxBytes) {
      throw new Error("PAYLOAD_TOO_LARGE");
    }
    chunks.push(buf);
  }

  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

export default async function handler(
  req: ServerlessRequest,
  res: StreamResponseLike
): Promise<void> {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Allow", "POST, OPTIONS");
    res.end();
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    sendJson(res, 405, {
      code: "METHOD_NOT_ALLOWED",
      error: "Method not allowed. Send a POST request to /api/chat.",
    });
    return;
  }

  let parsedBody: unknown;
  try {
    parsedBody = await readJsonBody(req);
  } catch (err) {
    const isTooLarge = err instanceof Error && err.message === "PAYLOAD_TOO_LARGE";
    sendJson(res, isTooLarge ? 413 : 400, {
      code: isTooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_JSON",
      error: isTooLarge
        ? "Request body exceeds the maximum allowed size."
        : "Request body must be valid JSON.",
    });
    return;
  }

  await handleChatRequest(parsedBody, res);
}
