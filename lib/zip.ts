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

// ---------------------------------------------------------------------------
// Writing a zip (Tess, 2026-09-28: "how do i export a folder of all the images
// in the reference library?" → build a "Download images" button).
//
// STORE only, never deflate. The reference images are already-compressed JPEG
// and PNG, so deflating them would burn CPU for essentially no size win — and,
// just as important, store keeps this module dependency-free (mirrors readZip,
// which asks the caller for inflate). The browser fetches each image and this
// stitches them into one .zip entirely client-side; nothing is buffered or
// zipped on the server.
//
// Standard zip, not zip64: a full-library export is tens of megabytes, well
// under the 4GB point where 32-bit sizes/offsets would overflow.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE) of a byte string — every zip entry carries one. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = (CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

const utf8enc = new TextEncoder();

/** Build an uncompressed (stored) zip from named byte blobs, in order. */
export function writeZip(files: { name: string; bytes: Uint8Array }[]): Uint8Array {
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const f of files) {
    const nameBytes = utf8enc.encode(f.name);
    const crc = crc32(f.bytes);
    const size = f.bytes.length;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, LOCAL_SIG, true);
    lv.setUint16(4, 20, true); // version needed to extract
    lv.setUint16(6, 0, true); // flags
    lv.setUint16(8, 0, true); // method 0 = stored
    lv.setUint16(10, 0, true); // mod time
    lv.setUint16(12, 0x21, true); // mod date = 1980-01-01
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed size (== stored size)
    lv.setUint32(22, size, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra length
    local.set(nameBytes, 30);
    parts.push(local, f.bytes);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, CD_SIG, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0, true); // flags
    cv.setUint16(10, 0, true); // method
    cv.setUint16(12, 0, true); // mod time
    cv.setUint16(14, 0x21, true); // mod date
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true); // extra length
    cv.setUint16(32, 0, true); // comment length
    cv.setUint16(34, 0, true); // disk number start
    cv.setUint16(36, 0, true); // internal attrs
    cv.setUint32(38, 0, true); // external attrs
    cv.setUint32(42, offset, true); // local header offset
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += local.length + size;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, EOCD_SIG, true);
  ev.setUint16(4, 0, true); // this disk
  ev.setUint16(6, 0, true); // disk with central dir
  ev.setUint16(8, files.length, true); // entries on this disk
  ev.setUint16(10, files.length, true); // total entries
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true); // comment length

  const all = [...parts, ...central, eocd];
  let total = 0;
  for (const a of all) total += a.length;
  const out = new Uint8Array(total);
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}
