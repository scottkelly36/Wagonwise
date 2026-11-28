/**
 * The records of a driver card download: a run of (three byte tag, two byte big-endian length, the bytes). The tag is the card file's
 * identifier (two bytes) then an appendix byte: `00` the data of a first generation card, `01` its signature, `02` the data of a second
 * generation card, `03` its signature (open-source parser traconiq/tachoparser, which reads real files, and the driver app's own
 * writer). Shared by the readers of what is inside a file (`card-identity.ts`, `card-activity.ts`).
 */

export const FIRST_GENERATION_DATA = 0x00;
export const SECOND_GENERATION_DATA = 0x02;

export interface FileRecord {
  readonly file: number;
  readonly appendix: number;
  readonly data: Uint8Array;
}

/** The records of a download, up to the first one that does not fit (a truncated copy still gives what came before). */
export function records(bytes: Uint8Array): FileRecord[] {
  const found: FileRecord[] = [];
  let at = 0;
  while (at + 5 <= bytes.length) {
    const file = ((bytes[at] as number) << 8) | (bytes[at + 1] as number);
    const appendix = bytes[at + 2] as number;
    const length = ((bytes[at + 3] as number) << 8) | (bytes[at + 4] as number);
    if (at + 5 + length > bytes.length) break;
    found.push({ file, appendix, data: bytes.subarray(at + 5, at + 5 + length) });
    at += 5 + length;
  }
  return found;
}
