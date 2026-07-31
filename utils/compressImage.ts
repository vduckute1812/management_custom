/**
 * Client-side image downscale + re-encode before upload.
 *
 * Phone photos often land at 3–12MB / 3000–4000px. Resizing to a feed-friendly
 * edge and re-encoding cuts bytes for R2 storage and viewer bandwidth without
 * changing the server allowlist. GIFs are left alone (canvas would flatten
 * animation). Documents are never touched.
 *
 * Browser-only — callers must not import this from Nitro handlers.
 */
import { UploadKind } from "~/types/post";
import { KB, MB, resolveUploadRule } from "~/utils/uploadPolicy";

/** Longest edge after compression. Enough for feed / story display. */
export const IMAGE_COMPRESS_MAX_EDGE = 1920;

/** JPEG / WebP encoder quality (0–1). */
export const IMAGE_COMPRESS_QUALITY = 0.82;

/**
 * Skip work for already-small files. Still compress when dimensions exceed
 * {@link IMAGE_COMPRESS_MAX_EDGE} even if under this size.
 */
export const IMAGE_COMPRESS_MIN_BYTES = 200 * KB;

/**
 * Refuse to decode enormous originals in the tab (OOM risk). Over this, the
 * file is uploaded as-is and the normal size policy decides.
 */
export const IMAGE_COMPRESS_INPUT_MAX_BYTES = 40 * MB;

const COMPRESSIBLE_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

function replaceExtension(fileName: string, extWithDot: string): string {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${base}${extWithDot}`;
}

function extensionForMime(mime: string): string {
  switch (mime) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    default:
      return "";
  }
}

function scaleSize(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return { width, height };
  const scale = maxEdge / edge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  // `imageOrientation: "from-image"` applies EXIF rotation so phone shots
  // aren't sideways after canvas re-encode.
  return createImageBitmap(file, {
    imageOrientation: "from-image",
  } as ImageBitmapOptions);
}

function canvasToBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  mime: string,
  quality: number,
): Promise<Blob | null> {
  if (
    typeof OffscreenCanvas !== "undefined" &&
    canvas instanceof OffscreenCanvas
  ) {
    return canvas.convertToBlob({ type: mime, quality });
  }
  return new Promise((resolve) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => resolve(blob),
      mime,
      quality,
    );
  });
}

function drawToCanvas(
  bitmap: ImageBitmap,
  width: number,
  height: number,
): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);
    return canvas;
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(bitmap, 0, 0, width, height);
  return canvas;
}

/**
 * True when any sampled pixel has meaningful alpha. Used to avoid turning
 * transparent PNGs into JPEG.
 */
function canvasHasTransparency(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): boolean {
  const w = canvas.width;
  const h = canvas.height;
  if (!w || !h) return true;

  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (
    typeof OffscreenCanvas !== "undefined" &&
    canvas instanceof OffscreenCanvas
  ) {
    ctx = canvas.getContext("2d");
  } else {
    ctx = (canvas as HTMLCanvasElement).getContext("2d");
  }
  if (!ctx) return true;

  const data = ctx.getImageData(0, 0, w, h).data;
  // Stride through RGBA so we don't scan every pixel on large canvases.
  const stride = Math.max(4, Math.floor(data.length / 4 / (48 * 48)) * 4);
  for (let i = 3; i < data.length; i += stride) {
    if ((data[i] ?? 255) < 250) return true;
  }
  return false;
}

async function encodeBest(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  sourceMime: string,
): Promise<{ blob: Blob; mime: string } | null> {
  const candidates: { mime: string; quality?: number }[] = [];

  if (sourceMime === "image/png") {
    candidates.push({ mime: "image/png" });
    // Opaque PNGs (screenshots / exports) often shrink dramatically as JPEG.
    if (!canvasHasTransparency(canvas)) {
      candidates.push({ mime: "image/jpeg", quality: IMAGE_COMPRESS_QUALITY });
      candidates.push({ mime: "image/webp", quality: IMAGE_COMPRESS_QUALITY });
    }
  } else if (sourceMime === "image/webp") {
    candidates.push({ mime: "image/webp", quality: IMAGE_COMPRESS_QUALITY });
    candidates.push({ mime: "image/jpeg", quality: IMAGE_COMPRESS_QUALITY });
  } else {
    // JPEG source — stay JPEG; optional WebP if the browser produces smaller.
    candidates.push({ mime: "image/jpeg", quality: IMAGE_COMPRESS_QUALITY });
    candidates.push({ mime: "image/webp", quality: IMAGE_COMPRESS_QUALITY });
  }

  let best: { blob: Blob; mime: string } | null = null;
  for (const c of candidates) {
    const blob = await canvasToBlob(canvas, c.mime, c.quality ?? 0.92);
    if (!blob || blob.size <= 0) continue;
    // Only keep types the upload policy accepts.
    if (!resolveUploadRule(`x${extensionForMime(c.mime)}`, c.mime)) continue;
    if (!best || blob.size < best.blob.size) {
      best = { blob, mime: c.mime };
    }
  }
  return best;
}

/**
 * True when `uploadFile` will try canvas compression — oversized JPEG/PNG/WebP
 * under the decode ceiling. Callers that pre-check size should skip the
 * `tooLarge` reject for these and let compression run first.
 */
export function willAttemptImageCompress(file: {
  name: string;
  type?: string;
  size: number;
}): boolean {
  if (typeof window === "undefined") return false;
  if (typeof createImageBitmap !== "function") return false;
  const rule = resolveUploadRule(file.name, file.type);
  if (!rule || rule.kind !== UploadKind.Image) return false;
  if (!COMPRESSIBLE_MIME.has(rule.mime)) return false;
  if (file.size <= 0 || file.size > IMAGE_COMPRESS_INPUT_MAX_BYTES)
    return false;
  return true;
}

/**
 * Downscale / re-encode an image for upload. Returns the original `file` when
 * compression is skipped, unsupported, or does not shrink the payload.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!willAttemptImageCompress(file)) return file;

  const rule = resolveUploadRule(file.name, file.type);
  if (!rule) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await loadBitmap(file);
    const { width, height } = scaleSize(
      bitmap.width,
      bitmap.height,
      IMAGE_COMPRESS_MAX_EDGE,
    );
    const needsResize = width < bitmap.width || height < bitmap.height;
    if (!needsResize && file.size < IMAGE_COMPRESS_MIN_BYTES) {
      return file;
    }

    const canvas = drawToCanvas(bitmap, width, height);
    const encoded = await encodeBest(canvas, rule.mime);
    if (!encoded) return file;

    // Keep the original when we didn't save meaningful bytes (or grew).
    if (encoded.blob.size >= file.size * 0.95) return file;

    const name =
      encoded.mime === rule.mime
        ? file.name
        : replaceExtension(file.name, extensionForMime(encoded.mime));

    return new File([encoded.blob], name, {
      type: encoded.mime,
      lastModified: file.lastModified,
    });
  } catch {
    // Decode / canvas failures fall back to the original bytes.
    return file;
  } finally {
    bitmap?.close();
  }
}
