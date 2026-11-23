import { useCallback, useEffect, useRef, useState } from "react";
import {
  isSpeechSynthesisSupported,
  splitTextForSpeech,
  stripMarkdownForSpeech,
} from "../lib/voice";
import { SpeechLanguage } from "../types/chat";

export type SpeechStatus = "idle" | "speaking" | "paused";

interface UseSpeechSynthesisOptions {
  language: SpeechLanguage;
  voiceURI: string;
  rate: number;
  enabled: boolean;
}

export function useSpeechSynthesis({
  language,
  voiceURI,
  rate,
  enabled,
}: UseSpeechSynthesisOptions) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const isSupported = isSpeechSynthesisSupported();

  const sessionTokenRef = useRef(0);
  const pendingTimerRef = useRef<number | null>(null);
  const activeUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const onCompleteCallbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isSupported) return;

    const loadVoices = () => {
      const available = window.speechSynthesis.getVoices();
      if (available.length > 0) {
        setVoices(available);
      }
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
    };
  }, [isSupported]);

  const clearPendingTimer = useCallback(() => {
    if (pendingTimerRef.current !== null) {
      window.clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    sessionTokenRef.current += 1;
    clearPendingTimer();
    onCompleteCallbackRef.current = null;
    activeUtteranceRef.current = null;
    if (isSupported) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore browser cancel errors
      }
    }
    setStatus("idle");
    setSpeakingMessageId(null);
  }, [clearPendingTimer, isSupported]);

  const pause = useCallback(() => {
    if (!isSupported) return;
    try {
      if (window.speechSynthesis.speaking && !window.speechSynthesis.paused) {
        window.speechSynthesis.pause();
        setStatus("paused");
      }
    } catch {
      // Ignore
    }
  }, [isSupported]);

  const resume = useCallback(() => {
    if (!isSupported) return;
    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        setStatus("speaking");
      }
    } catch {
      // Ignore
    }
  }, [isSupported]);

  const resolveVoice = useCallback(
    (targetLang: SpeechLanguage, preferredURI: string): SpeechSynthesisVoice | null => {
      const availableVoices =
        voices.length > 0
          ? voices
          : isSupported
            ? window.speechSynthesis.getVoices()
            : [];
      if (availableVoices.length === 0) return null;

      if (preferredURI) {
        const exact = availableVoices.find((v) => v.voiceURI === preferredURI);
        if (exact) return exact;
      }

      const langPrefix = targetLang.split("-")[0].toLowerCase();
      return (
        availableVoices.find(
          (v) => v.lang.toLowerCase() === targetLang.toLowerCase()
        ) ||
        availableVoices.find((v) =>
          v.lang.toLowerCase().startsWith(langPrefix)
        ) ||
        availableVoices.find((v) => v.default) ||
        availableVoices[0] ||
        null
      );
    },
    [isSupported, voices]
  );

  const speak = useCallback(
    (
      messageId: string,
      rawText: string,
      options?: {
        languageOverride?: SpeechLanguage;
        onEnd?: () => void;
      }
    ): boolean => {
      setError(null);
      if (!enabled) {
        setError("Voice output is currently disabled in Settings.");
        return false;
      }
      if (!isSupported) {
        setError("Text-to-speech is not supported in this browser.");
        return false;
      }

      const plainText = stripMarkdownForSpeech(rawText);
      const chunks = splitTextForSpeech(plainText, 160);
      if (chunks.length === 0) {
        options?.onEnd?.();
        return false;
      }

      sessionTokenRef.current += 1;
      clearPendingTimer();
      const currentToken = sessionTokenRef.current;
      onCompleteCallbackRef.current = options?.onEnd ?? null;

      const wasActive =
        window.speechSynthesis.speaking ||
        window.speechSynthesis.pending ||
        window.speechSynthesis.paused;

      try {
        window.speechSynthesis.cancel();
        // Reset stuck pause state in Chromium
        if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      } catch {
        // Ignore
      }

      const targetLang = options?.languageOverride ?? language;
      const selectedVoice = resolveVoice(targetLang, voiceURI);

      setSpeakingMessageId(messageId);
      setStatus("speaking");

      const speakChunkAt = (index: number) => {
        if (sessionTokenRef.current !== currentToken) return;

        if (index >= chunks.length) {
          activeUtteranceRef.current = null;
          setStatus("idle");
          setSpeakingMessageId(null);
          const cb = onCompleteCallbackRef.current;
          onCompleteCallbackRef.current = null;
          cb?.();
          return;
        }

        const utterance = new SpeechSynthesisUtterance(chunks[index]);
        utterance.lang = targetLang;
        utterance.rate = Math.min(2, Math.max(0.5, rate));
        if (selectedVoice) {
          utterance.voice = selectedVoice;
        }

        // Hold strong reference to avoid premature Chromium GC dropping onend
        activeUtteranceRef.current = utterance;

        utterance.onend = () => {
          if (sessionTokenRef.current !== currentToken) return;
          speakChunkAt(index + 1);
        };

        utterance.onerror = (event) => {
          if (sessionTokenRef.current !== currentToken) return;
          if (event.error === "interrupted" || event.error === "canceled") {
            return;
          }
          activeUtteranceRef.current = null;
          setError("Speech playback encountered an error in this browser.");
          setStatus("idle");
          setSpeakingMessageId(null);
          onCompleteCallbackRef.current = null;
        };

        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          activeUtteranceRef.current = null;
          setError("Unable to start speech playback.");
          setStatus("idle");
          setSpeakingMessageId(null);
          onCompleteCallbackRef.current = null;
        }
      };

      // Chrome silently drops speak() if called in the same tick after cancel()
      if (wasActive) {
        pendingTimerRef.current = window.setTimeout(() => {
          pendingTimerRef.current = null;
          speakChunkAt(0);
        }, 60);
      } else {
        speakChunkAt(0);
      }

      return true;
    },
    [clearPendingTimer, enabled, isSupported, language, rate, resolveVoice, voiceURI]
  );

  useEffect(() => {
    return () => {
      sessionTokenRef.current += 1;
      clearPendingTimer();
      activeUtteranceRef.current = null;
      if (isSupported) {
        try {
          window.speechSynthesis.cancel();
        } catch {
          // Ignore
        }
      }
    };
  }, [clearPendingTimer, isSupported]);

  return {
    isSupported,
    voices,
    status,
    speakingMessageId,
    error,
    clearError: () => setError(null),
    speak,
    pause,
    resume,
    stop,
  };
}
