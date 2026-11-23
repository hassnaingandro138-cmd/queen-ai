import { useState, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertCircle,
  Check,
  Copy,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
  Volume2,
  X,
} from "lucide-react";
import { SpeechStatus } from "../hooks/useSpeechSynthesis";
import { ChatImage, ChatMessage } from "../types/chat";
import QueenCrownLogo from "./QueenCrownLogo";

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  isLatestModelMessage?: boolean;
  isBusy?: boolean;
  voiceEnabled?: boolean;
  speakingMessageId?: string | null;
  speechStatus?: SpeechStatus;
  onSpeakMessage?: (messageId: string, content: string) => void;
  onPauseSpeech?: () => void;
  onResumeSpeech?: () => void;
  onStopSpeech?: () => void;
  onRegenerate?: () => void;
  onEditUserMessage?: (messageId: string, updatedContent: string) => void;
  onRetryFailed?: () => void;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function sanitizeHref(href?: string): string | undefined {
  if (!href) return undefined;
  const trimmed = href.trim();
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("mailto:")
  ) {
    return trimmed;
  }
  return undefined;
}

function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-purple-200/80 dark:border-purple-900/60 bg-[#130B20] text-purple-50">
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#1D1230] border-b border-purple-900/60 text-xs text-purple-300">
        <span className="font-mono lowercase">{language || "code"}</span>
        <button
          type="button"
          onClick={handleCopyCode}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-purple-800/60 text-purple-200 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-pink-500"
          aria-label="Copy code block"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-amber-300">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="overflow-x-auto p-3.5 text-[13px] leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function MessageBubble({
  message,
  isStreaming = false,
  isLatestModelMessage = false,
  isBusy = false,
  voiceEnabled = true,
  speakingMessageId = null,
  speechStatus = "idle",
  onSpeakMessage,
  onPauseSpeech,
  onResumeSpeech,
  onStopSpeech,
  onRegenerate,
  onEditUserMessage,
  onRetryFailed,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.content);
  const [lightboxImage, setLightboxImage] = useState<ChatImage | null>(null);

  const isUser = message.role === "user";
  const timestamp = formatTimestamp(message.timestamp);
  const isSpeakingThis =
    speakingMessageId === message.id && speechStatus !== "idle";

  const handleCopyMessage = async () => {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  const handleSaveEdit = () => {
    const trimmed = editDraft.trim();
    if (
      (!trimmed && (!message.images || message.images.length === 0)) ||
      !onEditUserMessage
    ) {
      return;
    }
    setIsEditing(false);
    onEditUserMessage(message.id, trimmed);
  };

  if (isUser) {
    const images = message.images ?? [];
    return (
      <>
        <div className="group flex flex-col items-end">
          <div className="max-w-[85%] sm:max-w-[75%] flex flex-col items-end">
            {images.length > 0 && (
              <div
                className={`mb-2 grid gap-2 ${
                  images.length === 1 ? "grid-cols-1" : "grid-cols-2"
                }`}
              >
                {images.map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => setLightboxImage(img)}
                    className="group/img relative overflow-hidden rounded-2xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-[#191128] focus-visible:outline-2 focus-visible:outline-purple-600"
                    title={`View ${img.name}`}
                  >
                    <img
                      src={img.dataUrl}
                      alt={img.name}
                      className="max-h-64 w-full object-cover transition-transform duration-150 group-hover/img:scale-[1.02]"
                    />
                  </button>
                ))}
              </div>
            )}

            {isEditing ? (
              <div className="rounded-2xl border border-purple-600 dark:border-pink-500 bg-white dark:bg-[#150E22] p-3 shadow-sm min-w-[260px] sm:min-w-[360px]">
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={3}
                  aria-label="Edit message"
                  className="w-full bg-transparent text-sm text-slate-900 dark:text-purple-50 focus:outline-none resize-y"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditDraft(message.content);
                      setIsEditing(false);
                    }}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-purple-200 dark:border-purple-800 text-slate-700 dark:text-purple-200 hover:bg-purple-50 dark:hover:bg-purple-900/40 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={!editDraft.trim() && images.length === 0}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-purple-700 to-pink-600 hover:from-purple-800 hover:to-pink-700 text-white disabled:opacity-50 transition-colors"
                  >
                    Save &amp; Resend
                  </button>
                </div>
              </div>
            ) : (
              message.content && (
                <div className="rounded-2xl rounded-tr-sm bg-gradient-to-br from-purple-700 via-purple-700 to-pink-700 dark:from-purple-600 dark:to-pink-600 text-white px-4 py-3 text-sm sm:text-[15px] leading-relaxed whitespace-pre-wrap break-words shadow-xs">
                  {message.content}
                </div>
              )
            )}

            <div className="mt-1.5 flex items-center justify-end gap-2 px-1">
              {!isEditing && !isBusy && onEditUserMessage && (
                <button
                  type="button"
                  onClick={() => {
                    setEditDraft(message.content);
                    setIsEditing(true);
                  }}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-700 dark:hover:text-pink-300 transition-opacity"
                  aria-label="Edit message"
                  title="Edit and resend"
                >
                  <Pencil className="h-3 w-3" />
                  <span>Edit</span>
                </button>
              )}
              {message.content && (
                <button
                  type="button"
                  onClick={handleCopyMessage}
                  className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 inline-flex items-center gap-1 text-[11px] text-purple-400 hover:text-purple-700 dark:hover:text-pink-300 transition-opacity"
                  aria-label="Copy message"
                  title="Copy message"
                >
                  {copied ? (
                    <>
                      <Check className="h-3 w-3 text-amber-600 dark:text-amber-300" />
                      <span className="text-amber-600 dark:text-amber-300">
                        Copied
                      </span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              )}
              {timestamp && (
                <span className="text-[11px] font-mono tabular-nums text-slate-400 dark:text-purple-300/50">
                  {timestamp}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Lightbox for inspecting uploaded images */}
        {lightboxImage && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0D0814]/85 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-label={lightboxImage.name}
            onClick={() => setLightboxImage(null)}
          >
            <div
              className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setLightboxImage(null)}
                aria-label="Close image preview"
                className="absolute -top-10 right-0 flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
              <img
                src={lightboxImage.dataUrl}
                alt={lightboxImage.name}
                className="max-h-[82vh] max-w-full rounded-2xl object-contain shadow-2xl border border-purple-500/30"
              />
              <p className="mt-2.5 text-xs text-purple-200">
                {lightboxImage.name}
              </p>
            </div>
          </div>
        )}
      </>
    );
  }

  const showTypingAnimation = isStreaming && message.content.length === 0;

  return (
    <div
      className={`group flex items-start gap-3.5 transition-colors ${
        isSpeakingThis
          ? "rounded-2xl border border-pink-400/50 dark:border-amber-400/40 bg-purple-50/70 dark:bg-purple-950/35 p-3.5 -mx-3.5"
          : ""
      }`}
    >
      <div
        className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-700 via-purple-600 to-pink-600 border border-amber-300/60 shadow-xs"
        aria-hidden="true"
      >
        <QueenCrownLogo size="sm" />
      </div>

      <div className="min-w-0 flex-1">
        {isSpeakingThis && (
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-purple-700 dark:text-amber-300">
            <Volume2 className="h-3.5 w-3.5" />
            <span>
              {speechStatus === "paused"
                ? "Speech paused"
                : "QUEEN AI is speaking..."}
            </span>
          </div>
        )}

        {message.error ? (
          <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/30 p-4 text-sm text-red-800 dark:text-red-300">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-600 dark:text-red-400" />
              <div className="flex-1">
                <p className="font-medium">Could not generate response</p>
                <p className="mt-1 text-xs text-red-700 dark:text-red-300/90 leading-relaxed">
                  {message.error}
                </p>
                {onRetryFailed && !isBusy && (
                  <button
                    type="button"
                    onClick={onRetryFailed}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-700 text-white transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Retry</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : showTypingAnimation ? (
          <div
            className="inline-flex items-center gap-1.5 py-3 px-4 rounded-2xl bg-purple-50 dark:bg-[#191128] border border-purple-200/80 dark:border-purple-900/60"
            aria-label="QUEEN AI is thinking"
          >
            <span className="h-2 w-2 rounded-full bg-purple-600 dark:bg-purple-400 animate-bounce [animation-delay:-0.3s]" />
            <span className="h-2 w-2 rounded-full bg-pink-600 dark:bg-pink-400 animate-bounce [animation-delay:-0.15s]" />
            <span className="h-2 w-2 rounded-full bg-amber-500 dark:bg-amber-300 animate-bounce" />
          </div>
        ) : (
          <div className="text-sm sm:text-[15px] leading-[1.7] text-slate-800 dark:text-purple-50/90 break-words">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="mt-5 mb-2.5 text-xl font-semibold text-slate-900 dark:text-purple-50 first:mt-0">
                    {children}
                  </h1>
                ),
                h2: ({ children }) => (
                  <h2 className="mt-4 mb-2 text-lg font-semibold text-slate-900 dark:text-purple-50 first:mt-0">
                    {children}
                  </h2>
                ),
                h3: ({ children }) => (
                  <h3 className="mt-3.5 mb-1.5 text-base font-semibold text-slate-900 dark:text-purple-50 first:mt-0">
                    {children}
                  </h3>
                ),
                p: ({ children }) => (
                  <p className="mb-3 last:mb-0">{children}</p>
                ),
                ul: ({ children }) => (
                  <ul className="mb-3 list-disc pl-5 space-y-1.5 last:mb-0">
                    {children}
                  </ul>
                ),
                ol: ({ children }) => (
                  <ol className="mb-3 list-decimal pl-5 space-y-1.5 last:mb-0">
                    {children}
                  </ol>
                ),
                li: ({ children }) => (
                  <li className="leading-relaxed">{children}</li>
                ),
                blockquote: ({ children }) => (
                  <blockquote className="my-3 rounded-xl border border-purple-200 dark:border-purple-800/70 bg-purple-50/70 dark:bg-[#191128] px-4 py-3 text-slate-700 dark:text-purple-200">
                    {children}
                  </blockquote>
                ),
                a: ({ href, children }) => {
                  const safeHref = sanitizeHref(href);
                  if (!safeHref) {
                    return <span>{children}</span>;
                  }
                  return (
                    <a
                      href={safeHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-700 dark:text-pink-400 underline underline-offset-2 hover:text-pink-600 dark:hover:text-amber-300"
                    >
                      {children}
                    </a>
                  );
                },
                table: ({ children }) => (
                  <div className="my-3 overflow-x-auto rounded-xl border border-purple-200 dark:border-purple-900/60">
                    <table className="w-full text-left text-xs sm:text-sm border-collapse">
                      {children}
                    </table>
                  </div>
                ),
                thead: ({ children }) => (
                  <thead className="bg-purple-50 dark:bg-[#191128] text-slate-900 dark:text-purple-50">
                    {children}
                  </thead>
                ),
                th: ({ children }) => (
                  <th className="px-3 py-2 font-semibold border-b border-purple-200 dark:border-purple-900/60">
                    {children}
                  </th>
                ),
                td: ({ children }) => (
                  <td className="px-3 py-2 border-b border-purple-200/60 dark:border-purple-900/40">
                    {children}
                  </td>
                ),
                pre: ({ children }) => <>{children}</>,
                code: ({ className, children }) => {
                  const match = /language-(\w+)/.exec(className || "");
                  const content = String(children).replace(/\n$/, "");
                  const isBlock = Boolean(match) || content.includes("\n");
                  if (isBlock) {
                    return (
                      <CodeBlock
                        language={match ? match[1] : ""}
                        code={content}
                      />
                    );
                  }
                  return (
                    <code className="px-1.5 py-0.5 rounded-md bg-purple-100/80 dark:bg-purple-900/50 text-purple-950 dark:text-pink-200 text-[0.875em] font-mono">
                      {children as ReactNode}
                    </code>
                  );
                },
              }}
            >
              {message.content}
            </ReactMarkdown>
            {isStreaming && (
              <span
                className="inline-block w-1.5 h-4 ml-1 align-middle bg-pink-600 dark:bg-amber-300 animate-pulse"
                aria-hidden="true"
              />
            )}
          </div>
        )}

        {!isStreaming && !message.error && message.content && (
          <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-400 dark:text-purple-300/60">
            <button
              type="button"
              onClick={handleCopyMessage}
              className="inline-flex items-center gap-1 hover:text-purple-800 dark:hover:text-pink-300 transition-colors focus-visible:outline-2 focus-visible:outline-purple-600 rounded px-1 py-0.5 -ml-1"
              aria-label="Copy response"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-amber-600 dark:text-amber-300" />
                  <span className="text-amber-600 dark:text-amber-300">
                    Copied
                  </span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>

            {/* Speaker / Playback Controls */}
            {voiceEnabled && onSpeakMessage && (
              <>
                {isSpeakingThis ? (
                  <div className="inline-flex items-center gap-1.5">
                    {speechStatus === "speaking" && onPauseSpeech && (
                      <button
                        type="button"
                        onClick={onPauseSpeech}
                        className="inline-flex items-center gap-1 text-purple-800 dark:text-pink-200 hover:text-purple-950 dark:hover:text-white transition-colors rounded px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50"
                        aria-label="Pause speech"
                      >
                        <Pause className="h-3 w-3" />
                        <span>Pause</span>
                      </button>
                    )}
                    {speechStatus === "paused" && onResumeSpeech && (
                      <button
                        type="button"
                        onClick={onResumeSpeech}
                        className="inline-flex items-center gap-1 text-purple-800 dark:text-pink-200 hover:text-purple-950 dark:hover:text-white transition-colors rounded px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50"
                        aria-label="Resume speech"
                      >
                        <Play className="h-3 w-3" />
                        <span>Resume</span>
                      </button>
                    )}
                    {onStopSpeech && (
                      <button
                        type="button"
                        onClick={onStopSpeech}
                        className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:text-red-700 transition-colors rounded px-1.5 py-0.5"
                        aria-label="Stop speech"
                      >
                        <Square className="h-3 w-3 fill-current" />
                        <span>Stop</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSpeakMessage(message.id, message.content)}
                    className="inline-flex items-center gap-1 hover:text-purple-800 dark:hover:text-pink-300 transition-colors focus-visible:outline-2 focus-visible:outline-purple-600 rounded px-1 py-0.5"
                    aria-label="Read response aloud"
                    title="Read aloud"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Listen</span>
                  </button>
                )}
              </>
            )}

            {isLatestModelMessage && onRegenerate && !isBusy && (
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-1 hover:text-purple-800 dark:hover:text-pink-300 transition-colors focus-visible:outline-2 focus-visible:outline-purple-600 rounded px-1 py-0.5"
                aria-label="Regenerate response"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Regenerate</span>
              </button>
            )}

            {timestamp && (
              <span className="font-mono tabular-nums ml-auto">
                {timestamp}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
