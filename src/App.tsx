import { useCallback, useEffect, useRef, useState } from "react";
import ChatWindow from "./components/ChatWindow";
import ConfirmDialog from "./components/ConfirmDialog";
import SettingsModal from "./components/SettingsModal";
import Sidebar from "./components/Sidebar";
import VoiceChatOverlay from "./components/VoiceChatOverlay";
import { useSpeechSynthesis } from "./hooks/useSpeechSynthesis";
import { ChatApiError, streamGeminiChat } from "./lib/gemini";
import { MAX_IMAGES_PER_MESSAGE } from "./lib/images";
import {
  clearAllConversations,
  createConversation,
  deleteConversationById,
  deriveTitleFromPrompt,
  generateId,
  loadActiveChatId,
  loadConversations,
  loadSettings,
  renameConversationInList,
  saveActiveChatId,
  saveSettings,
  updateConversationMessages,
  upsertConversation,
} from "./lib/storage";
import {
  ChatImage,
  ChatMessage,
  ChatSettings,
  Conversation,
  GeminiModelId,
  SpeechLanguage,
} from "./types/chat";

type PendingConfirm =
  | { type: "delete_chat"; conversation: Conversation }
  | { type: "clear_chat"; chatId: string }
  | { type: "clear_all" }
  | null;

export default function App() {
  const [settings, setSettings] = useState<ChatSettings>(() => loadSettings());
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations()
  );
  const [activeChatId, setActiveChatId] = useState<string | null>(() => {
    const savedId = loadActiveChatId();
    const list = loadConversations();
    if (savedId && list.some((c) => c.id === savedId)) {
      return savedId;
    }
    return list[0]?.id ?? null;
  });

  const [inputValue, setInputValue] = useState("");
  const [attachedImages, setAttachedImages] = useState<ChatImage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpenDesktop, setIsSidebarOpenDesktop] = useState(true);
  const [isSidebarOpenMobile, setIsSidebarOpenMobile] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isVoiceChatOpen, setIsVoiceChatOpen] = useState(false);
  const [voiceLastUserText, setVoiceLastUserText] = useState("");
  const [voiceLastAssistantText, setVoiceLastAssistantText] = useState("");
  const [voiceApiError, setVoiceApiError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const conversationsRef = useRef(conversations);
  const activeChatIdRef = useRef(activeChatId);
  const settingsRef = useRef(settings);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const {
    voices,
    status: speechStatus,
    speakingMessageId,
    error: speechSynthesisError,
    clearError: clearSpeechSynthesisError,
    speak,
    pause: pauseSpeech,
    resume: resumeSpeech,
    stop: stopSpeech,
  } = useSpeechSynthesis({
    language: settings.voice.language,
    voiceURI: settings.voice.voiceURI,
    rate: settings.voice.rate,
    enabled: settings.voice.voiceEnabled,
  });

  // Sync theme class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    saveSettings(settings);
  }, [settings]);

  // Persist active chat id
  useEffect(() => {
    saveActiveChatId(activeChatId);
  }, [activeChatId]);

  const activeConversation =
    conversations.find((c) => c.id === activeChatId) ?? null;

  const activeModel: GeminiModelId =
    activeConversation?.model ?? settings.defaultModel;

  const handleUpdateSettings = (next: ChatSettings) => {
    setSettings(next);
    saveSettings(next);
  };

  const handleToggleTheme = () => {
    setSettings((prev) => ({
      ...prev,
      theme: prev.theme === "dark" ? "light" : "dark",
    }));
  };

  const handleChangeSpeechLanguage = (language: SpeechLanguage) => {
    setSettings((prev) => ({
      ...prev,
      voice: { ...prev.voice, language, voiceURI: "" },
    }));
  };

  const handleAddImages = (newImages: ChatImage[]) => {
    setAttachedImages((prev) =>
      [...prev, ...newImages].slice(0, MAX_IMAGES_PER_MESSAGE)
    );
  };

  const handleReplaceImage = (imageId: string, replacement: ChatImage) => {
    setAttachedImages((prev) =>
      prev.map((img) => (img.id === imageId ? replacement : img))
    );
  };

  const handleRemoveImage = (imageId: string) => {
    setAttachedImages((prev) => prev.filter((img) => img.id !== imageId));
  };

  const handleNewChat = useCallback(() => {
    if (isLoading) {
      abortControllerRef.current?.abort();
      setIsLoading(false);
    }
    stopSpeech();
    const fresh = createConversation(settings.defaultModel);
    setConversations((prev) => upsertConversation(prev, fresh));
    setActiveChatId(fresh.id);
    setInputValue("");
    setAttachedImages([]);
  }, [isLoading, settings.defaultModel, stopSpeech]);

  const handleSelectChat = (id: string) => {
    if (isLoading) {
      abortControllerRef.current?.abort();
      setIsLoading(false);
    }
    stopSpeech();
    setActiveChatId(id);
    setAttachedImages([]);
  };

  const handleChangeModel = (model: GeminiModelId) => {
    if (activeConversation) {
      const updated: Conversation = {
        ...activeConversation,
        model,
        updatedAt: new Date().toISOString(),
      };
      setConversations((prev) => upsertConversation(prev, updated));
    }
    setSettings((prev) => ({ ...prev, defaultModel: model }));
  };

  const handleRenameChat = (id: string, newTitle: string) => {
    setConversations((prev) => renameConversationInList(prev, id, newTitle));
  };

  const runAssistantTurn = async (
    targetChatId: string,
    historyMessages: ChatMessage[],
    modelToUse: GeminiModelId,
    titleOverride?: string,
    options?: { skipAutoSpeak?: boolean }
  ): Promise<{ messageId: string; content: string } | null> => {
    const assistantMsgId = generateId();
    const placeholderAssistant: ChatMessage = {
      id: assistantMsgId,
      role: "model",
      content: "",
      timestamp: new Date().toISOString(),
    };

    const messagesWithPlaceholder = [...historyMessages, placeholderAssistant];
    setConversations((prev) =>
      updateConversationMessages(
        prev,
        targetChatId,
        messagesWithPlaceholder,
        titleOverride
      )
    );

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);

    try {
      const finalText = await streamGeminiChat({
        messages: historyMessages.filter((m) => !m.error),
        model: modelToUse,
        systemInstruction: settingsRef.current.systemInstruction,
        signal: controller.signal,
        onChunk: (partialText) => {
          setConversations((prev) =>
            updateConversationMessages(
              prev,
              targetChatId,
              historyMessages.concat({
                ...placeholderAssistant,
                content: partialText,
              }),
              titleOverride
            )
          );
        },
      });

      const resolvedContent =
        finalText.trim().length > 0
          ? finalText
          : "I received an empty response. Please try asking again.";

      setConversations((prev) =>
        updateConversationMessages(
          prev,
          targetChatId,
          historyMessages.concat({
            ...placeholderAssistant,
            content: resolvedContent,
            timestamp: new Date().toISOString(),
          }),
          titleOverride
        )
      );

      if (
        !options?.skipAutoSpeak &&
        settingsRef.current.voice.voiceEnabled &&
        settingsRef.current.voice.autoSpeak
      ) {
        speak(assistantMsgId, resolvedContent);
      }

      return { messageId: assistantMsgId, content: resolvedContent };
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setConversations((prev) => {
          const current = prev.find((c) => c.id === targetChatId);
          if (!current) return prev;
          const lastMsg = current.messages[current.messages.length - 1];
          if (lastMsg && lastMsg.id === assistantMsgId && !lastMsg.content) {
            return updateConversationMessages(
              prev,
              targetChatId,
              current.messages.slice(0, -1),
              titleOverride
            );
          }
          return prev;
        });
        return null;
      }

      const message =
        err instanceof ChatApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Something went wrong while communicating with Gemini.";

      setConversations((prev) =>
        updateConversationMessages(
          prev,
          targetChatId,
          historyMessages.concat({
            ...placeholderAssistant,
            content: "",
            error: message,
            timestamp: new Date().toISOString(),
          }),
          titleOverride
        )
      );

      if (options?.skipAutoSpeak) {
        setVoiceApiError(message);
      }

      return null;
    } finally {
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (overrideText?: string) => {
    const text = (overrideText ?? inputValue).trim();
    const imagesToSend = overrideText ? [] : attachedImages;

    if ((!text && imagesToSend.length === 0) || isLoading) return;

    if (!overrideText) {
      setInputValue("");
      setAttachedImages([]);
    }
    stopSpeech();

    const fallbackTitle =
      text ||
      (imagesToSend[0]
        ? `Image: ${imagesToSend[0].name}`
        : "Image analysis");

    let targetChat = activeConversation;
    let currentList = conversations;

    if (!targetChat) {
      targetChat = createConversation(
        settings.defaultModel,
        deriveTitleFromPrompt(fallbackTitle)
      );
      currentList = upsertConversation(currentList, targetChat);
      setConversations(currentList);
      setActiveChatId(targetChat.id);
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text,
      ...(imagesToSend.length > 0 ? { images: imagesToSend } : {}),
      timestamp: new Date().toISOString(),
    };

    const cleanedExisting = targetChat.messages.filter((m) => !m.error);
    const nextHistory = [...cleanedExisting, userMessage];

    const shouldUpdateTitle =
      cleanedExisting.length === 0 || targetChat.title === "New conversation";
    const nextTitle = shouldUpdateTitle
      ? deriveTitleFromPrompt(fallbackTitle)
      : targetChat.title;

    await runAssistantTurn(
      targetChat.id,
      nextHistory,
      targetChat.model,
      nextTitle
    );
  };

  const handleSendVoiceChatMessage = async (
    transcript: string
  ): Promise<{ messageId: string; content: string } | null> => {
    const text = transcript.trim();
    if (!text) return null;

    setVoiceApiError(null);
    setVoiceLastUserText(text);

    const currentConv =
      conversationsRef.current.find((c) => c.id === activeChatIdRef.current) ??
      null;

    let targetChat = currentConv;
    if (!targetChat) {
      targetChat = createConversation(
        settingsRef.current.defaultModel,
        deriveTitleFromPrompt(text)
      );
      const nextList = upsertConversation(conversationsRef.current, targetChat);
      setConversations(nextList);
      setActiveChatId(targetChat.id);
    }

    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };

    const cleanedExisting = targetChat.messages.filter((m) => !m.error);
    const nextHistory = [...cleanedExisting, userMessage];
    const shouldUpdateTitle =
      cleanedExisting.length === 0 || targetChat.title === "New conversation";
    const nextTitle = shouldUpdateTitle
      ? deriveTitleFromPrompt(text)
      : targetChat.title;

    const result = await runAssistantTurn(
      targetChat.id,
      nextHistory,
      targetChat.model,
      nextTitle,
      { skipAutoSpeak: true }
    );

    if (result) {
      setVoiceLastAssistantText(result.content);
    }
    return result;
  };

  const handleStopGenerating = () => {
    abortControllerRef.current?.abort();
  };

  const handleRegenerateResponse = async () => {
    if (!activeConversation || isLoading) return;
    stopSpeech();
    const msgs = [...activeConversation.messages];

    while (msgs.length > 0 && msgs[msgs.length - 1].role === "model") {
      msgs.pop();
    }
    if (msgs.length === 0) return;

    await runAssistantTurn(
      activeConversation.id,
      msgs,
      activeConversation.model
    );
  };

  const handleEditUserMessage = async (
    messageId: string,
    updatedContent: string
  ) => {
    if (!activeConversation || isLoading) return;
    stopSpeech();
    const idx = activeConversation.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return;

    const prior = activeConversation.messages.slice(0, idx);
    const updatedUserMsg: ChatMessage = {
      ...activeConversation.messages[idx],
      content: updatedContent,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...prior, updatedUserMsg];
    const nextTitle =
      idx === 0
        ? deriveTitleFromPrompt(
            updatedContent ||
              updatedUserMsg.images?.[0]?.name ||
              "Image analysis"
          )
        : activeConversation.title;

    await runAssistantTurn(
      activeConversation.id,
      nextHistory,
      activeConversation.model,
      nextTitle
    );
  };

  const handleConfirmAction = () => {
    if (!pendingConfirm) return;
    stopSpeech();

    if (pendingConfirm.type === "delete_chat") {
      const targetId = pendingConfirm.conversation.id;
      const nextList = deleteConversationById(conversations, targetId);
      setConversations(nextList);
      if (activeChatId === targetId) {
        setActiveChatId(nextList[0]?.id ?? null);
      }
    } else if (pendingConfirm.type === "clear_chat") {
      const targetId = pendingConfirm.chatId;
      setConversations((prev) =>
        updateConversationMessages(prev, targetId, [], "New conversation")
      );
    } else if (pendingConfirm.type === "clear_all") {
      const next = clearAllConversations();
      setConversations(next);
      setActiveChatId(null);
    }

    setPendingConfirm(null);
  };

  const confirmCopy = (() => {
    if (!pendingConfirm) {
      return { title: "", description: "", confirmLabel: "Confirm" };
    }
    if (pendingConfirm.type === "delete_chat") {
      return {
        title: "Delete conversation?",
        description: `"${pendingConfirm.conversation.title}" and all of its messages will be permanently removed from this browser.`,
        confirmLabel: "Delete Chat",
      };
    }
    if (pendingConfirm.type === "clear_chat") {
      return {
        title: "Clear this chat?",
        description:
          "All messages in this conversation will be cleared. This action cannot be undone.",
        confirmLabel: "Clear Chat",
      };
    }
    return {
      title: "Clear all chat history?",
      description:
        "Every saved conversation in this browser will be permanently deleted. This action cannot be undone.",
      confirmLabel: "Clear All History",
    };
  })();

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-[#FDFBFF] dark:bg-[#0D0814] text-slate-900 dark:text-purple-50">
      <Sidebar
        conversations={conversations}
        activeChatId={activeChatId}
        isOpenDesktop={isSidebarOpenDesktop}
        isOpenMobile={isSidebarOpenMobile}
        onCloseMobile={() => setIsSidebarOpenMobile(false)}
        onToggleDesktop={() => setIsSidebarOpenDesktop((v) => !v)}
        onNewChat={handleNewChat}
        onSelectChat={handleSelectChat}
        onRenameChat={handleRenameChat}
        onRequestDeleteChat={(conversation) =>
          setPendingConfirm({ type: "delete_chat", conversation })
        }
        onOpenSettings={() => setIsSettingsOpen(true)}
        onRequestClearAll={() => setPendingConfirm({ type: "clear_all" })}
      />

      <ChatWindow
        conversation={activeConversation}
        activeModel={activeModel}
        theme={settings.theme}
        inputValue={inputValue}
        attachedImages={attachedImages}
        isLoading={isLoading}
        isVoiceChatOpen={isVoiceChatOpen}
        isSidebarOpenDesktop={isSidebarOpenDesktop}
        voiceEnabled={settings.voice.voiceEnabled}
        speechLanguage={settings.voice.language}
        speakingMessageId={speakingMessageId}
        speechStatus={speechStatus}
        speechSynthesisError={speechSynthesisError}
        onDismissSpeechSynthesisError={clearSpeechSynthesisError}
        onToggleDesktopSidebar={() => setIsSidebarOpenDesktop((v) => !v)}
        onOpenMobileSidebar={() => setIsSidebarOpenMobile(true)}
        onOpenVoiceChat={() => {
          stopSpeech();
          setVoiceLastUserText("");
          setVoiceLastAssistantText("");
          setVoiceApiError(null);
          setIsVoiceChatOpen(true);
        }}
        onChangeModel={handleChangeModel}
        onToggleTheme={handleToggleTheme}
        onRequestClearChat={() => {
          if (activeConversation) {
            setPendingConfirm({
              type: "clear_chat",
              chatId: activeConversation.id,
            });
          }
        }}
        onInputChange={setInputValue}
        onAddImages={handleAddImages}
        onReplaceImage={handleReplaceImage}
        onRemoveImage={handleRemoveImage}
        onChangeSpeechLanguage={handleChangeSpeechLanguage}
        onSendMessage={handleSendMessage}
        onStopGenerating={handleStopGenerating}
        onRegenerateResponse={handleRegenerateResponse}
        onEditUserMessage={handleEditUserMessage}
        onRetryFailed={handleRegenerateResponse}
        onSpeakMessage={(messageId, content) => speak(messageId, content)}
        onPauseSpeech={pauseSpeech}
        onResumeSpeech={resumeSpeech}
        onStopSpeech={stopSpeech}
      />

      <VoiceChatOverlay
        open={isVoiceChatOpen}
        language={settings.voice.language}
        voiceEnabled={settings.voice.voiceEnabled}
        isGenerating={isLoading}
        speechStatus={speechStatus}
        lastUserTranscript={voiceLastUserText}
        lastAssistantReply={voiceLastAssistantText}
        apiError={voiceApiError}
        onClose={() => setIsVoiceChatOpen(false)}
        onChangeLanguage={handleChangeSpeechLanguage}
        onSendVoiceMessage={handleSendVoiceChatMessage}
        onSpeakReply={(messageId, text, onEnd) =>
          speak(messageId, text, { onEnd })
        }
        onPauseSpeech={pauseSpeech}
        onResumeSpeech={resumeSpeech}
        onStopSpeech={stopSpeech}
      />

      <SettingsModal
        open={isSettingsOpen}
        settings={settings}
        conversations={conversations}
        voices={voices}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
        onRequestClearAll={() => setPendingConfirm({ type: "clear_all" })}
      />

      <ConfirmDialog
        open={pendingConfirm !== null}
        title={confirmCopy.title}
        description={confirmCopy.description}
        confirmLabel={confirmCopy.confirmLabel}
        destructive
        onConfirm={handleConfirmAction}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}
