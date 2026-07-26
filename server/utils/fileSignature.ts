/**
 * Content sniffing for uploads.
 *
 * The extension and the browser-declared Content-Type are both attacker
 * controlled, so an allowlist keyed on either is only half a check: nothing
 * stops someone renaming `payload.exe` to `avatar.png`. These helpers look at
 * the actual bytes and confirm they match the type we are about to record and
 * serve back with that Content-Type.
 */

const ZIP_LOCAL_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const ZIP_EMPTY_ARCHIVE = Buffer.from([0x50, 0x4b, 0x05, 0x06]);

function startsWith(buf: Buffer, sig: number[]): boolean {
  if (buf.length < sig.length) return false;
  return sig.every((byte, i) => buf[i] === byte);
}

function isJpeg(buf: Buffer): boolean {
  return startsWith(buf, [0xff, 0xd8, 0xff]);
}

function isPng(buf: Buffer): boolean {
  return startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
}

function isGif(buf: Buffer): boolean {
  if (buf.length < 6) return false;
  const header = buf.subarray(0, 6).toString("latin1");
  return header === "GIF87a" || header === "GIF89a";
}

function isWebp(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  return (
    buf.subarray(0, 4).toString("latin1") === "RIFF" &&
    buf.subarray(8, 12).toString("latin1") === "WEBP"
  );
}

function isPdf(buf: Buffer): boolean {
  // Readers tolerate junk before the header, so match anywhere in the first
  // 1KB rather than only at offset 0.
  return buf.subarray(0, 1024).includes("%PDF-");
}

function isDocx(buf: Buffer): boolean {
  const isZip =
    buf.subarray(0, 4).equals(ZIP_LOCAL_HEADER) ||
    buf.subarray(0, 4).equals(ZIP_EMPTY_ARCHIVE);
  if (!isZip) return false;
  // Every OOXML wordprocessing package carries these entries, and ZIP stores
  // entry names uncompressed, so they are greppable in the raw bytes. This
  // keeps a plain .zip (or a .jar) from passing as a .docx.
  return buf.includes("word/") && buf.includes("[Content_Types].xml");
}

/**
 * Text files have no signature, so instead assert the absence of binary:
 * decodable as UTF-8 and free of NUL bytes.
 */
function isText(buf: Buffer): boolean {
  if (buf.includes(0x00)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

const VERIFIERS: Record<string, (buf: Buffer) => boolean> = {
  "image/jpeg": isJpeg,
  "image/png": isPng,
  "image/gif": isGif,
  "image/webp": isWebp,
  "application/pdf": isPdf,
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    isDocx,
  "text/plain": isText,
  "text/markdown": isText,
};

/**
 * True when `buf` really is the given MIME type. Unknown MIMEs return false —
 * the caller has already narrowed to the allowlist, so a miss here means the
 * allowlist and this table drifted apart and we should fail closed.
 */
export function contentMatchesMime(buf: Buffer, mime: string): boolean {
  const verify = VERIFIERS[mime];
  return verify ? verify(buf) : false;
}
