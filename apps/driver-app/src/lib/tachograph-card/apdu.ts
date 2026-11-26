/**
 * The smart-card commands used to read a tachograph driver card, as bytes. Written from the card-reading sequence the open-source
 * Cardpeek tachograph script uses and the file layout its parsers agree on (see docs/tachograph-card-reader.md for the sources and
 * what is still to be confirmed on a real card). A response is the data followed by two status bytes, SW1 SW2.
 */

export const SW_OK = 0x9000;
/** The card says more data is waiting (`61xx`): ask for it with GET RESPONSE. T=0 cards answer this way. */
export const SW1_MORE_DATA = 0x61;
/** The length asked for was wrong (`6Cxx`): ask again with the length the card says. */
export const SW1_WRONG_LE = 0x6c;
export const SW_FILE_NOT_FOUND = 0x6a82;
export const SW_END_OF_FILE = 0x6282;
export const SW_CONDITIONS_NOT_SATISFIED = 0x6985;

/** The tachograph application's name on the card: 0xFF followed by "TACHO". */
export const TACHOGRAPH_AID: Uint8Array = Uint8Array.from([0xff, 0x54, 0x41, 0x43, 0x48, 0x4f]);

/** The most bytes asked for in one READ BINARY. Cardpeek uses 200; a card can answer more, a reader may not. */
export const MAX_READ = 200;

/** SELECT by the application's name, asking for no data back. */
export function selectApplication(aid: Uint8Array): Uint8Array {
  return Uint8Array.from([0x00, 0xa4, 0x04, 0x0c, aid.length, ...aid]);
}

/** SELECT an elementary file by its two-byte identifier, asking for no data back. */
export function selectFile(fid: number): Uint8Array {
  return Uint8Array.from([0x00, 0xa4, 0x02, 0x0c, 0x02, (fid >> 8) & 0xff, fid & 0xff]);
}

/** READ BINARY from the selected file. The offset is 15 bits (P1 P2); a length of 256 is sent as 0, as the standard says. */
export function readBinary(offset: number, length: number): Uint8Array {
  if (offset < 0 || offset > 0x7fff) throw new RangeError('offset out of range');
  if (length < 1 || length > 256) throw new RangeError('length out of range');
  return Uint8Array.from([0x00, 0xb0, (offset >> 8) & 0x7f, offset & 0xff, length & 0xff]);
}

/** PERFORM HASH OF FILE: the card hashes the selected file, ready to sign. */
export const PERFORM_HASH_OF_FILE: Uint8Array = Uint8Array.from([0x80, 0x2a, 0x90, 0x00]);

/** PSO: COMPUTE DIGITAL SIGNATURE over the hash just made, 128 bytes back (a first-generation card signs with RSA-1024). */
export const COMPUTE_DIGITAL_SIGNATURE: Uint8Array = Uint8Array.from([
  0x00, 0x2a, 0x9e, 0x9a, 0x80,
]);
export const SIGNATURE_LENGTH = 128;

/** GET RESPONSE: collects data the card said was waiting. */
export function getResponse(length: number): Uint8Array {
  return Uint8Array.from([0x00, 0xc0, 0x00, 0x00, length & 0xff]);
}

export interface ApduResponse {
  readonly data: Uint8Array;
  /** SW1 SW2 as one number, for example 0x9000. */
  readonly sw: number;
}

/** Splits a raw answer into its data and its two status bytes. */
export function splitResponse(raw: Uint8Array): ApduResponse {
  if (raw.length < 2) throw new RangeError('a card answer is at least the two status bytes');
  return {
    data: raw.subarray(0, raw.length - 2),
    sw: ((raw[raw.length - 2] as number) << 8) | (raw[raw.length - 1] as number),
  };
}

/** The status as four hex digits, for messages. */
export function swText(sw: number): string {
  return sw.toString(16).toUpperCase().padStart(4, '0');
}
