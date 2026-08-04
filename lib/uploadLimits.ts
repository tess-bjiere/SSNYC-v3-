// How large a single upload request may be.
//
// Uploads travel through a Next Server Action, and Next enforces a ceiling on the
// request body (configured as `serverActions.bodySizeLimit` in next.config.mjs).
// Exceeding it throws a framework-level error the action never sees, so the
// uploader checks the size itself first and reports something a person can act on.
//
// This constant must match next.config.mjs.
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Human-readable file size. Whole numbers for KB, one decimal from MB up, so
// "6.4 MB" rather than "6.42 MB" or "6718234 bytes".
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "unknown size";
  if (bytes < 1024) return `${Math.round(bytes)} bytes`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

// The message shown when a picked file is too large to send. Names the file, its
// size and the ceiling, because "upload failed" tells nobody what to do next.
export function oversizeError(name: string, bytes: number, max: number = MAX_UPLOAD_BYTES): string {
  const label = name?.trim() || "That image";
  return `${label} is ${formatBytes(bytes)} — larger than the ${formatBytes(max)} limit. Resize it and try again.`;
}

// Whether a file can be sent at all.
export function isOversize(bytes: number, max: number = MAX_UPLOAD_BYTES): boolean {
  return Number.isFinite(bytes) && bytes > max;
}
