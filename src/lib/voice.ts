import { MicrophonePermissionState } from "../types/chat";

export interface SpeechRecognitionConstructor {
  new (): SpeechRecognitionInstance;
}

export interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

export interface SpeechRecognitionResultItem {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}

export interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResultItem;
}

export interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

export interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => unknown) | null;
  onresult:
    | ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => unknown)
    | null;
  onerror:
    | ((
        this: SpeechRecognitionInstance,
        ev: SpeechRecognitionErrorEvent
      ) => unknown)
    | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => unknown) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type MicrophoneFailureReason =
  | "permission"
  | "policy"
  | "no-device"
  | "busy"
  | "unsupported"
  | "other";

export interface MicrophonePermissionResult {
  granted: boolean;
  state: MicrophonePermissionState;
  blockedByPolicy?: boolean;
  reason?: MicrophoneFailureReason;
  detectedDevices?: number | null;
  error?: string;
}

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    typeof SpeechSynthesisUtterance !== "undefined"
  );
}

export function isEmbeddedIframe(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function isMicrophoneAllowedByPolicy(): boolean {
  if (typeof document === "undefined") return true;
  try {
    const docWithPolicy = document as Document & {
      permissionsPolicy?: { allowsFeature?: (feature: string) => boolean };
      featurePolicy?: { allowsFeature?: (feature: string) => boolean };
    };
    const policy = docWithPolicy.permissionsPolicy || docWithPolicy.featurePolicy;
    if (policy && typeof policy.allowsFeature === "function") {
      return policy.allowsFeature("microphone");
    }
  } catch {
    // Ignore unsupported policy API errors
  }
  return true;
}

export function isLikelyWebKitSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isSafariEngine = /Safari/i.test(ua);
  const isChromiumOrOther = /Chrome|CriOS|Chromium|Edg|EdgiOS|EdgA|OPR|Firefox|FxiOS|SamsungBrowser/i.test(
    ua
  );
  return isSafariEngine && !isChromiumOrOther;
}

function getLegacyUserMedia():
  | ((
      constraints: MediaStreamConstraints,
      success: (stream: MediaStream) => void,
      error: (err: unknown) => void
    ) => void)
  | null {
  if (typeof navigator === "undefined") return null;
  const nav = navigator as Navigator & {
    webkitGetUserMedia?: (
      constraints: MediaStreamConstraints,
      success: (stream: MediaStream) => void,
      error: (err: unknown) => void
    ) => void;
    mozGetUserMedia?: (
      constraints: MediaStreamConstraints,
      success: (stream: MediaStream) => void,
      error: (err: unknown) => void
    ) => void;
    getUserMedia?: (
      constraints: MediaStreamConstraints,
      success: (stream: MediaStream) => void,
      error: (err: unknown) => void
    ) => void;
  };
  return nav.webkitGetUserMedia || nav.mozGetUserMedia || nav.getUserMedia || null;
}

export function isGetUserMediaSupported(): boolean {
  if (typeof navigator === "undefined") return false;
  if (
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  ) {
    return true;
  }
  return getLegacyUserMedia() !== null;
}

export async function countAudioInputDevices(): Promise<number | null> {
  if (
    typeof navigator === "undefined" ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== "function"
  ) {
    return null;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput").length;
  } catch {
    return null;
  }
}

async function acquireAudioStream(): Promise<MediaStream> {
  if (
    typeof navigator !== "undefined" &&
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getUserMedia === "function"
  ) {
    try {
      return await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (primaryErr) {
      const errName =
        primaryErr instanceof DOMException
          ? primaryErr.name
          : primaryErr && typeof primaryErr === "object" && "name" in primaryErr
            ? String((primaryErr as { name: unknown }).name)
            : "";

      if (
        (errName === "NotFoundError" ||
          errName === "DevicesNotFoundError" ||
          errName === "OverconstrainedError") &&
        typeof navigator.mediaDevices.enumerateDevices === "function"
      ) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioInputs = devices.filter(
            (d) => d.kind === "audioinput" && d.deviceId
          );
          for (const device of audioInputs) {
            try {
              return await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: { exact: device.deviceId } },
              });
            } catch {
              // Try next audio input device
            }
          }
        } catch {
          // Ignore enumerateDevices errors and fall back to primary error
        }
      }

      throw primaryErr;
    }
  }

  const legacyFn = getLegacyUserMedia();
  if (legacyFn) {
    return new Promise<MediaStream>((resolve, reject) => {
      legacyFn.call(navigator, { audio: true }, resolve, reject);
    });
  }

  throw new DOMException(
    "MediaDevices.getUserMedia is not available in this browser.",
    "NotSupportedError"
  );
}

export function mapSpeechRecognitionError(errorCode: string): string {
  switch (errorCode) {
    case "not-allowed":
      if (typeof window !== "undefined" && !window.isSecureContext) {
        return "Microphone access requires a secure HTTPS connection (or localhost).";
      }
      if (!isMicrophoneAllowedByPolicy()) {
        return "Microphone access is blocked by this embedded frame's permissions policy. Open QUEEN AI in a new browser tab to use voice input.";
      }
      return isEmbeddedIframe()
        ? "Microphone access was denied. Click the lock/tune icon in your address bar to allow Microphone, or open QUEEN AI in a new tab."
        : "Microphone access was denied. Click the lock/tune icon in your browser's address bar, allow Microphone access, and try again.";
    case "service-not-allowed":
      return "Speech recognition service is blocked by browser privacy settings or device dictation settings. Enable dictation/speech service in Chrome, Edge, or Safari and try again.";
    case "audio-capture":
      return "No working microphone was detected. Please connect or enable a microphone and try again.";
    case "no-speech":
      return "No speech was detected. Please speak clearly closer to your microphone and try again.";
    case "network":
      return "Voice recognition requires an active internet connection in this browser.";
    case "language-not-supported":
      return "The selected voice language is not supported by your browser's speech recognizer.";
    case "aborted":
      return "";
    default:
      return "Voice recognition could not start. Please check microphone access and try again.";
  }
}

export async function checkMicrophonePermission(): Promise<MicrophonePermissionState> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return "unsupported";
  }

  if (!isMicrophoneAllowedByPolicy()) {
    return "denied";
  }

  if (!isGetUserMediaSupported()) {
    return "unsupported";
  }

  try {
    if (navigator.permissions && typeof navigator.permissions.query === "function") {
      const status = await navigator.permissions.query({
        name: "microphone" as PermissionName,
      });
      if (
        status.state === "granted" ||
        status.state === "denied" ||
        status.state === "prompt"
      ) {
        return status.state;
      }
    }
  } catch {
    // Some browsers (Safari/Firefox) throw on permissions.query({ name: 'microphone' })
  }

  return "unknown";
}

export function observeMicrophonePermission(
  onChange: (state: MicrophonePermissionState) => void
): () => void {
  let cancelled = false;
  let permStatus: PermissionStatus | null = null;

  const init = async () => {
    const initial = await checkMicrophonePermission();
    if (!cancelled) {
      onChange(initial);
    }

    if (
      typeof navigator !== "undefined" &&
      navigator.permissions &&
      typeof navigator.permissions.query === "function"
    ) {
      try {
        const status = await navigator.permissions.query({
          name: "microphone" as PermissionName,
        });
        if (cancelled) return;
        permStatus = status;
        permStatus.onchange = () => {
          if (cancelled) return;
          if (!isMicrophoneAllowedByPolicy()) {
            onChange("denied");
            return;
          }
          if (
            status.state === "granted" ||
            status.state === "denied" ||
            status.state === "prompt"
          ) {
            onChange(status.state);
          }
        };
      } catch {
        // Ignore browsers that do not support microphone Permissions API
      }
    }
  };

  void init();

  return () => {
    cancelled = true;
    if (permStatus) {
      permStatus.onchange = null;
    }
  };
}

export async function requestMicrophonePermission(): Promise<MicrophonePermissionResult> {
  if (typeof window !== "undefined" && !window.isSecureContext) {
    return {
      granted: false,
      state: "unsupported",
      reason: "unsupported",
      error:
        "Microphone access requires a secure HTTPS connection (or localhost).",
    };
  }

  if (!isMicrophoneAllowedByPolicy()) {
    return {
      granted: false,
      state: "denied",
      blockedByPolicy: true,
      reason: "policy",
      error:
        "Microphone access is blocked by this embedded frame's policy. Open QUEEN AI in a new tab to grant microphone permission.",
    };
  }

  if (!isGetUserMediaSupported()) {
    return {
      granted: false,
      state: "unsupported",
      reason: "unsupported",
      error:
        "This browser does not support MediaDevices.getUserMedia() microphone capture.",
    };
  }

  let stream: MediaStream | null = null;
  try {
    stream = await acquireAudioStream();
    return { granted: true, state: "granted" };
  } catch (err) {
    const name =
      err instanceof DOMException
        ? err.name
        : err && typeof err === "object" && "name" in err
          ? String((err as { name: unknown }).name)
          : "";

    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return {
        granted: false,
        state: "denied",
        reason: "permission",
        error: isEmbeddedIframe()
          ? "Microphone access was denied. Allow Microphone in your browser address bar settings, or open QUEEN AI in a new tab."
          : "Microphone access was denied. Click the lock/tune icon in your browser address bar, set Microphone to Allow, and try again.",
      };
    }

    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      const detected = await countAudioInputDevices();
      return {
        granted: false,
        state: "unknown",
        reason: "no-device",
        detectedDevices: detected,
        error:
          "No working microphone was detected on this device. Connect a microphone or headset, enable input in your device Sound & Microphone Privacy settings, and click Retry.",
      };
    }

    if (
      name === "NotReadableError" ||
      name === "TrackStartError" ||
      name === "AbortError"
    ) {
      return {
        granted: false,
        state: "unknown",
        reason: "busy",
        error:
          "Your microphone is busy or unavailable because another application is using it. Close other audio apps and try again.",
      };
    }

    if (name === "SecurityError") {
      return {
        granted: false,
        state: "denied",
        blockedByPolicy: isEmbeddedIframe(),
        reason: isEmbeddedIframe() ? "policy" : "permission",
        error:
          "Microphone access is blocked by browser security settings. Ensure you are on HTTPS and allow microphone access.",
      };
    }

    return {
      granted: false,
      state: "unknown",
      reason: "other",
      error:
        "Could not access the microphone. Check your browser and OS audio permissions.",
    };
  } finally {
    if (stream) {
      stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // Ignore track stop errors
        }
      });
    }
  }
}

export function stripMarkdownForSpeech(markdown: string): string {
  if (!markdown) return "";

  return markdown
    // Replace fenced code blocks with a brief spoken note
    .replace(/```[\w-]*\n[\s\S]*?```/g, " Code block omitted. ")
    // Inline code -> keep inner text
    .replace(/`([^`]+)`/g, "$1")
    // Markdown links [label](url) -> label
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Images ![alt](url) -> alt
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    // Headings, blockquotes, horizontal rules
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/^[-*_]{3,}$/gm, "")
    // Bullet & numbered list prefixes
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    // Bold / italic / strikethrough markers
    .replace(/(\*\*|__|\*|_|~~)/g, "")
    // Table pipes
    .replace(/\|/g, ", ")
    // Collapse excessive whitespace
    .replace(/\n{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

export function splitTextForSpeech(text: string, maxChunkLength = 220): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  if (cleaned.length <= maxChunkLength) return [cleaned];

  const sentences = cleaned.match(/[^.!?؟۔\n]+[.!?؟۔\n]*/g) || [cleaned];
  const chunks: string[] = [];
  let current = "";

  for (const rawSentence of sentences) {
    const sentence = rawSentence.trim();
    if (!sentence) continue;

    if (sentence.length > maxChunkLength) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      const words = sentence.split(/\s+/);
      let piece = "";
      for (const word of words) {
        if ((piece + " " + word).trim().length > maxChunkLength) {
          if (piece) chunks.push(piece.trim());
          piece = word;
        } else {
          piece = (piece + " " + word).trim();
        }
      }
      if (piece) chunks.push(piece.trim());
      continue;
    }

    if ((current + " " + sentence).trim().length > maxChunkLength) {
      if (current) chunks.push(current.trim());
      current = sentence;
    } else {
      current = (current + " " + sentence).trim();
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}
