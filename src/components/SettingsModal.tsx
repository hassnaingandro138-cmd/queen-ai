import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Download,
  ExternalLink,
  Mic,
  Moon,
  Sun,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import {
  countAudioInputDevices,
  isEmbeddedIframe,
  isMicrophoneAllowedByPolicy,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  observeMicrophonePermission,
  requestMicrophonePermission,
} from "../lib/voice";
import {
  ChatSettings,
  Conversation,
  GeminiModelId,
  MicrophonePermissionState,
  MODEL_OPTIONS,
  SPEECH_LANGUAGES,
  SpeechLanguage,
  ThemeMode,
} from "../types/chat";
import QueenCrownLogo from "./QueenCrownLogo";

interface SettingsModalProps {
  open: boolean;
  settings: ChatSettings;
  conversations: Conversation[];
  voices: SpeechSynthesisVoice[];
  onClose: () => void;
  onUpdateSettings: (next: ChatSettings) => void;
  onRequestClearAll: () => void;
}

type SettingsTab = "general" | "voice";

export default function SettingsModal({
  open,
  settings,
  conversations,
  voices,
  onClose,
  onUpdateSettings,
  onRequestClearAll,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [instructionDraft, setInstructionDraft] = useState(
    settings.systemInstruction
  );
  const [micPermission, setMicPermission] =
    useState<MicrophonePermissionState>("unknown");
  const [detectedMicCount, setDetectedMicCount] = useState<number | null>(null);
  const [micCheckMessage, setMicCheckMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setInstructionDraft(settings.systemInstruction);
    setMicCheckMessage(null);
    void countAudioInputDevices().then(setDetectedMicCount);
    return observeMicrophonePermission(setMicPermission);
  }, [open, settings.systemInstruction]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleThemeChange = (theme: ThemeMode) => {
    onUpdateSettings({ ...settings, theme });
  };

  const handleModelChange = (defaultModel: GeminiModelId) => {
    onUpdateSettings({ ...settings, defaultModel });
  };

  const updateVoice = (patch: Partial<ChatSettings["voice"]>) => {
    onUpdateSettings({
      ...settings,
      voice: { ...settings.voice, ...patch },
    });
  };

  const handleSaveAndClose = () => {
    onUpdateSettings({
      ...settings,
      systemInstruction: instructionDraft.trim(),
    });
    onClose();
  };

  const handleExportJson = () => {
    const payload = JSON.stringify(conversations, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `queen-ai-chat-history-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRequestMic = async () => {
    setMicCheckMessage(null);
    const res = await requestMicrophonePermission();
    setMicPermission(res.state);
    void countAudioInputDevices().then(setDetectedMicCount);
    if (res.granted) {
      setMicCheckMessage("Microphone access is granted and ready.");
    } else if (res.error) {
      setMicCheckMessage(res.error);
    }
  };

  const handleTestVoice = () => {
    if (!isSpeechSynthesisSupported()) return;
    const wasActive =
      window.speechSynthesis.speaking ||
      window.speechSynthesis.pending ||
      window.speechSynthesis.paused;
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

    const speakSample = () => {
      const sample =
        settings.voice.language === "ur-PK"
          ? "Assalam-o-Alaikum, main QUEEN AI hoon. Aap ki madad ke liye tayyar hoon."
          : "Hello! I am QUEEN AI, your royal assistant, ready to help.";
      const utterance = new SpeechSynthesisUtterance(sample);
      utterance.lang = settings.voice.language;
      utterance.rate = settings.voice.rate;
      const available =
        voices.length > 0 ? voices : window.speechSynthesis.getVoices();
      if (settings.voice.voiceURI) {
        const match = available.find(
          (v) => v.voiceURI === settings.voice.voiceURI
        );
        if (match) utterance.voice = match;
      }
      window.speechSynthesis.speak(utterance);
    };

    if (wasActive) {
      window.setTimeout(speakSample, 60);
    } else {
      speakSample();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0D0814]/60 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#150E22] border border-purple-200 dark:border-purple-900/60 shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-purple-200/80 dark:border-purple-900/50">
          <div className="flex items-center gap-2">
            <QueenCrownLogo size="sm" />
            <h2
              id="settings-modal-title"
              className="text-base font-semibold text-slate-900 dark:text-purple-50"
            >
              QUEEN AI Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-purple-400 hover:text-purple-800 dark:hover:text-purple-100 hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors focus-visible:outline-2 focus-visible:outline-purple-600"
            aria-label="Close settings"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Segmented Tabs */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-purple-100/70 dark:bg-[#120A1E] border border-purple-200/70 dark:border-purple-900/50">
            <button
              type="button"
              onClick={() => setActiveTab("general")}
              className={`py-1.5 px-3 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === "general"
                  ? "bg-white dark:bg-[#1E1430] text-purple-900 dark:text-purple-50 shadow-sm"
                  : "text-slate-600 dark:text-purple-300/70 hover:text-purple-900 dark:hover:text-purple-100"
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("voice")}
              className={`py-1.5 px-3 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === "voice"
                  ? "bg-white dark:bg-[#1E1430] text-purple-900 dark:text-purple-50 shadow-sm"
                  : "text-slate-600 dark:text-purple-300/70 hover:text-purple-900 dark:hover:text-purple-100"
              }`}
            >
              Voice &amp; Speech
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6 max-h-[68vh] overflow-y-auto">
          {activeTab === "general" ? (
            <>
              {/* Theme */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-purple-50 mb-2">
                  Appearance
                </label>
                <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-purple-100/70 dark:bg-[#120A1E] border border-purple-200/70 dark:border-purple-900/50">
                  <button
                    type="button"
                    onClick={() => handleThemeChange("light")}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      settings.theme === "light"
                        ? "bg-white dark:bg-[#1E1430] text-purple-900 dark:text-purple-50 shadow-sm"
                        : "text-slate-600 dark:text-purple-300/70 hover:text-purple-900 dark:hover:text-purple-100"
                    }`}
                  >
                    <Sun className="h-4 w-4" />
                    <span>Light</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleThemeChange("dark")}
                    className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                      settings.theme === "dark"
                        ? "bg-white dark:bg-[#1E1430] text-purple-900 dark:text-purple-50 shadow-sm"
                        : "text-slate-600 dark:text-purple-300/70 hover:text-purple-900 dark:hover:text-purple-100"
                    }`}
                  >
                    <Moon className="h-4 w-4" />
                    <span>Dark</span>
                  </button>
                </div>
              </div>

              {/* Default Model */}
              <div>
                <label className="block text-sm font-medium text-slate-900 dark:text-purple-50 mb-2">
                  Default Model
                </label>
                <div className="space-y-2">
                  {MODEL_OPTIONS.map((opt) => {
                    const selected = settings.defaultModel === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleModelChange(opt.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-colors ${
                          selected
                            ? "border-purple-600 dark:border-pink-500 bg-purple-50/80 dark:bg-purple-950/40"
                            : "border-purple-200 dark:border-purple-900/60 hover:bg-purple-50/40 dark:hover:bg-purple-900/25"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-purple-50">
                            {opt.name}
                          </span>
                          <span className="text-xs font-mono text-purple-600 dark:text-pink-300">
                            {selected ? "Selected" : "Select"}
                          </span>
                        </div>
                        <p className="mt-0.5 text-xs text-slate-600 dark:text-purple-200/70">
                          {opt.description}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom System Instructions */}
              <div>
                <label
                  htmlFor="system-instructions-input"
                  className="block text-sm font-medium text-slate-900 dark:text-purple-50 mb-1.5"
                >
                  Custom Instructions
                </label>
                <p className="text-xs text-slate-500 dark:text-purple-300/60 mb-2">
                  Optional guidance applied to every response, such as preferred tone, format, or role.
                </p>
                <textarea
                  id="system-instructions-input"
                  rows={3}
                  value={instructionDraft}
                  onChange={(e) => setInstructionDraft(e.target.value)}
                  maxLength={2000}
                  placeholder="Example: Respond concisely with bullet points and TypeScript examples when relevant."
                  className="w-full rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-[#120A1E] px-3.5 py-2.5 text-sm text-slate-900 dark:text-purple-50 placeholder:text-slate-400 dark:placeholder:text-purple-300/40 focus:outline-none focus:border-purple-600 dark:focus:border-pink-500 resize-none"
                />
              </div>

              {/* Data Management */}
              <div className="pt-4 border-t border-purple-200/80 dark:border-purple-900/50">
                <h3 className="text-sm font-medium text-slate-900 dark:text-purple-50 mb-3">
                  Conversation Data
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={handleExportJson}
                    disabled={conversations.length === 0}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-purple-200 dark:border-purple-800 text-slate-700 dark:text-purple-100 hover:bg-purple-50 dark:hover:bg-purple-900/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    <Download className="h-4 w-4" />
                    <span>Export History (JSON)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onRequestClearAll();
                    }}
                    disabled={conversations.length === 0}
                    className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Clear All History</span>
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-purple-300/60 tabular-nums">
                  {conversations.length}{" "}
                  {conversations.length === 1 ? "conversation" : "conversations"}{" "}
                  stored locally in this browser.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* Voice Output Toggles */}
              <div className="space-y-4">
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <div>
                    <span className="block text-sm font-medium text-slate-900 dark:text-purple-50">
                      Enable Voice Output
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-purple-300/60">
                      Show speaker playback controls on AI responses
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.voice.voiceEnabled}
                    onChange={(e) =>
                      updateVoice({ voiceEnabled: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-purple-300 text-purple-700 focus:ring-purple-600"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <div>
                    <span className="block text-sm font-medium text-slate-900 dark:text-purple-50">
                      Automatically Speak AI Responses
                    </span>
                    <span className="block text-xs text-slate-500 dark:text-purple-300/60">
                      Read new AI replies aloud automatically after completion
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    disabled={!settings.voice.voiceEnabled}
                    checked={settings.voice.autoSpeak}
                    onChange={(e) =>
                      updateVoice({ autoSpeak: e.target.checked })
                    }
                    className="h-4 w-4 rounded border-purple-300 text-purple-700 focus:ring-purple-600 disabled:opacity-40"
                  />
                </label>
              </div>

              {/* Language */}
              <div>
                <label
                  htmlFor="voice-lang-select"
                  className="block text-sm font-medium text-slate-900 dark:text-purple-50 mb-1.5"
                >
                  Speech Language
                </label>
                <select
                  id="voice-lang-select"
                  value={settings.voice.language}
                  onChange={(e) =>
                    updateVoice({
                      language: e.target.value as SpeechLanguage,
                      voiceURI: "",
                    })
                  }
                  className="w-full h-10 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-[#120A1E] px-3 text-sm text-slate-900 dark:text-purple-50 focus:outline-none focus:border-purple-600"
                >
                  {SPEECH_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Voice Selection */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="voice-uri-select"
                    className="block text-sm font-medium text-slate-900 dark:text-purple-50"
                  >
                    Voice Selection
                  </label>
                  <button
                    type="button"
                    disabled={
                      !settings.voice.voiceEnabled ||
                      !isSpeechSynthesisSupported()
                    }
                    onClick={handleTestVoice}
                    className="inline-flex items-center gap-1 text-xs font-medium text-purple-700 dark:text-pink-400 hover:underline disabled:opacity-40"
                  >
                    <Volume2 className="h-3.5 w-3.5" />
                    <span>Test Voice</span>
                  </button>
                </div>
                <select
                  id="voice-uri-select"
                  disabled={
                    !settings.voice.voiceEnabled ||
                    !isSpeechSynthesisSupported()
                  }
                  value={settings.voice.voiceURI}
                  onChange={(e) => updateVoice({ voiceURI: e.target.value })}
                  className="w-full h-10 rounded-xl border border-purple-200 dark:border-purple-900/60 bg-purple-50/50 dark:bg-[#120A1E] px-3 text-sm text-slate-900 dark:text-purple-50 focus:outline-none focus:border-purple-600 disabled:opacity-50"
                >
                  <option value="">Auto-select best voice for language</option>
                  {voices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name} ({voice.lang})
                    </option>
                  ))}
                </select>
                {!isSpeechSynthesisSupported() && (
                  <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                    Speech synthesis is not supported in this browser.
                  </p>
                )}
              </div>

              {/* Speaking Speed */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label
                    htmlFor="voice-rate-slider"
                    className="text-sm font-medium text-slate-900 dark:text-purple-50"
                  >
                    Speaking Speed
                  </label>
                  <span className="text-xs font-mono tabular-nums text-purple-700 dark:text-amber-300">
                    {settings.voice.rate.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="voice-rate-slider"
                  type="range"
                  min={0.75}
                  max={1.75}
                  step={0.05}
                  disabled={!settings.voice.voiceEnabled}
                  value={settings.voice.rate}
                  onChange={(e) =>
                    updateVoice({ rate: Number(e.target.value) })
                  }
                  className="w-full accent-purple-700 dark:accent-pink-500 cursor-pointer disabled:opacity-40"
                />
                <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-400 dark:text-purple-300/50 mt-1">
                  <span>0.75x</span>
                  <span>1.00x</span>
                  <span>1.75x</span>
                </div>
              </div>

              {/* Microphone Permission Handling */}
              <div className="pt-4 border-t border-purple-200/80 dark:border-purple-900/50">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-medium text-slate-900 dark:text-purple-50">
                      Microphone Permission
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-purple-300/60 mt-0.5">
                      Status:{" "}
                      <span className="font-medium text-slate-700 dark:text-purple-100 capitalize">
                        {micPermission}
                      </span>
                      {detectedMicCount !== null && (
                        <>
                          {" · "}
                          <span>
                            {detectedMicCount === 0
                              ? "0 microphones detected"
                              : `${detectedMicCount} ${detectedMicCount === 1 ? "microphone" : "microphones"} detected`}
                          </span>
                        </>
                      )}
                      {!isSpeechRecognitionSupported() &&
                        " · Speech recognition unsupported in this browser"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleRequestMic}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-purple-200 dark:border-purple-800 text-xs font-medium text-slate-700 dark:text-purple-100 hover:bg-purple-50 dark:hover:bg-purple-900/40 transition-colors whitespace-nowrap"
                    >
                      <Mic className="h-3.5 w-3.5" />
                      <span>
                        {micPermission === "granted"
                          ? "Check Access"
                          : "Allow Microphone"}
                      </span>
                    </button>
                  </div>
                </div>

                {micCheckMessage && (
                  <div className="mt-2 space-y-2">
                    <p className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-purple-200">
                      {micPermission === "granted" && (
                        <CheckCircle2 className="h-3.5 w-3.5 text-purple-600 dark:text-amber-300 shrink-0" />
                      )}
                      <span>{micCheckMessage}</span>
                    </p>
                    {(micPermission === "denied" ||
                      !isMicrophoneAllowedByPolicy()) &&
                      isEmbeddedIframe() &&
                      typeof window !== "undefined" && (
                        <a
                          href={window.location.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-purple-200 dark:border-purple-800 text-xs font-medium text-purple-700 dark:text-pink-300 hover:bg-purple-50 dark:hover:bg-purple-900/40 transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          <span>Open in New Tab</span>
                        </a>
                      )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-purple-50/70 dark:bg-[#120A1E] border-t border-purple-200/80 dark:border-purple-900/50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded-lg text-slate-700 dark:text-purple-200 hover:bg-purple-200/50 dark:hover:bg-purple-900/40 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveAndClose}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-gradient-to-r from-purple-700 to-pink-600 hover:from-purple-800 hover:to-pink-700 text-white transition-colors"
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
