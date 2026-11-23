import { ChatMessage, GeminiModelId } from "../types/chat";
import { extractBase64FromDataUrl } from "./images";

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
    const response = await fetch("/api/chat", {
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
      signal,
    });

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

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const lines = event.split("\n");
      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
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
      }
    }
  }

  return accumulated;
}
