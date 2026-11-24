import { GoogleGenAI } from "@google/genai";

export const ALLOWED_MODELS = new Set([
  "gemini-4-hydrogen",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
]);
export const DEFAULT_MODEL = "gemini-3.1-flash-lite";
export const DEFAULT_SYSTEM_INSTRUCTION =
  "You are QUEEN AI, a helpful, intelligent, and warm royal AI assistant. Keep your tone natural, clear, and polite—graceful without being overly dramatic or archaic. Always reply in the exact same language and script the user uses: if the user writes in Roman Urdu (such as 'kc ho', 'kiya kar rha ho', or 'kya haal hai'), reply naturally in clear Roman Urdu (Latin script) and NEVER switch to Hindi/Devanagari script unless the user explicitly writes in Devanagari script. If the user writes in casual English, reply in clear, friendly English. Format responses with clean Markdown and fenced code blocks when helpful.";

const UPSTREAM_CONNECT_TIMEOUT_MS = 15_000;
const STREAM_CHUNK_TIMEOUT_MS = 25_000;

class UpstreamTimeoutError extends Error {
  constructor(message = "Upstream Gemini request timed out.") {
    super(message);
    this.name = "UpstreamTimeoutError";
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new UpstreamTimeoutError(message));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const MAX_IMAGES_PER_MESSAGE = 4;
export const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024; // ~6MB binary per image

export interface IncomingImage {
  mimeType: string;
  data: string;
}

export interface IncomingChatMessage {
  role: "user" | "model";
  content: string;
  images?: IncomingImage[];
}

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiContent = {
  role: "user" | "model";
  parts: GeminiPart[];
};

export interface StreamResponseLike {
  status?: (code: number) => StreamResponseLike;
  json?: (payload: unknown) => void;
  statusCode: number;
  setHeader(name: string, value: string): unknown;
  flushHeaders?: () => void;
  write(chunk: string): boolean;
  end(chunk?: string): unknown;
  readonly writableEnded: boolean;
  on(event: "close", listener: () => void): unknown;
}

export function sendJson(
  res: StreamResponseLike,
  statusCode: number,
  payload: unknown
): void {
  if (typeof res.status === "function" && typeof res.json === "function") {
    res.status(statusCode).json?.(payload);
    return;
  }
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function parseApiError(err: unknown): {
  status: number;
  code: string;
  message: string;
} {
  if (err instanceof UpstreamTimeoutError) {
    return {
      status: 504,
      code: "REQUEST_TIMEOUT",
      message:
        "QUEEN AI took too long to respond. Please try sending your message again.",
    };
  }

  const rawMessage = err instanceof Error ? err.message : String(err);
  const statusMatch =
    (err as { status?: number })?.status ??
    (rawMessage.includes("429") || rawMessage.includes("RESOURCE_EXHAUSTED")
      ? 429
      : rawMessage.includes("403") || rawMessage.includes("PERMISSION_DENIED")
        ? 403
        : rawMessage.includes("400") || rawMessage.includes("API_KEY_INVALID")
          ? 400
          : rawMessage.includes("404") || rawMessage.includes("NOT_FOUND")
            ? 404
            : 500);

  if (statusMatch === 429 || rawMessage.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      code: "RATE_LIMIT",
      message:
        "Rate limit reached on the Gemini API. Please wait a moment and try again.",
    };
  }
  if (
    statusMatch === 403 ||
    rawMessage.includes("PERMISSION_DENIED") ||
    rawMessage.includes("API_KEY_INVALID")
  ) {
    return {
      status: 403,
      code: "INVALID_API_KEY",
      message:
        "The configured Gemini API key was rejected or lacks permission. Please verify GEMINI_API_KEY in your environment variables.",
    };
  }
  if (statusMatch === 404 || rawMessage.includes("NOT_FOUND")) {
    return {
      status: 404,
      code: "MODEL_NOT_FOUND",
      message:
        "The selected Gemini model could not be found. Try switching to Gemini Flash Lite.",
    };
  }
  if (statusMatch === 400) {
    return {
      status: 400,
      code: "BAD_REQUEST",
      message:
        "The request could not be processed by Gemini. Please revise your prompt and try again.",
    };
  }

  return {
    status: 502,
    code: "UPSTREAM_ERROR",
    message:
      "Unable to reach the Gemini service right now. Please try again shortly.",
  };
}

function normalizeContents(messages: IncomingChatMessage[]): GeminiContent[] {
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    const trimmed = msg.content.trim();
    const msgParts: GeminiPart[] = [];

    if (msg.images && msg.images.length > 0) {
      for (const img of msg.images) {
        msgParts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data,
          },
        });
      }
    }

    if (trimmed) {
      msgParts.push({ text: trimmed });
    } else if (msgParts.length > 0) {
      msgParts.push({
        text: "Please analyze the attached image and describe what you see in detail.",
      });
    }

    if (msgParts.length === 0) continue;

    const last = contents[contents.length - 1];
    if (last && last.role === msg.role) {
      last.parts.push(...msgParts);
    } else {
      contents.push({
        role: msg.role,
        parts: msgParts,
      });
    }
  }

  while (contents.length > 0 && contents[0].role !== "user") {
    contents.shift();
  }

  return contents;
}

async function createStreamWithRetry(
  ai: GoogleGenAI,
  model: string,
  contents: GeminiContent[],
  systemInstruction: string
) {
  const candidates = Array.from(
    new Set(
      model === "gemini-4-hydrogen"
        ? [
            "gemini-4-hydrogen",
            "gemini-3.1-flash-lite",
            "gemini-2.5-flash-lite",
            "gemini-2.5-flash",
          ]
        : model === "gemini-3.1-flash-lite"
          ? [
              "gemini-3.1-flash-lite",
              "gemini-2.5-flash-lite",
              "gemini-2.5-flash",
            ]
          : [model, "gemini-2.5-flash-lite", "gemini-2.5-flash"]
    )
  );

  let lastError: unknown;

  for (const candidateModel of candidates) {
    const maxAttempts = candidateModel === model ? 2 : 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await withTimeout(
          ai.models.generateContentStream({
            model: candidateModel,
            contents,
            config: {
              systemInstruction,
            },
          }),
          UPSTREAM_CONNECT_TIMEOUT_MS,
          `Model ${candidateModel} timed out before responding.`
        );
      } catch (err) {
        lastError = err;
        const parsed = parseApiError(err);

        // Auth/bad-request errors will not succeed on fallback models
        if (parsed.status === 403 || parsed.status === 400) {
          throw err;
        }

        // Model ID unavailable on this endpoint -> jump straight to fallback model
        if (parsed.status === 404) {
          break;
        }

        const isTransient =
          parsed.status >= 500 || parsed.status === 429 || parsed.status === 504;
        if (!isTransient) {
          throw err;
        }

        if (attempt < maxAttempts) {
          const delayMs = 400 * attempt;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
  }

  throw lastError;
}

export async function handleChatRequest(
  rawBody: unknown,
  res: StreamResponseLike
): Promise<void> {
  const ai = getGeminiClient();
  if (!ai) {
    sendJson(res, 503, {
      code: "MISSING_API_KEY",
      error:
        "Gemini API key is not configured on the server. Add GEMINI_API_KEY in your environment variables (Vercel Project Settings > Environment Variables or local .env).",
    });
    return;
  }

  const body =
    rawBody && typeof rawBody === "object"
      ? (rawBody as Record<string, unknown>)
      : {};
  const { messages, model: requestedModel, systemInstruction } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    sendJson(res, 400, {
      code: "INVALID_MESSAGES",
      error: "Messages array is required and must contain at least one message.",
    });
    return;
  }

  if (messages.length > 100) {
    sendJson(res, 400, {
      code: "TOO_MANY_MESSAGES",
      error: "Conversation context exceeds the 100-message request limit.",
    });
    return;
  }

  const validatedMessages: IncomingChatMessage[] = [];
  for (const item of messages) {
    if (
      !item ||
      typeof item !== "object" ||
      (item.role !== "user" && item.role !== "model") ||
      typeof item.content !== "string"
    ) {
      sendJson(res, 400, {
        code: "INVALID_MESSAGE_FORMAT",
        error:
          "Each message must include a valid role ('user' | 'model') and string content.",
      });
      return;
    }
    if (item.content.length > 32000) {
      sendJson(res, 400, {
        code: "MESSAGE_TOO_LONG",
        error: "A single message exceeds the 32,000-character limit.",
      });
      return;
    }

    let validatedImages: IncomingImage[] | undefined;
    if (item.images !== undefined) {
      if (!Array.isArray(item.images)) {
        sendJson(res, 400, {
          code: "INVALID_IMAGES_FORMAT",
          error: "Images must be provided as an array.",
        });
        return;
      }
      if (item.images.length > MAX_IMAGES_PER_MESSAGE) {
        sendJson(res, 400, {
          code: "TOO_MANY_IMAGES",
          error: `A single message can include at most ${MAX_IMAGES_PER_MESSAGE} images.`,
        });
        return;
      }
      validatedImages = [];
      for (const img of item.images) {
        if (
          !img ||
          typeof img !== "object" ||
          typeof img.mimeType !== "string" ||
          typeof img.data !== "string"
        ) {
          sendJson(res, 400, {
            code: "INVALID_IMAGE_DATA",
            error: "Each image must include mimeType and base64 data.",
          });
          return;
        }
        if (!ALLOWED_IMAGE_MIME_TYPES.has(img.mimeType)) {
          sendJson(res, 400, {
            code: "UNSUPPORTED_IMAGE_FORMAT",
            error: "Only JPG, JPEG, PNG, and WEBP image formats are supported.",
          });
          return;
        }
        const cleanBase64 = img.data.replace(
          /^data:image\/[a-zA-Z+]+;base64,/,
          ""
        );
        if (
          cleanBase64.length === 0 ||
          cleanBase64.length > MAX_IMAGE_BASE64_LENGTH
        ) {
          sendJson(res, 400, {
            code: "IMAGE_TOO_LARGE",
            error: "Attached image exceeds the allowed size limit.",
          });
          return;
        }
        validatedImages.push({
          mimeType: img.mimeType,
          data: cleanBase64,
        });
      }
    }

    validatedMessages.push({
      role: item.role,
      content: item.content,
      images: validatedImages,
    });
  }

  const contents = normalizeContents(validatedMessages);
  if (contents.length === 0 || contents[contents.length - 1].role !== "user") {
    sendJson(res, 400, {
      code: "INVALID_TURN_ORDER",
      error: "Conversation must include a user message to respond to.",
    });
    return;
  }

  const model =
    typeof requestedModel === "string" && ALLOWED_MODELS.has(requestedModel)
      ? requestedModel
      : DEFAULT_MODEL;

  const customInstruction =
    typeof systemInstruction === "string" && systemInstruction.trim().length > 0
      ? systemInstruction.trim().slice(0, 4000)
      : DEFAULT_SYSTEM_INSTRUCTION;

  let stream;
  try {
    stream = await createStreamWithRetry(ai, model, contents, customInstruction);
  } catch (err) {
    const parsed = parseApiError(err);
    console.error("[/api/chat] Stream creation error:", {
      status: parsed.status,
      code: parsed.code,
      detail: err instanceof Error ? err.message : String(err),
    });
    sendJson(res, parsed.status, {
      code: parsed.code,
      error: parsed.message,
    });
    return;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let clientClosed = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      clientClosed = true;
    }
  });

  let emittedText = false;
  try {
    const iterator = stream[Symbol.asyncIterator]();
    while (!clientClosed) {
      const nextChunk = await withTimeout(
        iterator.next(),
        STREAM_CHUNK_TIMEOUT_MS,
        "Response stream stalled while waiting for the next token."
      );
      if (nextChunk.done) break;
      const text = nextChunk.value?.text;
      if (text) {
        emittedText = true;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    if (!clientClosed && !res.writableEnded) {
      if (!emittedText) {
        res.write(
          `data: ${JSON.stringify({
            error: "No reply was returned for that message. Please try again.",
            code: "EMPTY_RESPONSE",
          })}\n\n`
        );
      } else {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      }
    }
  } catch (err) {
    const parsed = parseApiError(err);
    console.error("[/api/chat] Streaming chunk error:", {
      status: parsed.status,
      code: parsed.code,
      detail: err instanceof Error ? err.message : String(err),
    });
    if (!clientClosed && !res.writableEnded) {
      res.write(
        `data: ${JSON.stringify({ error: parsed.message, code: parsed.code })}\n\n`
      );
    }
  } finally {
    if (!res.writableEnded) {
      res.end();
    }
  }
}
