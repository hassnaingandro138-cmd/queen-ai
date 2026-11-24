import { ChatMessage, GeminiModelId } from "../types/chat";
import { extractBase64FromDataUrl } from "./images";

const REQUEST_TIMEOUT_MS = 25_000;
const STREAM_IDLE_TIMEOUT_MS = 30_000;

export interface StreamChatParams {
  messages: Pick<ChatMessage, "role" | "content" | "images">[];
  model: GeminiModelId;
  systemInstruction?: string;
  signal?: AbortSignal;
  onChunk: (partialText: string, delta: string) => void;
}

export class ChatApiError extends Error {
  code: string;
  status: number;

  constructor(message: string, code = "API_ERROR", status = 500) {
    super(message);
    this.name = "ChatApiError";
    this.code = code;
    this.status = status;
  }
}

function isHtmlPayload(text: string, contentType: string): boolean {
  const trimmed = text.trimStart().toLowerCase();
  return (
    contentType.includes("text/html") ||
    trimmed.startsWith("<!doctype") ||
    trimmed.startsWith("<html")
  );
}

function tryParseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function createTimeoutController(
  externalSignal: AbortSignal | undefined,
  timeoutMs: number
): {
  controller: AbortController;
  didTimeout: () => boolean;
  resetTimeout: () => void;
  cleanup: () => void;
} {
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const arm = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
  };

  const onExternalAbort = () => {
    if (timer !== null) clearTimeout(timer);
    controller.abort();
  };

  if (externalSignal?.aborted) {
    controller.abort();
  } else {
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    arm();
  }

  return {
    controller,
    didTimeout: () => timedOut,
    resetTimeout: arm,
    cleanup: () => {
      if (timer !== null) clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

async function performChatRequest(
  messages: Pick<ChatMessage, "role" | "content" | "images">[],
  model: GeminiModelId,
  systemInstruction: string | undefined,
  signal: AbortSignal | undefined
): Promise<Response> {
  const maxAttempts = 2;

  const serializedMessages = messages.map((m) => {
    const extractedImages = (m.images ?? [])
      .map((img) => extractBase64FromDataUrl(img.dataUrl))
      .filter((item): item is { mimeType: string; data: string } => item !== null);

    return {
      role: m.role,
      content: m.content,
      ...(extractedImages.length > 0 ? { images: extractedImages } : {}),
    };
  });

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const timeoutGuard = createTimeoutController(signal, REQUEST_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
        },
        body: JSON.stringify({
          messages: serializedMessages,
          model,
          systemInstruction,
        }),
        signal: timeoutGuard.controller.signal,
      });
    } catch (err) {
      timeoutGuard.cleanup();
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      if (timeoutGuard.didTimeout()) {
        if (attempt < maxAttempts) {
          await sleep(500, signal);
          continue;
        }
        throw new ChatApiError(
          "The server took too long to respond. Please click Retry.",
          "REQUEST_TIMEOUT",
          504
        );
      }
      if (attempt < maxAttempts) {
        await sleep(600, signal);
        continue;
      }
      throw new ChatApiError(
        err instanceof Error && err.message
          ? `Network error: ${err.message}`
          : "Unable to reach the server. Check your internet connection and try again.",
        "NETWORK_ERROR",
        503
      );
    }

    timeoutGuard.cleanup();

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const isTransientProxyOrRestart =
      attempt < maxAttempts &&
      (response.status === 502 ||
        response.status === 503 ||
        response.status === 504 ||
        contentType.includes("text/html"));

    if (isTransientProxyOrRestart) {
      await sleep(900, signal);
      continue;
    }

    return response;
  }

  throw new ChatApiError(
    "Unable to reach the chat server. Please try again.",
    "NETWORK_ERROR",
    503
  );
}

export async function streamGeminiChat({
  messages,
  model,
  systemInstruction,
  signal,
  onChunk,
}: StreamChatParams): Promise<string> {
  const response = await performChatRequest(
    messages,
    model,
    systemInstruction,
    signal
  );

  const contentType = (response.headers.get("content-type") || "").toLowerCase();

  if (!response.ok) {
    const rawBody = await response.text();
    const parsed = tryParseJson(rawBody);
    if (parsed && typeof parsed.error === "string") {
      throw new ChatApiError(
        parsed.error,
        typeof parsed.code === "string" ? parsed.code : "HTTP_ERROR",
        response.status
      );
    }
    if (parsed && parsed.error && typeof parsed.error === "object") {
      const nested = parsed.error as Record<string, unknown>;
      if (typeof nested.message === "string") {
        const isRouteNotFound = response.status === 404;
        throw new ChatApiError(
          isRouteNotFound
            ? "The /api/chat endpoint was not found on this server (404). Make sure the /api folder and vercel.json are pushed to GitHub and redeployed on Vercel."
            : nested.message,
          nested.code !== undefined ? String(nested.code) : "HTTP_ERROR",
          response.status
        );
      }
    }
    if (response.status === 404) {
      throw new ChatApiError(
        "The /api/chat endpoint was not found on this server (404). Make sure the /api folder and vercel.json are pushed to GitHub and redeployed on Vercel.",
        "ROUTE_NOT_FOUND",
        404
      );
    }
    if (isHtmlPayload(rawBody, contentType)) {
      throw new ChatApiError(
        "The server is still starting up or returned an unexpected HTML page. Please refresh the preview or click Retry.",
        "UNEXPECTED_HTML_RESPONSE",
        response.status
      );
    }
    throw new ChatApiError(
      rawBody.trim() || `Request failed (${response.status})`,
      "HTTP_ERROR",
      response.status
    );
  }

  if (!contentType.includes("text/event-stream") || !response.body) {
    const rawBody = await response.text();
    if (isHtmlPayload(rawBody, contentType)) {
      throw new ChatApiError(
        "The chat API endpoint returned HTML instead of a stream. Please refresh the page and click Retry.",
        "UNEXPECTED_HTML_RESPONSE",
        502
      );
    }
    const parsed = tryParseJson(rawBody);
    if (!parsed) {
      throw new ChatApiError(
        "Received an invalid response format from the chat server.",
        "INVALID_RESPONSE",
        502
      );
    }
    if (typeof parsed.error === "string") {
      throw new ChatApiError(
        parsed.error,
        typeof parsed.code === "string" ? parsed.code : "API_ERROR",
        response.status
      );
    }
    const text = typeof parsed.text === "string" ? parsed.text : "";
    if (text) onChunk(text, text);
    return text;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let accumulated = "";
  let sawDone = false;

  const processEventBlock = (eventBlock: string) => {
    const lines = eventBlock.split("\n");
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const jsonStr = line.slice(5).trim();
      if (!jsonStr) continue;

      const payload = tryParseJson(jsonStr);
      if (!payload) continue;

      if (typeof payload.error === "string") {
        throw new ChatApiError(
          payload.error,
          typeof payload.code === "string" ? payload.code : "STREAM_ERROR",
          502
        );
      }
      if (typeof payload.text === "string" && payload.text.length > 0) {
        accumulated += payload.text;
        onChunk(accumulated, payload.text);
      }
      if (payload.done === true) {
        sawDone = true;
      }
    }
  };

  const readChunkWithTimeout = async (): Promise<
    ReadableStreamReadResult<Uint8Array>
  > => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            void reader.cancel().catch(() => {});
            reject(
              new ChatApiError(
                "Response paused for too long while streaming. Please click Retry.",
                "STREAM_TIMEOUT",
                504
              )
            );
          }, STREAM_IDLE_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer !== null) clearTimeout(timer);
    }
  };

  try {
    while (true) {
      if (signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }

      const { value, done } = await readChunkWithTimeout();
      if (done) {
        buffer += decoder.decode().replace(/\r\n/g, "\n");
        break;
      }

      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const eventBlock of events) {
        processEventBlock(eventBlock);
      }
    }

    if (buffer.trim().length > 0) {
      processEventBlock(buffer);
    }
  } finally {
    reader.releaseLock();
  }

  if (!accumulated.trim() && !sawDone) {
    throw new ChatApiError(
      "The response stream ended unexpectedly before replying. Please click Retry.",
      "INCOMPLETE_STREAM",
      502
    );
  }

  return accumulated;
}
