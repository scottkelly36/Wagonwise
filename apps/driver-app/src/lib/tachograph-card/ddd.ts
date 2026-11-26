/**
 * The download file a tachograph tool writes (usually `.ddd`, also `.c1b`): the card's files one after another, each as a record of
 * three bytes of tag (the file's two-byte identifier, then 0x00 for its data or 0x01 for its signature), a two-byte length (big
 * endian) and the bytes. A signature record follows the data it signs. Second-generation data uses 0x02 and 0x03.
 */

export const DATA = 0x00;
export const SIGNATURE = 0x01;
export const HEADER_LENGTH = 5;
export const MAX_RECORD = 0xffff;

export interface DddRecord {
  readonly fid: number;
  /** 0x00 data, 0x01 signature (first generation); 0x02 and 0x03 for second generation. */
  readonly appendix: number;
  readonly data: Uint8Array;
}

export function encodeRecord(record: DddRecord): Uint8Array {
  if (record.data.length > MAX_RECORD) throw new RangeError('a record holds at most 65535 bytes');
  const out = new Uint8Array(HEADER_LENGTH + record.data.length);
  out[0] = (record.fid >> 8) & 0xff;
  out[1] = record.fid & 0xff;
  out[2] = record.appendix;
  out[3] = (record.data.length >> 8) & 0xff;
  out[4] = record.data.length & 0xff;
  out.set(record.data, HEADER_LENGTH);
  return out;
}

/** The records written one after another, with nothing between them and nothing added. */
export function buildDdd(records: readonly DddRecord[]): Uint8Array {
  const parts = records.map(encodeRecord);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export class DddFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DddFormatError';
  }
}

/** Reads a download back into its records. Throws if a record runs past the end or bytes are left over (the file is cut or damaged). */
export function parseDdd(bytes: Uint8Array): DddRecord[] {
  const records: DddRecord[] = [];
  let at = 0;
  while (at < bytes.length) {
    if (bytes.length - at < HEADER_LENGTH)
      throw new DddFormatError('trailing bytes after the last record');
    const length = ((bytes[at + 3] as number) << 8) | (bytes[at + 4] as number);
    const end = at + HEADER_LENGTH + length;
    if (end > bytes.length) throw new DddFormatError('a record runs past the end of the file');
    records.push({
      fid: ((bytes[at] as number) << 8) | (bytes[at + 1] as number),
      appendix: bytes[at + 2] as number,
      data: bytes.subarray(at + HEADER_LENGTH, end),
    });
    at = end;
  }
  if (records.length === 0) throw new DddFormatError('no records');
  return records;
}
