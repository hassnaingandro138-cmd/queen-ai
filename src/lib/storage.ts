import {
  ChatMessage,
  ChatSettings,
  Conversation,
  GeminiModelId,
} from "../types/chat";

const CONVERSATIONS_KEY = "queen_ai_conversations_v1";
const ACTIVE_CHAT_ID_KEY = "queen_ai_active_chat_id_v1";
const SETTINGS_KEY = "queen_ai_settings_v1";
const THEME_KEY = "queen_ai_theme";

export const DEFAULT_SETTINGS: ChatSettings = {
  theme: "light",
  defaultModel: "gemini-3.1-flash-lite",
  systemInstruction: "",
  voice: {
    voiceEnabled: true,
    autoSpeak: false,
    language: "en-US",
    voiceURI: "",
    rate: 1.0,
  },
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function deriveTitleFromPrompt(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "New conversation";
  const firstLine = cleaned.split(/[\n.!?]/)[0]?.trim() || cleaned;
  if (firstLine.length <= 44) return firstLine;
  return `${firstLine.slice(0, 41).trimEnd()}...`;
}

// READ: Load all saved conversations sorted by most recently updated
export function loadConversations(): Conversation[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c): c is Conversation =>
          Boolean(c && typeof c.id === "string" && Array.isArray(c.messages))
      )
      .sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch {
    // Handle storage quota silently without crashing the UI
  }
}

export function loadActiveChatId(): string | null {
  if (!isBrowser()) return null;
  try {
    return window.localStorage.getItem(ACTIVE_CHAT_ID_KEY);
  } catch {
    return null;
  }
}

export function saveActiveChatId(id: string | null): void {
  if (!isBrowser()) return;
  try {
    if (id) {
      window.localStorage.setItem(ACTIVE_CHAT_ID_KEY, id);
    } else {
      window.localStorage.removeItem(ACTIVE_CHAT_ID_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

// CREATE: Create a new conversation object
export function createConversation(
  model: GeminiModelId = "gemini-3.1-flash-lite",
  title = "New conversation"
): Conversation {
  const now = new Date().toISOString();
  return {
    id: generateId(),
    title,
    model,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

// CREATE / UPDATE helper: Upsert a conversation into storage
export function upsertConversation(
  conversations: Conversation[],
  updated: Conversation
): Conversation[] {
  const exists = conversations.some((c) => c.id === updated.id);
  const next = exists
    ? conversations.map((c) => (c.id === updated.id ? updated : c))
    : [updated, ...conversations];
  const sorted = [...next].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
  saveConversations(sorted);
  return sorted;
}

// UPDATE: Update a conversation's title
export function renameConversationInList(
  conversations: Conversation[],
  id: string,
  newTitle: string
): Conversation[] {
  const trimmed = newTitle.trim();
  if (!trimmed) return conversations;
  const now = new Date().toISOString();
  const next = conversations.map((c) =>
    c.id === id ? { ...c, title: trimmed, updatedAt: now } : c
  );
  saveConversations(next);
  return next;
}

// UPDATE: Update messages in a conversation
export function updateConversationMessages(
  conversations: Conversation[],
  id: string,
  messages: ChatMessage[],
  titleOverride?: string
): Conversation[] {
  const now = new Date().toISOString();
  const next = conversations
    .map((c) =>
      c.id === id
        ? {
            ...c,
            messages,
            title: titleOverride ?? c.title,
            updatedAt: now,
          }
        : c
    )
    .sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  saveConversations(next);
  return next;
}

// DELETE: Remove a single conversation
export function deleteConversationById(
  conversations: Conversation[],
  id: string
): Conversation[] {
  const next = conversations.filter((c) => c.id !== id);
  saveConversations(next);
  return next;
}

// DELETE: Clear all conversation history
export function clearAllConversations(): Conversation[] {
  if (isBrowser()) {
    try {
      window.localStorage.removeItem(CONVERSATIONS_KEY);
      window.localStorage.removeItem(ACTIVE_CHAT_ID_KEY);
    } catch {
      // Ignore storage errors
    }
  }
  return [];
}

// Settings persistence
export function loadSettings(): ChatSettings {
  if (!isBrowser()) return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    const savedTheme = window.localStorage.getItem(THEME_KEY);
    const prefersDark =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;

    const resolvedTheme =
      savedTheme === "dark" || savedTheme === "light"
        ? savedTheme
        : prefersDark
          ? "dark"
          : "light";

    if (!raw) {
      return { ...DEFAULT_SETTINGS, theme: resolvedTheme };
    }
    const parsed = JSON.parse(raw);
    const rawVoice = parsed.voice && typeof parsed.voice === "object" ? parsed.voice : {};
    const parsedRate =
      typeof rawVoice.rate === "number" && Number.isFinite(rawVoice.rate)
        ? Math.min(1.75, Math.max(0.75, rawVoice.rate))
        : DEFAULT_SETTINGS.voice.rate;

    return {
      theme:
        parsed.theme === "dark" || parsed.theme === "light"
          ? parsed.theme
          : resolvedTheme,
      defaultModel:
        parsed.defaultModel === "gemini-4-hydrogen"
          ? "gemini-4-hydrogen"
          : "gemini-3.1-flash-lite",
      systemInstruction:
        typeof parsed.systemInstruction === "string" ? parsed.systemInstruction : "",
      voice: {
        voiceEnabled:
          typeof rawVoice.voiceEnabled === "boolean"
            ? rawVoice.voiceEnabled
            : DEFAULT_SETTINGS.voice.voiceEnabled,
        autoSpeak:
          typeof rawVoice.autoSpeak === "boolean"
            ? rawVoice.autoSpeak
            : DEFAULT_SETTINGS.voice.autoSpeak,
        language: rawVoice.language === "ur-PK" ? "ur-PK" : "en-US",
        voiceURI: typeof rawVoice.voiceURI === "string" ? rawVoice.voiceURI : "",
        rate: parsedRate,
      },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ChatSettings): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    window.localStorage.setItem(THEME_KEY, settings.theme);
  } catch {
    // Ignore storage errors
  }
}
