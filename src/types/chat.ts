export type MessageRole = "user" | "model";

export type GeminiModelId = "gemini-4-hydrogen" | "gemini-3.1-flash-lite";

export type ThemeMode = "light" | "dark";

export type SpeechLanguage = "en-US" | "ur-PK";

export type MicrophonePermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "unsupported"
  | "unknown";

export interface VoiceSettings {
  voiceEnabled: boolean;
  autoSpeak: boolean;
  language: SpeechLanguage;
  voiceURI: string;
  rate: number;
}

export type AllowedImageMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface ChatImage {
  id: string;
  name: string;
  mimeType: AllowedImageMimeType;
  dataUrl: string;
  sizeBytes: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  images?: ChatImage[];
  timestamp: string;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: GeminiModelId;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatSettings {
  theme: ThemeMode;
  defaultModel: GeminiModelId;
  systemInstruction: string;
  voice: VoiceSettings;
}

export interface LanguageOption {
  code: SpeechLanguage;
  label: string;
  shortLabel: string;
}

export const SPEECH_LANGUAGES: LanguageOption[] = [
  { code: "en-US", label: "English (US)", shortLabel: "EN" },
  { code: "ur-PK", label: "Urdu (Pakistan)", shortLabel: "UR" },
];

export interface ModelOption {
  id: GeminiModelId;
  name: string;
  description: string;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini Flash Lite",
    description: "Fast, reliable free-tier responses for everyday chat and coding",
  },
  {
    id: "gemini-4-hydrogen",
    name: "Gemini 4 Flash",
    description: "Balanced intelligence for reasoning, drafting, and analysis",
  },
];
