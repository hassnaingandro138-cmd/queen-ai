import type { IncomingMessage } from "node:http";
import { sendJson, StreamResponseLike } from "./_lib/chatCore.js";

export default function handler(
  req: IncomingMessage,
  res: StreamResponseLike
): void {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    sendJson(res, 405, {
      code: "METHOD_NOT_ALLOWED",
      error: "Method not allowed. Use GET.",
    });
    return;
  }

  sendJson(res, 200, { status: "ok" });
}
