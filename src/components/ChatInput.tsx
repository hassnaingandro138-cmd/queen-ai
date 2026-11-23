import {
  useEffect,
  useRef,
  useState,
  KeyboardEvent,
  FormEvent,
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
} from "react";
import {
  AlertCircle,
  ArrowUp,
  ExternalLink,
  ImagePlus,
  Loader2,
  Mic,
  MicOff,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { isEmbeddedIframe } from "../lib/voice";
import {
  formatFileSize,
  MAX_IMAGES_PER_MESSAGE,
  processImageFiles,
} from "../lib/images";
import {
  ChatImage,
  SPEECH_LANGUAGES,
  SpeechLanguage,
} from "../types/chat";

interface ChatInputProps {
  value: string;
  attachedImages: ChatImage[];
  externalImageErrors?: string[];
  isLoading: boolean;
  isVoiceChatOpen?: boolean;
  speechLanguage: SpeechLanguage;
  onChange: (value: string) => void;
  onAddImages: (images: ChatImage[]) => void;
  onReplaceImage: (imageId: string, replacement: ChatImage) => void;
  onRemoveImage: (imageId: string) => void;
  onClearExternalImageErrors?: () => void;
  onChangeSpeechLanguage: (lang: SpeechLanguage) => void;
  onSend: () => void;
  onStop: () => void;
}

export default function ChatInput({
  value,
  attachedImages,
  externalImageErrors = [],
  isLoading,
  isVoiceChatOpen = false,
  speechLanguage,
  onChange,
  onAddImages,
  onReplaceImage,
  onRemoveImage,
  onClearExternalImageErrors,
  onChangeSpeechLanguage,
  onSend,
  onStop,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetIdRef = useRef<string | null>(null);
  const valueRef = useRef(value);

  const [isProcessingImages, setIsProcessingImages] = useState(false);
  const [imageErrors, setImageErrors] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const {
    isSupported: isSpeechSupported,
    isListening,
    isRequestingPermission,
    permissionState,
    interimText,
    error: speechError,
    errorKind: speechErrorKind,
    clearError: clearSpeechError,
    startListening,
    stopListening,
    abortListening,
  } = useSpeechRecognition({
    language: speechLanguage,
    continuous: true,
    onFinalTranscript: (transcript) => {
      const current = valueRef.current;
      const separator = current.trim().length > 0 ? " " : "";
      const nextValue = `${current.trimEnd()}${separator}${transcript}`;
      valueRef.current = nextValue;
      onChange(nextValue);
    },
  });

  // Ensure ChatInput mic never runs simultaneously with Live Voice Chat overlay
  useEffect(() => {
    if (isVoiceChatOpen && isListening) {
      abortListening();
    }
  }, [abortListening, isListening, isVoiceChatOpen]);

  // Display recognized speech live right inside the input box while recording
  const liveDisplayValue =
    isListening && interimText
      ? value.trim().length > 0
        ? `${value.trimEnd()} ${interimText}`
        : interimText
      : value;

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(el.scrollHeight, 200);
    el.style.height = `${Math.max(nextHeight, 24)}px`;
  }, [liveDisplayValue]);

  const handleFilesSelected = async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;
    setImageErrors([]);
    setIsProcessingImages(true);
    try {
      const result = await processImageFiles(files, attachedImages.length);
      if (result.images.length > 0) {
        onAddImages(result.images);
      }
      if (result.errors.length > 0) {
        setImageErrors(result.errors);
      }
    } finally {
      setIsProcessingImages(false);
    }
  };

  const handleFileInputChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await handleFilesSelected(e.target.files);
    }
    e.target.value = "";
  };

  const handleReplaceFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const targetId = replaceTargetIdRef.current;
    replaceTargetIdRef.current = null;
    const files = e.target.files;
    if (!targetId || !files || files.length === 0) {
      e.target.value = "";
      return;
    }

    setImageErrors([]);
    setIsProcessingImages(true);
    try {
      const result = await processImageFiles([files[0]], 0);
      if (result.images[0]) {
        onReplaceImage(targetId, result.images[0]);
      }
      if (result.errors.length > 0) {
        setImageErrors(result.errors);
      }
    } finally {
      setIsProcessingImages(false);
      e.target.value = "";
    }
  };

  const handlePaste = async (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(e.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null);

    if (imageFiles.length > 0) {
      e.preventDefault();
      await handleFilesSelected(imageFiles);
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isLoading) setIsDraggingOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (isLoading) return;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      await handleFilesSelected(e.dataTransfer.files);
    }
  };

  const handleToggleMic = async () => {
    clearSpeechError();
    if (isRequestingPermission) return;
    if (isListening) {
      stopListening();
      return;
    }
    const started = await startListening();
    if (started) {
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSend) {
        if (isListening) stopListening();
        onSend();
      }
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (canSend) {
      if (isListening) stopListening();
      onSend();
    }
  };

  const canSend =
    !isLoading &&
    !isProcessingImages &&
    (liveDisplayValue.trim().length > 0 || attachedImages.length > 0);

  return (
    <div className="shrink-0 bg-gradient-to-t from-[#FDFBFF] via-[#FDFBFF] to-[#FDFBFF]/90 dark:from-[#0D0814] dark:via-[#0D0814] dark:to-[#0D0814]/90 pt-2 pb-4 px-4 sm:px-6">
      <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFileInputChange}
          className="hidden"
          aria-hidden="true"
        />
        <input
          ref={replaceInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          onChange={handleReplaceFileChange}
          className="hidden"
          aria-hidden="true"
        />

        {/* Errors for image upload or speech recognition */}
        {(imageErrors.length > 0 ||
          externalImageErrors.length > 0 ||
          speechError) && (
          <div className="mb-2.5 flex items-start justify-between gap-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50/90 dark:bg-red-950/35 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <div className="space-y-1.5 min-w-0">
                {speechError && <p>{speechError}</p>}
                {speechError &&
                  (speechErrorKind === "permission" ||
                    speechErrorKind === "policy" ||
                    speechErrorKind === "no-device" ||
                    speechErrorKind === "busy") && (
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      {(speechErrorKind === "permission" ||
                        speechErrorKind === "no-device" ||
                        speechErrorKind === "busy") && (
                        <button
                          type="button"
                          onClick={() => void startListening()}
                          disabled={isRequestingPermission}
                          className="inline-flex items-center gap-1 rounded-md bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
                        >
                          {speechErrorKind === "permission" ? (
                            <Mic className="h-3 w-3" />
                          ) : (
                            <RefreshCw className="h-3 w-3" />
                          )}
                          <span>
                            {isRequestingPermission
                              ? "Checking..."
                              : speechErrorKind === "permission"
                                ? "Allow Microphone"
                                : "Retry Mic Check"}
                          </span>
                        </button>
                      )}
                      {(speechErrorKind === "policy" ||
                        (speechErrorKind === "permission" && isEmbeddedIframe())) &&
                        typeof window !== "undefined" && (
                          <a
                            href={window.location.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-red-300 dark:border-red-800 bg-white/80 dark:bg-red-950/60 hover:bg-white dark:hover:bg-red-900/60 px-2.5 py-1 text-[11px] font-medium text-red-700 dark:text-red-200 transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" />
                            <span>Open in New Tab</span>
                          </a>
                        )}
                    </div>
                  )}
                {[...externalImageErrors, ...imageErrors].map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setImageErrors([]);
                onClearExternalImageErrors?.();
                clearSpeechError();
              }}
              aria-label="Dismiss error"
              className="rounded p-0.5 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 shrink-0"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Requesting Microphone Permission Notice */}
        {isRequestingPermission && !isListening && (
          <div className="mb-2.5 flex items-center gap-2 rounded-xl border border-purple-300/60 dark:border-purple-700/60 bg-purple-50/90 dark:bg-purple-950/45 px-3.5 py-2 text-xs text-purple-900 dark:text-purple-100">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-pink-600 dark:text-amber-300 shrink-0" />
            <span>
              Requesting microphone access... Please choose &ldquo;Allow&rdquo; in your browser prompt.
            </span>
          </div>
        )}

        {/* Live Voice Listening Bar */}
        {isListening && (
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-pink-400/50 dark:border-pink-500/40 bg-purple-50/90 dark:bg-purple-950/45 px-3.5 py-2 text-xs text-purple-950 dark:text-purple-100">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex items-center gap-1 h-4" aria-hidden="true">
                {[0, 1, 2, 3].map((bar) => (
                  <span
                    key={bar}
                    className="w-1 rounded-full bg-gradient-to-t from-purple-600 to-pink-500 dark:from-pink-400 dark:to-amber-300 animate-pulse"
                    style={{
                      height: `${7 + ((bar * 5) % 11)}px`,
                      animationDelay: `${bar * 120}ms`,
                      animationDuration: "650ms",
                    }}
                  />
                ))}
              </div>
              <span className="font-medium shrink-0">
                Listening ({speechLanguage === "ur-PK" ? "Urdu" : "English"})
              </span>
              {interimText && (
                <span className="truncate text-purple-700 dark:text-pink-300 italic">
                  &ldquo;{interimText}&rdquo;
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={stopListening}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-r from-purple-700 to-pink-600 hover:from-purple-800 hover:to-pink-700 text-white text-[11px] font-medium transition-colors"
              >
                <Square className="h-2.5 w-2.5 fill-current" />
                <span>Stop Recording</span>
              </button>
            </div>
          </div>
        )}

        {/* Composer Card */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`rounded-2xl border transition-colors shadow-sm ${
            isDraggingOver
              ? "border-pink-500 dark:border-amber-400 bg-purple-50/70 dark:bg-purple-950/35 ring-2 ring-pink-500/20"
              : isLoading
                ? "border-purple-200 dark:border-purple-900/60 bg-purple-50/40 dark:bg-[#140D20]/60 opacity-90"
                : "border-purple-200 dark:border-purple-900/60 bg-white dark:bg-[#150E22] focus-within:border-purple-600 dark:focus-within:border-pink-500"
          }`}
        >
          {/* Image Previews */}
          {(attachedImages.length > 0 || isProcessingImages) && (
            <div className="flex flex-wrap items-center gap-2.5 px-3.5 pt-3 pb-1">
              {attachedImages.map((img) => (
                <div
                  key={img.id}
                  className="group relative flex items-center gap-2.5 rounded-xl border border-purple-200/80 dark:border-purple-800/70 bg-purple-50/60 dark:bg-[#1B122C] p-1.5 pr-2 max-w-[220px]"
                >
                  <img
                    src={img.dataUrl}
                    alt={img.name}
                    className="h-12 w-12 rounded-lg object-cover shrink-0 border border-purple-200/70 dark:border-purple-800"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-800 dark:text-purple-100 truncate">
                      {img.name}
                    </p>
                    <p className="text-[11px] font-mono tabular-nums text-purple-600/80 dark:text-purple-300/70">
                      {formatFileSize(img.sizeBytes)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => {
                        replaceTargetIdRef.current = img.id;
                        replaceInputRef.current?.click();
                      }}
                      title="Replace image"
                      aria-label={`Replace ${img.name}`}
                      className="rounded p-1 text-purple-400 hover:text-purple-800 dark:hover:text-purple-100 hover:bg-purple-200/60 dark:hover:bg-purple-800/50 transition-colors"
                    >
                      <RefreshCw className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => onRemoveImage(img.id)}
                      title="Remove image"
                      aria-label={`Remove ${img.name}`}
                      className="rounded p-1 text-purple-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/50 transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}

              {isProcessingImages && (
                <div className="flex items-center gap-2 rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-[#1B122C] px-3 py-2.5 text-xs text-purple-700 dark:text-purple-200">
                  <Loader2 className="h-4 w-4 animate-spin text-pink-600 dark:text-amber-300" />
                  <span>Processing image...</span>
                </div>
              )}
            </div>
          )}

          {/* Input Row */}
          <div className="flex items-end gap-1.5 sm:gap-2 px-3 py-2.5">
            {/* Image Upload Button */}
            <button
              type="button"
              disabled={isLoading || attachedImages.length >= MAX_IMAGES_PER_MESSAGE}
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach image"
              title={
                attachedImages.length >= MAX_IMAGES_PER_MESSAGE
                  ? `Maximum ${MAX_IMAGES_PER_MESSAGE} images attached`
                  : "Attach JPG, PNG, or WEBP image"
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-purple-600 dark:text-purple-300 hover:text-pink-600 dark:hover:text-amber-300 hover:bg-purple-100/70 dark:hover:bg-purple-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus-visible:outline-2 focus-visible:outline-purple-600"
            >
              <ImagePlus className="h-4.5 w-4.5" />
            </button>

            <textarea
              ref={textareaRef}
              rows={1}
              value={liveDisplayValue}
              disabled={isLoading}
              readOnly={isListening && interimText.length > 0}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={
                isDraggingOver
                  ? "Drop images here to attach..."
                  : isLoading
                    ? "QUEEN AI is composing a response..."
                    : isListening
                      ? "Speak now..."
                      : attachedImages.length > 0
                        ? "Ask QUEEN AI about your image(s)..."
                        : "Message QUEEN AI..."
              }
              aria-label="Message input"
              className="flex-1 max-h-[200px] min-h-[24px] py-1.5 px-1 bg-transparent text-sm sm:text-[15px] leading-relaxed text-slate-900 dark:text-purple-50 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none resize-none disabled:cursor-not-allowed"
            />

            {/* Voice Language Selector + Microphone Button */}
            <div className="flex items-center gap-1 shrink-0">
              {isSpeechSupported && (
                <select
                  value={speechLanguage}
                  disabled={isLoading || isListening || isRequestingPermission}
                  onChange={(e) =>
                    onChangeSpeechLanguage(e.target.value as SpeechLanguage)
                  }
                  aria-label="Speech recognition language"
                  title="Voice input language"
                  className="h-8 rounded-lg border border-purple-200/80 dark:border-purple-800/70 bg-purple-50/70 dark:bg-[#1B122C] px-1.5 text-[11px] font-medium text-purple-800 dark:text-purple-200 focus:outline-none focus:border-purple-600 cursor-pointer disabled:opacity-50"
                >
                  {SPEECH_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.shortLabel}
                    </option>
                  ))}
                </select>
              )}

              <button
                type="button"
                disabled={isLoading || isRequestingPermission}
                onClick={() => void handleToggleMic()}
                aria-label={
                  isRequestingPermission
                    ? "Requesting microphone access"
                    : isListening
                      ? "Stop recording"
                      : "Start recording"
                }
                title={
                  !isSpeechSupported
                    ? "Speech recognition unavailable in this browser"
                    : isRequestingPermission
                      ? "Requesting microphone access..."
                      : isListening
                        ? "Stop recording"
                        : permissionState === "denied"
                          ? "Microphone blocked — click to retry permission"
                          : `Start voice input (${speechLanguage})`
                }
                className={`touch-manipulation relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-purple-600 disabled:opacity-50 disabled:cursor-not-allowed ${
                  isListening
                    ? "bg-pink-600 text-white hover:bg-pink-700"
                    : permissionState === "denied"
                      ? "text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                      : "text-purple-600 dark:text-purple-300 hover:text-pink-600 dark:hover:text-amber-300 hover:bg-purple-100/70 dark:hover:bg-purple-900/40"
                }`}
              >
                {isListening && (
                  <span
                    className="absolute inset-0 rounded-xl bg-pink-500/40 animate-ping"
                    aria-hidden="true"
                  />
                )}
                {isRequestingPermission ? (
                  <Loader2 className="relative h-4 w-4 animate-spin" />
                ) : !isSpeechSupported ? (
                  <MicOff className="relative h-4 w-4" />
                ) : isListening ? (
                  <Square className="relative h-3.5 w-3.5 fill-current" />
                ) : (
                  <Mic className="relative h-4 w-4" />
                )}
              </button>
            </div>

            {/* Send / Stop Button */}
            {isLoading ? (
              <button
                type="button"
                onClick={onStop}
                aria-label="Stop generating"
                title="Stop generating"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-900 dark:bg-amber-400 text-white dark:text-purple-950 hover:bg-purple-800 dark:hover:bg-amber-300 transition-colors focus-visible:outline-2 focus-visible:outline-purple-600"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                title="Send message"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-purple-700 via-fuchsia-600 to-pink-600 hover:from-purple-800 hover:via-fuchsia-700 hover:to-pink-700 text-white disabled:from-purple-100 disabled:to-purple-100 dark:disabled:from-purple-950 dark:disabled:to-purple-950 disabled:text-purple-300 dark:disabled:text-purple-700 disabled:cursor-not-allowed transition-all focus-visible:outline-2 focus-visible:outline-purple-600"
              >
                <ArrowUp className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-slate-400 dark:text-purple-300/50">
          Enter to send · Shift + Enter for new line · Drag &amp; drop or paste JPG, PNG, WEBP images
        </p>
      </form>
    </div>
  );
}
