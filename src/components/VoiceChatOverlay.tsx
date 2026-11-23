import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  Loader2,
  Mic,
  MicOff,
  Pause,
  Play,
  RefreshCw,
  Square,
  X,
} from "lucide-react";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { SpeechStatus } from "../hooks/useSpeechSynthesis";
import { isEmbeddedIframe } from "../lib/voice";
import { SPEECH_LANGUAGES, SpeechLanguage } from "../types/chat";
import QueenCrownLogo from "./QueenCrownLogo";

interface VoiceChatOverlayProps {
  open: boolean;
  language: SpeechLanguage;
  voiceEnabled: boolean;
  isGenerating: boolean;
  speechStatus: SpeechStatus;
  lastUserTranscript: string;
  lastAssistantReply: string;
  apiError: string | null;
  onClose: () => void;
  onChangeLanguage: (lang: SpeechLanguage) => void;
  onSendVoiceMessage: (transcript: string) => Promise<{
    messageId: string;
    content: string;
  } | null>;
  onSpeakReply: (
    messageId: string,
    text: string,
    onEnd?: () => void
  ) => boolean;
  onPauseSpeech: () => void;
  onResumeSpeech: () => void;
  onStopSpeech: () => void;
}

export default function VoiceChatOverlay({
  open,
  language,
  voiceEnabled,
  isGenerating,
  speechStatus,
  lastUserTranscript,
  lastAssistantReply,
  apiError,
  onClose,
  onChangeLanguage,
  onSendVoiceMessage,
  onSpeakReply,
  onPauseSpeech,
  onResumeSpeech,
  onStopSpeech,
}: VoiceChatOverlayProps) {
  const [autoContinue, setAutoContinue] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const isSendingRef = useRef(false);
  const openRef = useRef(open);
  const autoContinueRef = useRef(autoContinue);
  const prevLanguageRef = useRef(language);
  const autoListenTimerRef = useRef<number | null>(null);

  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    autoContinueRef.current = autoContinue;
  }, [autoContinue]);

  const clearAutoListenTimer = () => {
    if (autoListenTimerRef.current !== null) {
      window.clearTimeout(autoListenTimerRef.current);
      autoListenTimerRef.current = null;
    }
  };

  const handleFinalVoiceTranscript = async (transcript: string) => {
    const cleaned = transcript.trim();
    if (!cleaned || isSendingRef.current || !openRef.current) return;

    isSendingRef.current = true;
    setLocalError(null);
    stopListening();

    try {
      const result = await onSendVoiceMessage(cleaned);
      if (!openRef.current) return;

      if (result && result.content) {
        if (voiceEnabled) {
          const startedSpeech = onSpeakReply(
            result.messageId,
            result.content,
            () => {
              if (openRef.current && autoContinueRef.current && !isSendingRef.current) {
                autoListenTimerRef.current = window.setTimeout(() => {
                  if (openRef.current && autoContinueRef.current) {
                    startListening();
                  }
                }, 250);
              }
            }
          );
          if (!startedSpeech && autoContinueRef.current) {
            autoListenTimerRef.current = window.setTimeout(() => {
              if (openRef.current && autoContinueRef.current) {
                startListening();
              }
            }, 600);
          }
        } else if (autoContinueRef.current) {
          autoListenTimerRef.current = window.setTimeout(() => {
            if (openRef.current && autoContinueRef.current) {
              startListening();
            }
          }, 600);
        }
      }
    } catch {
      setLocalError("Could not complete the voice message. Tap microphone to retry.");
    } finally {
      isSendingRef.current = false;
    }
  };

  const {
    isSupported,
    isListening,
    isRequestingPermission,
    interimText,
    error: recognitionError,
    errorKind,
    clearError,
    startListening,
    stopListening,
    abortListening,
  } = useSpeechRecognition({
    language,
    continuous: false,
    onFinalTranscript: (transcript) => {
      void handleFinalVoiceTranscript(transcript);
    },
  });

  useEffect(() => {
    if (!open) {
      clearAutoListenTimer();
      abortListening();
      return;
    }
    setLocalError(null);
    isSendingRef.current = false;
    // Slight delay lets any active ChatInput recognition release mic hardware cleanly
    const startTimer = window.setTimeout(() => {
      if (openRef.current) {
        void startListening();
      }
    }, 90);

    return () => {
      window.clearTimeout(startTimer);
      clearAutoListenTimer();
      abortListening();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Restart listening cleanly when switching language inside Voice Chat
  useEffect(() => {
    if (!open) {
      prevLanguageRef.current = language;
      return;
    }
    if (prevLanguageRef.current !== language) {
      prevLanguageRef.current = language;
      if (isListening && !isGenerating) {
        abortListening();
        window.setTimeout(() => {
          if (openRef.current) startListening();
        }, 80);
      }
    }
  }, [abortListening, isGenerating, isListening, language, open, startListening]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        clearAutoListenTimer();
        abortListening();
        onStopSpeech();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [abortListening, onClose, onStopSpeech, open]);

  if (!open) return null;

  const handleClose = () => {
    clearAutoListenTimer();
    abortListening();
    onStopSpeech();
    onClose();
  };

  const handlePrimaryAction = () => {
    setLocalError(null);
    clearError();
    clearAutoListenTimer();
    if (isRequestingPermission) return;

    if (speechStatus === "speaking" || speechStatus === "paused") {
      onStopSpeech();
      void startListening();
      return;
    }

    if (isListening) {
      stopListening();
      return;
    }

    if (!isGenerating) {
      void startListening();
    }
  };

  const displayError = localError || recognitionError || apiError;

  const stateLabel = isGenerating
    ? "QUEEN AI is thinking..."
    : isRequestingPermission
      ? "Requesting microphone access..."
      : speechStatus === "speaking"
        ? "Speaking response..."
        : speechStatus === "paused"
          ? "Speech paused"
          : isListening
            ? "Listening..."
            : "Tap microphone to speak";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0D0814]/75 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="voice-chat-title"
    >
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#150E22] border border-purple-200 dark:border-purple-900/60 shadow-2xl overflow-hidden flex flex-col">
        {/* Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-200/80 dark:border-purple-900/50">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-purple-700 to-pink-600 border border-amber-300/60">
              <QueenCrownLogo size="sm" />
            </div>
            <div>
              <h2
                id="voice-chat-title"
                className="text-sm font-semibold text-slate-900 dark:text-purple-50"
              >
                QUEEN AI — Live Voice Chat
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <label htmlFor="live-voice-lang" className="sr-only">
              Voice language
            </label>
            <select
              id="live-voice-lang"
              value={language}
              disabled={isGenerating}
              onChange={(e) =>
                onChangeLanguage(e.target.value as SpeechLanguage)
              }
              className="h-8 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50/70 dark:bg-[#1B122C] px-2.5 text-xs font-medium text-slate-800 dark:text-purple-100 focus:outline-none focus:border-purple-600"
            >
              {SPEECH_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg p-1.5 text-purple-400 hover:text-purple-800 dark:hover:text-purple-100 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
              aria-label="Close voice chat"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Center Visualizer */}
        <div className="px-6 py-8 flex flex-col items-center text-center">
          <div className="relative flex items-center justify-center my-2">
            {isListening && (
              <>
                <span className="absolute h-28 w-28 rounded-full bg-pink-500/20 animate-ping" />
                <span className="absolute h-24 w-24 rounded-full bg-purple-500/20 animate-pulse" />
              </>
            )}

            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={!isSupported || isGenerating || isRequestingPermission}
              aria-label={
                isRequestingPermission
                  ? "Requesting microphone permission"
                  : isListening
                    ? "Stop listening"
                    : speechStatus === "speaking"
                      ? "Interrupt and speak"
                      : "Start speaking"
              }
              className={`touch-manipulation relative z-10 flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-purple-600 ${
                !isSupported
                  ? "bg-purple-100 dark:bg-purple-950 text-purple-300 cursor-not-allowed"
                  : isListening
                    ? "bg-gradient-to-br from-pink-600 to-rose-600 hover:from-pink-700 hover:to-rose-700 text-white"
                    : isGenerating || isRequestingPermission
                      ? "bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-amber-300 cursor-wait"
                      : "bg-gradient-to-br from-purple-700 via-fuchsia-600 to-pink-600 hover:from-purple-800 hover:to-pink-700 text-white border border-amber-300/40"
              }`}
            >
              {isGenerating || isRequestingPermission ? (
                <Loader2 className="h-8 w-8 animate-spin" />
              ) : !isSupported ? (
                <MicOff className="h-8 w-8" />
              ) : isListening ? (
                <Square className="h-7 w-7 fill-current" />
              ) : (
                <Mic className="h-8 w-8" />
              )}
            </button>
          </div>

          {/* Animated Wave Bars while listening or speaking */}
          <div className="mt-5 h-7 flex items-center justify-center gap-1.5">
            {isListening || speechStatus === "speaking" ? (
              [0, 1, 2, 3, 4, 5, 6].map((bar) => (
                <span
                  key={bar}
                  className={`w-1 rounded-full ${
                    isListening
                      ? "bg-gradient-to-t from-purple-600 to-pink-500 dark:from-pink-400 dark:to-amber-300"
                      : "bg-gradient-to-t from-amber-500 to-purple-600 dark:from-amber-300 dark:to-pink-400"
                  } animate-pulse`}
                  style={{
                    height: `${10 + ((bar * 7) % 18)}px`,
                    animationDelay: `${bar * 110}ms`,
                    animationDuration: "700ms",
                  }}
                />
              ))
            ) : (
              <span className="text-xs text-slate-500 dark:text-purple-300/60">
                {voiceEnabled
                  ? "Speak naturally — QUEEN AI responds aloud automatically"
                  : "Voice output is muted in Settings"}
              </span>
            )}
          </div>

          <p className="mt-2 text-sm font-medium text-slate-900 dark:text-purple-50">
            {stateLabel}
          </p>

          {/* Live Transcript / Last Turn Preview */}
          {(interimText || lastUserTranscript || lastAssistantReply) && (
            <div className="mt-5 w-full rounded-2xl border border-purple-200/80 dark:border-purple-900/60 bg-purple-50/60 dark:bg-[#1B122C] p-4 text-left space-y-2.5 max-h-44 overflow-y-auto">
              {(interimText || lastUserTranscript) && (
                <div>
                  <span className="text-[11px] font-medium text-purple-600 dark:text-purple-300">
                    You
                  </span>
                  <p className="text-sm text-slate-900 dark:text-purple-50 leading-relaxed">
                    {interimText || lastUserTranscript}
                  </p>
                </div>
              )}

              {lastAssistantReply && !interimText && (
                <div className="pt-2 border-t border-purple-200/70 dark:border-purple-800/70">
                  <span className="text-[11px] font-medium text-pink-600 dark:text-amber-300">
                    QUEEN AI
                  </span>
                  <p className="text-sm text-slate-700 dark:text-purple-100/90 leading-relaxed line-clamp-4">
                    {lastAssistantReply}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error Alert */}
          {displayError && (
            <div className="mt-4 w-full flex flex-col gap-2 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 p-3 text-left text-xs text-red-700 dark:text-red-300">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{displayError}</span>
              </div>
              {recognitionError &&
                (errorKind === "permission" ||
                  errorKind === "policy" ||
                  errorKind === "no-device" ||
                  errorKind === "busy") && (
                  <div className="flex flex-wrap items-center gap-2 pl-6">
                    {(errorKind === "permission" ||
                      errorKind === "no-device" ||
                      errorKind === "busy") && (
                      <button
                        type="button"
                        onClick={() => void startListening()}
                        disabled={isRequestingPermission}
                        className="inline-flex items-center gap-1 rounded-md bg-red-600 hover:bg-red-700 text-white px-2.5 py-1 text-[11px] font-medium transition-colors disabled:opacity-50"
                      >
                        {errorKind === "permission" ? (
                          <Mic className="h-3 w-3" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        <span>
                          {isRequestingPermission
                            ? "Checking..."
                            : errorKind === "permission"
                              ? "Allow Microphone"
                              : "Retry Mic Check"}
                        </span>
                      </button>
                    )}
                    {(errorKind === "policy" ||
                      (errorKind === "permission" && isEmbeddedIframe())) &&
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
            </div>
          )}
        </div>

        {/* Bottom Playback & Auto-Continue Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 bg-purple-50/70 dark:bg-[#120A1E] border-t border-purple-200/80 dark:border-purple-900/50">
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-purple-200 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoContinue}
              onChange={(e) => setAutoContinue(e.target.checked)}
              className="h-4 w-4 rounded border-purple-300 text-purple-700 focus:ring-purple-600"
            />
            <span>Auto-listen after reply</span>
          </label>

          <div className="flex items-center gap-2">
            {speechStatus === "speaking" && (
              <button
                type="button"
                onClick={onPauseSpeech}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800 text-xs font-medium text-slate-700 dark:text-purple-100 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
              >
                <Pause className="h-3.5 w-3.5" />
                <span>Pause</span>
              </button>
            )}
            {speechStatus === "paused" && (
              <button
                type="button"
                onClick={onResumeSpeech}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800 text-xs font-medium text-slate-700 dark:text-purple-100 hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
              >
                <Play className="h-3.5 w-3.5" />
                <span>Resume</span>
              </button>
            )}
            {(speechStatus === "speaking" || speechStatus === "paused") && (
              <button
                type="button"
                onClick={onStopSpeech}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop Speech</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-purple-700 to-pink-600 hover:from-purple-800 hover:to-pink-700 text-white text-xs font-medium transition-colors"
            >
              End Voice Chat
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
