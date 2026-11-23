import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkMicrophonePermission,
  getSpeechRecognitionConstructor,
  isLikelyWebKitSafari,
  isMicrophoneAllowedByPolicy,
  isSpeechRecognitionSupported,
  mapSpeechRecognitionError,
  MicrophoneFailureReason,
  observeMicrophonePermission,
  requestMicrophonePermission,
  SpeechRecognitionInstance,
} from "../lib/voice";
import { MicrophonePermissionState, SpeechLanguage } from "../types/chat";

export type SpeechErrorKind = MicrophoneFailureReason | null;

interface UseSpeechRecognitionOptions {
  language: SpeechLanguage;
  continuous?: boolean;
  onFinalTranscript?: (transcript: string) => void;
  onInterimTranscript?: (transcript: string) => void;
}

export function useSpeechRecognition({
  language,
  continuous = false,
  onFinalTranscript,
  onInterimTranscript,
}: UseSpeechRecognitionOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isRequestingPermission, setIsRequestingPermission] = useState(false);
  const [permissionState, setPermissionState] =
    useState<MicrophonePermissionState>("unknown");
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<SpeechErrorKind>(null);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const sessionIdRef = useRef(0);
  const manualStopRef = useRef(false);
  const processedFinalIndicesRef = useRef<Set<number>>(new Set());
  const lastFinalChunkRef = useRef("");
  const latestInterimRef = useRef("");
  const permissionStateRef = useRef<MicrophonePermissionState>("unknown");

  const onFinalRef = useRef(onFinalTranscript);
  const onInterimRef = useRef(onInterimTranscript);

  useEffect(() => {
    onFinalRef.current = onFinalTranscript;
  }, [onFinalTranscript]);

  useEffect(() => {
    onInterimRef.current = onInterimTranscript;
  }, [onInterimTranscript]);

  useEffect(() => {
    return observeMicrophonePermission((nextState) => {
      permissionStateRef.current = nextState;
      setPermissionState(nextState);
    });
  }, []);

  const isSupported = isSpeechRecognitionSupported();

  const cleanupInstance = useCallback((rec: SpeechRecognitionInstance | null) => {
    if (!rec) return;
    rec.onstart = null;
    rec.onresult = null;
    rec.onerror = null;
    rec.onend = null;
    try {
      rec.abort();
    } catch {
      // Ignore already-stopped instances
    }
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setErrorKind(null);
  }, []);

  const stopListening = useCallback(() => {
    manualStopRef.current = true;
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        cleanupInstance(rec);
        recognitionRef.current = null;
      }
    }
    setIsListening(false);
    setIsRequestingPermission(false);
    setInterimText("");
    latestInterimRef.current = "";
  }, [cleanupInstance]);

  const abortListening = useCallback(() => {
    sessionIdRef.current += 1;
    manualStopRef.current = true;
    cleanupInstance(recognitionRef.current);
    recognitionRef.current = null;
    setIsListening(false);
    setIsRequestingPermission(false);
    setInterimText("");
    latestInterimRef.current = "";
  }, [cleanupInstance]);

  const startRecognitionInstance = useCallback(
    (currentSessionId: number): boolean => {
      const RecognitionCtor = getSpeechRecognitionConstructor();
      if (!RecognitionCtor) {
        setError(
          "Voice-to-text is not supported in this browser. Please use Chrome, Edge, or Safari."
        );
        setErrorKind("unsupported");
        return false;
      }

      manualStopRef.current = false;
      const recognition = new RecognitionCtor();
      recognition.lang = language;
      recognition.continuous = continuous;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        if (sessionIdRef.current !== currentSessionId) return;
        permissionStateRef.current = "granted";
        setPermissionState("granted");
        setIsListening(true);
        setError(null);
        setErrorKind(null);
      };

      recognition.onresult = (event) => {
        if (sessionIdRef.current !== currentSessionId) return;

        let interim = "";
        let newlyFinalized = "";

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = (result?.[0]?.transcript ?? "").trim();
          if (!transcript) continue;

          if (result.isFinal) {
            if (processedFinalIndicesRef.current.has(i)) {
              continue;
            }
            processedFinalIndicesRef.current.add(i);

            if (transcript === lastFinalChunkRef.current && !continuous) {
              continue;
            }
            lastFinalChunkRef.current = transcript;
            newlyFinalized = newlyFinalized
              ? `${newlyFinalized} ${transcript}`
              : transcript;
          } else {
            interim = interim ? `${interim} ${transcript}` : transcript;
          }
        }

        if (newlyFinalized) {
          setFinalText(newlyFinalized);
          setInterimText("");
          latestInterimRef.current = "";
          onInterimRef.current?.("");
          onFinalRef.current?.(newlyFinalized);
        } else {
          setInterimText(interim);
          latestInterimRef.current = interim;
          onInterimRef.current?.(interim);
        }
      };

      recognition.onerror = (event) => {
        if (sessionIdRef.current !== currentSessionId) return;
        if (
          manualStopRef.current &&
          (event.error === "aborted" || event.error === "no-speech")
        ) {
          setIsListening(false);
          setInterimText("");
          return;
        }

        if (event.error === "not-allowed") {
          void checkMicrophonePermission().then((state) => {
            permissionStateRef.current = state;
            setPermissionState(state);
          });
          setErrorKind(isMicrophoneAllowedByPolicy() ? "permission" : "policy");
        } else if (event.error === "service-not-allowed") {
          setErrorKind("permission");
        } else if (event.error === "audio-capture") {
          setErrorKind("no-device");
        } else {
          setErrorKind("other");
        }

        const mapped = mapSpeechRecognitionError(event.error);
        if (mapped) {
          setError(mapped);
        }
        setIsListening(false);
        setInterimText("");
        latestInterimRef.current = "";
      };

      recognition.onend = () => {
        if (sessionIdRef.current !== currentSessionId) return;
        const leftoverInterim = latestInterimRef.current.trim();
        if (manualStopRef.current && leftoverInterim) {
          latestInterimRef.current = "";
          setInterimText("");
          setFinalText(leftoverInterim);
          onInterimRef.current?.("");
          onFinalRef.current?.(leftoverInterim);
        } else {
          setInterimText("");
          latestInterimRef.current = "";
          onInterimRef.current?.("");
        }
        setIsListening(false);
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;

      try {
        recognition.start();
        setIsListening(true);
        return true;
      } catch (err) {
        recognitionRef.current = null;
        setIsListening(false);
        const name = err instanceof Error ? err.name : "";
        if (name === "NotAllowedError") {
          if (permissionStateRef.current === "granted") {
            setError(
              "Microphone permission is ready! Tap the microphone button once more to begin speaking."
            );
            setErrorKind("other");
          } else {
            setError(mapSpeechRecognitionError("not-allowed"));
            setErrorKind(isMicrophoneAllowedByPolicy() ? "permission" : "policy");
          }
        } else {
          setError(
            "Could not start voice recognition. Check microphone access and try again."
          );
          setErrorKind("other");
        }
        return false;
      }
    },
    [continuous, language]
  );

  const requestPermissionOnly = useCallback(async (): Promise<boolean> => {
    setError(null);
    setErrorKind(null);
    setIsRequestingPermission(true);
    try {
      const result = await requestMicrophonePermission();
      permissionStateRef.current = result.state;
      setPermissionState(result.state);
      if (!result.granted) {
        setError(
          result.error ||
            "Microphone access was denied. Please enable microphone permission in browser settings."
        );
        setErrorKind(
          result.reason ?? (result.blockedByPolicy ? "policy" : "permission")
        );
        return false;
      }
      return true;
    } finally {
      setIsRequestingPermission(false);
    }
  }, []);

  const startListening = useCallback(async (): Promise<boolean> => {
    setError(null);
    setErrorKind(null);
    setInterimText("");
    setFinalText("");
    latestInterimRef.current = "";
    lastFinalChunkRef.current = "";
    processedFinalIndicesRef.current.clear();

    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(
        "Microphone access requires a secure HTTPS connection (or localhost)."
      );
      setErrorKind("unsupported");
      return false;
    }

    if (!isMicrophoneAllowedByPolicy()) {
      permissionStateRef.current = "denied";
      setPermissionState("denied");
      setError(
        "Microphone access is blocked by this embedded frame's permissions policy. Open QUEEN AI in a new browser tab to use voice input."
      );
      setErrorKind("policy");
      return false;
    }

    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) {
      setError(
        "Voice-to-text requires Chrome, Edge, or Safari. Your current browser does not expose SpeechRecognition."
      );
      setErrorKind("unsupported");
      return false;
    }

    sessionIdRef.current += 1;
    const currentSessionId = sessionIdRef.current;
    cleanupInstance(recognitionRef.current);
    recognitionRef.current = null;

    // Fast synchronous path if permission is already granted OR on Safari/WebKit
    // where user gesture activation must remain synchronous for SpeechRecognition.start()
    if (
      permissionStateRef.current === "granted" ||
      (isLikelyWebKitSafari() && permissionStateRef.current !== "denied")
    ) {
      return startRecognitionInstance(currentSessionId);
    }

    // Request microphone access explicitly via MediaDevices.getUserMedia()
    // when permission is "prompt", "unknown", or retrying after "denied"
    setIsRequestingPermission(true);
    let permResult;
    try {
      permResult = await requestMicrophonePermission();
    } finally {
      setIsRequestingPermission(false);
    }

    if (sessionIdRef.current !== currentSessionId) {
      return false;
    }

    permissionStateRef.current = permResult.state;
    setPermissionState(permResult.state);

    if (!permResult.granted) {
      setError(
        permResult.error ||
          "Microphone access was denied. Allow microphone permission in browser settings and try again."
      );
      setErrorKind(
        permResult.reason ??
          (permResult.blockedByPolicy
            ? "policy"
            : permResult.state === "unsupported"
              ? "unsupported"
              : "permission")
      );
      return false;
    }

    // Allow hardware drivers on desktop/mobile a brief tick to release the
    // temporary getUserMedia capture track before SpeechRecognition opens audio.
    await new Promise((resolve) => window.setTimeout(resolve, 80));

    if (sessionIdRef.current !== currentSessionId) {
      return false;
    }

    return startRecognitionInstance(currentSessionId);
  }, [cleanupInstance, startRecognitionInstance]);

  useEffect(() => {
    return () => {
      sessionIdRef.current += 1;
      cleanupInstance(recognitionRef.current);
      recognitionRef.current = null;
    };
  }, [cleanupInstance]);

  return {
    isSupported,
    isListening,
    isRequestingPermission,
    permissionState,
    interimText,
    finalText,
    error,
    errorKind,
    clearError,
    requestPermissionOnly,
    startListening,
    stopListening,
    abortListening,
  };
}
