import "dotenv/config";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ALLOWED_MODELS = new Set(["gemini-4-hydrogen", "gemini-3.1-flash-lite"]);
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const DEFAULT_SYSTEM_INSTRUCTION =
  "You are QUEEN AI, a graceful, intelligent, and royal AI assistant. Format responses with clean Markdown when useful, use fenced code blocks with language identifiers for code, and be helpful, clear, and refined.";

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const MAX_IMAGES_PER_MESSAGE = 4;
const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024; // ~6MB binary per image

interface IncomingImage {
  mimeType: string;
  data: string;
}

interface IncomingMessage {
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
        "The configured Gemini API key was rejected or lacks permission. Please verify GEMINI_API_KEY in Settings > Secrets.",
    };
  }
  if (statusMatch === 404 || rawMessage.includes("NOT_FOUND")) {
    return {
      status: 404,
      code: "MODEL_NOT_FOUND",
      message:
        "The selected Gemini model could not be found. Try switching to Gemini 4 Flash.",
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

function normalizeContents(messages: IncomingMessage[]): GeminiContent[] {
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

  // Gemini multi-turn conversations should start with a user turn
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
  const maxAttempts = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction,
        },
      });
    } catch (err) {
      lastError = err;
      const parsed = parseApiError(err);
      if (parsed.status === 429 && model === "gemini-4-hydrogen") {
        return await ai.models.generateContentStream({
          model: "gemini-3.1-flash-lite",
          contents,
          config: {
            systemInstruction,
          },
        });
      }
      const isTransient = parsed.status >= 500 || parsed.status === 429;
      if (!isTransient || attempt === maxAttempts) {
        if (
          model === "gemini-4-hydrogen" &&
          (parsed.status === 429 || parsed.status >= 500)
        ) {
          return await ai.models.generateContentStream({
            model: "gemini-3.1-flash-lite",
            contents,
            config: {
              systemInstruction,
            },
          });
        }
        throw err;
      }
      const delayMs = Math.min(400 * 2 ** (attempt - 1), 2000);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "20mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/chat", async (req, res) => {
    const ai = getGeminiClient();
    if (!ai) {
      return res.status(503).json({
        code: "MISSING_API_KEY",
        error:
          "Gemini API key is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets or your local .env file.",
      });
    }

    const { messages, model: requestedModel, systemInstruction } = req.body ?? {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        code: "INVALID_MESSAGES",
        error: "Messages array is required and must contain at least one message.",
      });
    }

    if (messages.length > 100) {
      return res.status(400).json({
        code: "TOO_MANY_MESSAGES",
        error: "Conversation context exceeds the 100-message request limit.",
      });
    }

    const validatedMessages: IncomingMessage[] = [];
    for (const item of messages) {
      if (
        !item ||
        typeof item !== "object" ||
        (item.role !== "user" && item.role !== "model") ||
        typeof item.content !== "string"
      ) {
        return res.status(400).json({
          code: "INVALID_MESSAGE_FORMAT",
          error: "Each message must include a valid role ('user' | 'model') and string content.",
        });
      }
      if (item.content.length > 32000) {
        return res.status(400).json({
          code: "MESSAGE_TOO_LONG",
          error: "A single message exceeds the 32,000-character limit.",
        });
      }

      let validatedImages: IncomingImage[] | undefined;
      if (item.images !== undefined) {
        if (!Array.isArray(item.images)) {
          return res.status(400).json({
            code: "INVALID_IMAGES_FORMAT",
            error: "Images must be provided as an array.",
          });
        }
        if (item.images.length > MAX_IMAGES_PER_MESSAGE) {
          return res.status(400).json({
            code: "TOO_MANY_IMAGES",
            error: `A single message can include at most ${MAX_IMAGES_PER_MESSAGE} images.`,
          });
        }
        validatedImages = [];
        for (const img of item.images) {
          if (
            !img ||
            typeof img !== "object" ||
            typeof img.mimeType !== "string" ||
            typeof img.data !== "string"
          ) {
            return res.status(400).json({
              code: "INVALID_IMAGE_DATA",
              error: "Each image must include mimeType and base64 data.",
            });
          }
          if (!ALLOWED_IMAGE_MIME_TYPES.has(img.mimeType)) {
            return res.status(400).json({
              code: "UNSUPPORTED_IMAGE_FORMAT",
              error: "Only JPG, JPEG, PNG, and WEBP image formats are supported.",
            });
          }
          const cleanBase64 = img.data.replace(/^data:image\/[a-zA-Z+]+;base64,/, "");
          if (
            cleanBase64.length === 0 ||
            cleanBase64.length > MAX_IMAGE_BASE64_LENGTH
          ) {
            return res.status(400).json({
              code: "IMAGE_TOO_LARGE",
              error: "Attached image exceeds the allowed size limit.",
            });
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
      return res.status(400).json({
        code: "INVALID_TURN_ORDER",
        error: "Conversation must include a user message to respond to.",
      });
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
      return res.status(parsed.status).json({
        code: parsed.code,
        error: parsed.message,
      });
    }

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let clientClosed = false;
    res.on("close", () => {
      if (!res.writableEnded) {
        clientClosed = true;
      }
    });

    try {
      for await (const chunk of stream) {
        if (clientClosed) break;
        const text = chunk.text;
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }
      if (!clientClosed && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
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
  });

  // Ensure unmatched /api/* routes always return JSON rather than falling through to HTML
  app.use("/api", (_req, res) => {
    res.status(404).json({
      code: "NOT_FOUND",
      error: "API endpoint not found.",
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*path}", (_req, res) => {
      const indexFile = path.join(distDir, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Build artifacts not found. Run npm run build first.");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`QUEEN AI server running at http://localhost:${PORT}`);
  });
}

startServer();
