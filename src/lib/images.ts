import { AllowedImageMimeType, ChatImage } from "../types/chat";
import { generateId } from "./storage";

export const ALLOWED_IMAGE_MIME_TYPES: AllowedImageMimeType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const MAX_IMAGES_PER_MESSAGE = 4;
export const MAX_RAW_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB raw upload limit
const MAX_DIMENSION_PX = 1280;

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function extractBase64FromDataUrl(dataUrl: string): {
  mimeType: string;
  data: string;
} | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl
  );
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function normalizeMimeType(file: File): AllowedImageMimeType | null {
  const type = file.type.toLowerCase();
  if (type === "image/jpg" || type === "image/jpeg") return "image/jpeg";
  if (type === "image/png") return "image/png";
  if (type === "image/webp") return "image/webp";

  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read image file."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Invalid or corrupted image file."));
    img.src = src;
  });
}

async function optimizeImageDataUrl(
  rawDataUrl: string,
  targetMimeType: AllowedImageMimeType
): Promise<{ dataUrl: string; sizeBytes: number; mimeType: AllowedImageMimeType }> {
  const img = await loadImageElement(rawDataUrl);
  const { width, height } = img;

  const needsResize = width > MAX_DIMENSION_PX || height > MAX_DIMENSION_PX;
  // Keep small images untouched if already compact (< 650 KB base64)
  if (!needsResize && rawDataUrl.length < 900_000) {
    const approxBytes = Math.round((rawDataUrl.length * 3) / 4);
    return { dataUrl: rawDataUrl, sizeBytes: approxBytes, mimeType: targetMimeType };
  }

  const scale = needsResize
    ? Math.min(MAX_DIMENSION_PX / width, MAX_DIMENSION_PX / height)
    : 1;
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const approxBytes = Math.round((rawDataUrl.length * 3) / 4);
    return { dataUrl: rawDataUrl, sizeBytes: approxBytes, mimeType: targetMimeType };
  }

  ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

  // Use WebP/JPEG compression when PNG is still very large so localStorage stays healthy
  let outputMime: AllowedImageMimeType = targetMimeType;
  let outputDataUrl = canvas.toDataURL(outputMime, 0.88);
  if (outputMime === "image/png" && outputDataUrl.length > 1_200_000) {
    outputMime = "image/webp";
    outputDataUrl = canvas.toDataURL(outputMime, 0.86);
  }

  const approxBytes = Math.round((outputDataUrl.length * 3) / 4);
  return { dataUrl: outputDataUrl, sizeBytes: approxBytes, mimeType: outputMime };
}

export async function processImageFiles(
  files: FileList | File[],
  existingCount: number
): Promise<{ images: ChatImage[]; errors: string[] }> {
  const fileArray = Array.from(files);
  const images: ChatImage[] = [];
  const errors: string[] = [];

  const availableSlots = Math.max(0, MAX_IMAGES_PER_MESSAGE - existingCount);
  if (fileArray.length > availableSlots) {
    errors.push(
      availableSlots === 0
        ? `You can attach up to ${MAX_IMAGES_PER_MESSAGE} images per message.`
        : `Only ${availableSlots} more ${availableSlots === 1 ? "image" : "images"} can be attached (max ${MAX_IMAGES_PER_MESSAGE} per message).`
    );
  }

  const toProcess = fileArray.slice(0, availableSlots);

  for (const file of toProcess) {
    const mimeType = normalizeMimeType(file);
    if (!mimeType) {
      errors.push(
        `"${file.name}" is not supported. Please upload JPG, JPEG, PNG, or WEBP images.`
      );
      continue;
    }

    if (file.size > MAX_RAW_FILE_SIZE_BYTES) {
      errors.push(
        `"${file.name}" exceeds the ${formatFileSize(MAX_RAW_FILE_SIZE_BYTES)} file size limit.`
      );
      continue;
    }

    try {
      const rawDataUrl = await readFileAsDataUrl(file);
      const optimized = await optimizeImageDataUrl(rawDataUrl, mimeType);
      images.push({
        id: generateId(),
        name: file.name,
        mimeType: optimized.mimeType,
        dataUrl: optimized.dataUrl,
        sizeBytes: optimized.sizeBytes,
      });
    } catch (err) {
      errors.push(
        err instanceof Error
          ? `Could not process "${file.name}": ${err.message}`
          : `Could not process "${file.name}".`
      );
    }
  }

  return { images, errors };
}
