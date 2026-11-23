import { useEffect, useRef, useState, DragEvent } from "react";
import {
  AlertCircle,
  ArrowDown,
  AudioLines,
  Eraser,
  ImagePlus,
  Menu,
  Moon,
  PanelLeftOpen,
  Sun,
  X,
} from "lucide-react";
import { SpeechStatus } from "../hooks/useSpeechSynthesis";
import { processImageFiles } from "../lib/images";
import {
  ChatImage,
  Conversation,
  GeminiModelId,
  MODEL_OPTIONS,
  SpeechLanguage,
  ThemeMode,
} from "../types/chat";
import ChatInput from "./ChatInput";
import MessageBubble from "./MessageBubble";
import QueenCrownLogo from "./QueenCrownLogo";
import WelcomeScreen from "./WelcomeScreen";

interface ChatWindowProps {
  conversation: Conversation | null;
  activeModel: GeminiModelId;
  theme: ThemeMode;
  inputValue: string;
  attachedImages: ChatImage[];
  isLoading: boolean;
  isVoiceChatOpen?: boolean;
  isSidebarOpenDesktop: boolean;
  voiceEnabled: boolean;
  speechLanguage: SpeechLanguage;
  speakingMessageId: string | null;
  speechStatus: SpeechStatus;
  speechSynthesisError?: string | null;
  onDismissSpeechSynthesisError?: () => void;
  onToggleDesktopSidebar: () => void;
  onOpenMobileSidebar: () => void;
  onOpenVoiceChat: () => void;
  onChangeModel: (model: GeminiModelId) => void;
  onToggleTheme: () => void;
  onRequestClearChat: () => void;
  onInputChange: (val: string) => void;
  onAddImages: (images: ChatImage[]) => void;
  onReplaceImage: (imageId: string, replacement: ChatImage) => void;
  onRemoveImage: (imageId: string) => void;
  onChangeSpeechLanguage: (lang: SpeechLanguage) => void;
  onSendMessage: (overrideText?: string) => void;
  onStopGenerating: () => void;
  onRegenerateResponse: () => void;
  onEditUserMessage: (messageId: string, updatedContent: string) => void;
  onRetryFailed: () => void;
  onSpeakMessage: (messageId: string, content: string) => void;
  onPauseSpeech: () => void;
  onResumeSpeech: () => void;
  onStopSpeech: () => void;
}

export default function ChatWindow({
  conversation,
  activeModel,
  theme,
  inputValue,
  attachedImages,
  isLoading,
  isVoiceChatOpen = false,
  isSidebarOpenDesktop,
  voiceEnabled,
  speechLanguage,
  speakingMessageId,
  speechStatus,
  speechSynthesisError,
  onDismissSpeechSynthesisError,
  onToggleDesktopSidebar,
  onOpenMobileSidebar,
  onOpenVoiceChat,
  onChangeModel,
  onToggleTheme,
  onRequestClearChat,
  onInputChange,
  onAddImages,
  onReplaceImage,
  onRemoveImage,
  onChangeSpeechLanguage,
  onSendMessage,
  onStopGenerating,
  onRegenerateResponse,
  onEditUserMessage,
  onRetryFailed,
  onSpeakMessage,
  onPauseSpeech,
  onResumeSpeech,
  onStopSpeech,
}: ChatWindowProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const [windowImageErrors, setWindowImageErrors] = useState<string[]>([]);

  const messages = conversation?.messages ?? [];
  const hasMessages = messages.length > 0;

  const latestModelMsgId = [...messages]
    .reverse()
    .find((m) => m.role === "model" && !m.error)?.id;

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomAnchorRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 140) {
      scrollToBottom("auto");
    }
  }, [messages.length, messages[messages.length - 1]?.content]);

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollBottom(distanceFromBottom > 160);
  };

  const handleWindowDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isLoading) return;
    if (e.dataTransfer?.types?.includes("Files")) {
      dragDepthRef.current += 1;
      setIsWindowDragging(true);
    }
  };

  const handleWindowDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleWindowDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsWindowDragging(false);
    }
  };

  const handleWindowDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepthRef.current = 0;
    setIsWindowDragging(false);
    if (isLoading) return;
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      setWindowImageErrors([]);
      const result = await processImageFiles(
        e.dataTransfer.files,
        attachedImages.length
      );
      if (result.images.length > 0) {
        onAddImages(result.images);
      }
      if (result.errors.length > 0) {
        setWindowImageErrors(result.errors);
      }
    }
  };

  return (
    <div
      onDragEnter={handleWindowDragEnter}
      onDragOver={handleWindowDragOver}
      onDragLeave={handleWindowDragLeave}
      onDrop={handleWindowDrop}
      className="relative flex-1 flex flex-col min-w-0 h-dvh bg-[#FDFBFF] dark:bg-[#0D0814]"
    >
      {/* Drag-and-drop full-pane overlay */}
      {isWindowDragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-white/85 dark:bg-[#0D0814]/85 backdrop-blur-xs border-2 border-dashed border-pink-500 dark:border-amber-400 m-3 rounded-2xl">
          <div className="flex flex-col items-center text-center px-6">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-700/10 dark:bg-purple-500/20 text-purple-700 dark:text-pink-300">
              <ImagePlus className="h-6 w-6" />
            </div>
            <p className="text-base font-semibold text-slate-900 dark:text-purple-50">
              Drop images to attach
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-purple-300/70">
              Supports JPG, JPEG, PNG, and WEBP (up to 4 images)
            </p>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="shrink-0 flex items-center justify-between gap-4 px-4 sm:px-6 py-3 border-b border-purple-200/80 dark:border-purple-900/50 bg-white/95 dark:bg-[#0D0814]/95 backdrop-blur-xs">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileSidebar}
            className="flex lg:hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-purple-700 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>

          {!isSidebarOpenDesktop && (
            <button
              type="button"
              onClick={onToggleDesktopSidebar}
              className="hidden lg:flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-purple-700 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors"
              aria-label="Expand sidebar"
              title="Expand sidebar"
            >
              <PanelLeftOpen className="h-5 w-5" />
            </button>
          )}

          <div className="flex items-center gap-2 min-w-0">
            <QueenCrownLogo size="sm" className="shrink-0" />
            <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-purple-50 truncate">
              {conversation?.title && conversation.title !== "New conversation"
                ? conversation.title
                : "QUEEN AI"}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {/* Dedicated Voice Chat Mode Button */}
          <button
            type="button"
            onClick={onOpenVoiceChat}
            className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg bg-gradient-to-r from-purple-600/10 to-pink-600/10 hover:from-purple-600/20 hover:to-pink-600/20 dark:from-purple-500/20 dark:to-pink-500/20 dark:hover:from-purple-500/30 dark:hover:to-pink-500/30 border border-purple-300/70 dark:border-pink-500/35 text-xs sm:text-sm font-medium text-purple-800 dark:text-pink-200 transition-colors whitespace-nowrap shrink-0"
            title="Start Live Voice Chat"
            aria-label="Start Live Voice Chat"
          >
            <AudioLines className="h-4 w-4 text-pink-600 dark:text-amber-300" />
            <span className="hidden sm:inline">Voice Chat</span>
          </button>

          {/* Model Selector */}
          <label htmlFor="model-select" className="sr-only">
            Select Gemini model
          </label>
          <select
            id="model-select"
            value={activeModel}
            disabled={isLoading}
            onChange={(e) => onChangeModel(e.target.value as GeminiModelId)}
            className="h-9 rounded-lg border border-purple-200 dark:border-purple-900/60 bg-purple-50/70 dark:bg-[#160E24] px-2.5 text-xs sm:text-sm font-medium text-slate-800 dark:text-purple-100 focus:outline-none focus:border-purple-600 dark:focus:border-pink-500 disabled:opacity-50 cursor-pointer"
          >
            {MODEL_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>

          {hasMessages && (
            <button
              type="button"
              onClick={onRequestClearChat}
              disabled={isLoading}
              className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-purple-200 dark:border-purple-900/60 text-xs sm:text-sm font-medium text-slate-700 dark:text-purple-100 hover:bg-purple-100/70 dark:hover:bg-purple-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
              title="Clear current chat"
            >
              <Eraser className="h-4 w-4" />
              <span className="hidden md:inline">Clear Chat</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleTheme}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-purple-200 dark:border-purple-900/60 text-purple-700 dark:text-amber-300 hover:bg-purple-100/70 dark:hover:bg-purple-900/40 transition-colors"
            aria-label={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
            title={
              theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
            }
          >
            {theme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      {/* Messages Viewport */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="relative flex-1 overflow-y-auto"
      >
        {!hasMessages ? (
          <div className="min-h-full flex flex-col">
            <WelcomeScreen onSelectPrompt={(prompt) => onSendMessage(prompt)} />
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
            {messages.map((msg, idx) => {
              const isLast = idx === messages.length - 1;
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isStreaming={isLoading && isLast && msg.role === "model"}
                  isLatestModelMessage={msg.id === latestModelMsgId}
                  isBusy={isLoading}
                  voiceEnabled={voiceEnabled}
                  speakingMessageId={speakingMessageId}
                  speechStatus={speechStatus}
                  onSpeakMessage={onSpeakMessage}
                  onPauseSpeech={onPauseSpeech}
                  onResumeSpeech={onResumeSpeech}
                  onStopSpeech={onStopSpeech}
                  onRegenerate={onRegenerateResponse}
                  onEditUserMessage={onEditUserMessage}
                  onRetryFailed={onRetryFailed}
                />
              );
            })}
            <div ref={bottomAnchorRef} className="h-2" />
          </div>
        )}

        {showScrollBottom && hasMessages && (
          <div className="sticky bottom-4 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={() => scrollToBottom("smooth")}
              aria-label="Scroll to latest message"
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-purple-200 dark:border-purple-800 bg-white dark:bg-[#191128] text-purple-700 dark:text-pink-300 shadow-md hover:bg-purple-50 dark:hover:bg-purple-900/50 transition-colors"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {speechSynthesisError && (
        <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 pt-2">
          <div
            role="status"
            className="flex items-center justify-between gap-2 rounded-xl border border-amber-300/70 dark:border-amber-700/60 bg-amber-50/90 dark:bg-amber-950/35 px-3 py-2 text-xs text-amber-900 dark:text-amber-200"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{speechSynthesisError}</span>
            </div>
            {onDismissSpeechSynthesisError && (
              <button
                type="button"
                onClick={onDismissSpeechSynthesisError}
                className="p-0.5 rounded hover:bg-amber-200/60 dark:hover:bg-amber-900/50"
                aria-label="Dismiss voice playback error"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Message Composer */}
      <ChatInput
        value={inputValue}
        attachedImages={attachedImages}
        externalImageErrors={windowImageErrors}
        isLoading={isLoading}
        isVoiceChatOpen={isVoiceChatOpen}
        speechLanguage={speechLanguage}
        onChange={onInputChange}
        onAddImages={onAddImages}
        onReplaceImage={onReplaceImage}
        onRemoveImage={onRemoveImage}
        onClearExternalImageErrors={() => setWindowImageErrors([])}
        onChangeSpeechLanguage={onChangeSpeechLanguage}
        onSend={() => onSendMessage()}
        onStop={onStopGenerating}
      />
    </div>
  );
}
