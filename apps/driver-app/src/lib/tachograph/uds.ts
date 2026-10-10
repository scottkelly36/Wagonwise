/**
 * The request and reply messages the tachograph speaks over the serial port: the diagnostic services of ISO 14229-1 (UDS), as
 * the Remote HMI specification says ("uses service ReadDataByIdentifier to provide information available via local VU HMI").
 * Only what reading needs: ReadDataByIdentifier, its positive reply and the negative reply. The service numbers are the standard
 * UDS ones: a positive reply is the request's service plus 0x40, and a negative reply is 0x7F, the service and a reason code.
 */

export const SERVICE_READ_DATA_BY_IDENTIFIER = 0x22;
const POSITIVE_RESPONSE_OFFSET = 0x40;
const NEGATIVE_RESPONSE = 0x7f;

/** Reason codes of ISO 14229-1 that matter to us. */
export const NRC = {
  serviceNotSupported: 0x11,
  conditionsNotCorrect: 0x22,
  requestOutOfRange: 0x31,
  securityAccessDenied: 0x33,
  /** The unit is working on it: wait for the real reply, do not ask again. */
  responsePending: 0x78,
} as const;

export function readDataByIdentifierRequest(did: number): Uint8Array {
  if (!Number.isInteger(did) || did < 0 || did > 0xffff)
    throw new Error('A data identifier is two bytes');
  return Uint8Array.of(SERVICE_READ_DATA_BY_IDENTIFIER, did >> 8, did & 0xff);
}

export type UdsReadReply =
  | { readonly kind: 'data'; readonly did: number; readonly data: Uint8Array }
  | { readonly kind: 'refused'; readonly code: number }
  | { readonly kind: 'pending' }
  | { readonly kind: 'unexpected'; readonly reason: string };

/** Understands the reply to a ReadDataByIdentifier request for `did`. */
export function parseReadReply(reply: Uint8Array, did: number): UdsReadReply {
  const sid = reply[0];
  if (sid === undefined) return { kind: 'unexpected', reason: 'empty reply' };
  if (sid === NEGATIVE_RESPONSE) {
    if (reply.length < 3) return { kind: 'unexpected', reason: 'a negative reply is three bytes' };
    if (reply[1] !== SERVICE_READ_DATA_BY_IDENTIFIER) {
      return { kind: 'unexpected', reason: 'a refusal of some other request' };
    }
    const code = reply[2] as number;
    return code === NRC.responsePending ? { kind: 'pending' } : { kind: 'refused', code };
  }
  if (sid !== SERVICE_READ_DATA_BY_IDENTIFIER + POSITIVE_RESPONSE_OFFSET) {
    return { kind: 'unexpected', reason: `service ${sid.toString(16)} in reply` };
  }
  if (reply.length < 3)
    return { kind: 'unexpected', reason: 'a positive reply carries the identifier' };
  const got = ((reply[1] as number) << 8) | (reply[2] as number);
  if (got !== did)
    return { kind: 'unexpected', reason: `reply for ${got.toString(16)}, not ${did.toString(16)}` };
  return { kind: 'data', did, data: reply.subarray(3) };
}

export function readDataByIdentifierReply(did: number, data: Uint8Array): Uint8Array {
  const reply = new Uint8Array(3 + data.length);
  reply[0] = SERVICE_READ_DATA_BY_IDENTIFIER + POSITIVE_RESPONSE_OFFSET;
  reply[1] = did >> 8;
  reply[2] = did & 0xff;
  reply.set(data, 3);
  return reply;
}

export function negativeReply(code: number): Uint8Array {
  return Uint8Array.of(NEGATIVE_RESPONSE, SERVICE_READ_DATA_BY_IDENTIFIER, code);
}
