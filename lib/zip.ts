// Reading the entries out of a zip archive.
//
// This exists for one reason: SOUS SOUS WIP.xlsx is a real .xlsx, not a Google
// Sheet. Drive can export a Google Sheet straight to CSV, but it cannot export
// an .xlsx to anything — the bytes come back as the .xlsx itself. And an .xlsx
// is a zip of XML files. So to read Kara's sheet without asking anyone to
// change how they work, SSYNC has to open the zip.
//
// The alternative was converting the file to a Google Sheet, which would have
// been two lines of code and a much worse idea: that file is the live working
// document three people type into every day, and "the tool needed it in a
// different format" is not a good enough reason to move somebody's work.
//
// Deliberately dependency-free, including of node: the caller passes in the
// inflate function. That is not purity for its own sake — it means the tests
// can run this against a stored (uncompressed) archive with no runtime at all,
// and it means the one piece that must come from node lives at the edge where
// it can be seen.

export type Inflate = (compressed: Uint8Array, expectedSize: number) => Uint8Array;

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

/** Zip stores every multi-byte number little-endian. */
function u16(b: Uint8Array, at: number): number {
  return b[at] | (b[at + 1] << 8);
}
function u32(b: Uint8Array, at: number): number {
  return (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16) | (b[at + 3] << 24)) >>> 0;
}

/**
 * Find the End Of Central Directory record.
 *
 * It sits at the very end of the file unless there is a zip comment, which can
 * be up to 64k long, so the search is bounded rather than unbounded — a
 * corrupt file should fail quickly rather than scan a seven-megabyte buffer
 * backwards looking for a signature that is not there.
 */
function findEocd(b: Uint8Array): number {
  const min = Math.max(0, b.length - (0xffff + 22));
  for (let i = b.length - 22; i >= min; i--) {
    if (u32(b, i) === EOCD_SIG) return i;
  }
  return -1;
}

const utf8 = new TextDecoder("utf-8");

/**
 * Every entry in the archive, by name.
 *
 * Reads the central directory rather than walking local headers, because the
 * local header's sizes may be zero with the real values in a trailing data
 * descriptor — a shape some writers use and Excel occasionally produces. The
 * central directory is always authoritative.
 *
 * Zip64 archives are rejected rather than mis-read. A spreadsheet would have to
 * be over four gigabytes to need it, and silently returning the wrong bytes is
 * worse than saying so.
 */
export function readZip(buf: Uint8Array, inflate: Inflate): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  const eocd = findEocd(buf);
  if (eocd < 0) throw new Error("Not a zip file (no end-of-central-directory record).");

  const count = u16(buf, eocd + 10);
  let p = u32(buf, eocd + 16);
  if (p === 0xffffffff) throw new Error("Zip64 archives are not supported.");

  for (let n = 0; n < count; n++) {
    if (u32(buf, p) !== CD_SIG) break;
    const method = u16(buf, p + 10);
    const compSize = u32(buf, p + 20);
    const rawSize = u32(buf, p + 24);
    const nameLen = u16(buf, p + 28);
    const extraLen = u16(buf, p + 30);
    const commentLen = u16(buf, p + 32);
    const localAt = u32(buf, p + 42);
    const name = utf8.decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (compSize === 0xffffffff || rawSize === 0xffffffff || localAt === 0xffffffff) {
      throw new Error("Zip64 archives are not supported.");
    }
    // A directory entry is a name, not a file.
    if (name.endsWith("/")) continue;

    if (u32(buf, localAt) !== LOCAL_SIG) continue;
    // The local header repeats the name and carries its own extra field, whose
    // length routinely differs from the central directory's. Both must be read
    // from the header actually being used.
    const start = localAt + 30 + u16(buf, localAt + 26) + u16(buf, localAt + 28);
    const body = buf.subarray(start, start + compSize);

    if (method === 0) out.set(name, body);
    else if (method === 8) out.set(name, inflate(body, rawSize));
    else throw new Error(`Unsupported zip compression method ${method} for ${name}.`);
  }

  return out;
}

/** One entry as text. Returns "" for an entry that is not in the archive. */
export function zipText(entries: Map<string, Uint8Array>, name: string): string {
  const e = entries.get(name);
  return e ? utf8.decode(e) : "";
}
