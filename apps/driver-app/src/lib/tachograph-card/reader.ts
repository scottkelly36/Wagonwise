import { getResponse, SW1_MORE_DATA, SW1_WRONG_LE, splitResponse, type ApduResponse } from './apdu';

/**
 * What the phone's card reader must give the download code: turn the card on, send it a command and get its answer, turn it off. A
 * real implementation wraps the phone's USB card reader (CCID); `SimulatedCard` is the other end for building and testing with no
 * reader and no card. It does NOT prove a real reader behaves the same.
 */
export interface CardReader {
  /** Powers the card on and gives its answer-to-reset. Rejects with `no_card` when none is in the reader. */
  powerOn(): Promise<Uint8Array>;
  /** Sends one command and gives the raw answer (data then the two status bytes). Rejects with `card_removed` if the card goes. */
  transmit(command: Uint8Array): Promise<Uint8Array>;
  powerOff(): Promise<void>;
}

/** Whether a reader is plugged in, and a way to open it. The real one needs the native USB module, so it is not in every build. */
export interface CardReaderProvider {
  available(): Promise<boolean>;
  open(): Promise<CardReader>;
}

/**
 * Sends a command and follows what a T=0 card says: more data waiting (`61xx`) is collected with GET RESPONSE, and a wrong length
 * (`6Cxx`) is sent again with the length the card gives. A reader that works at the level of whole commands does this itself; one
 * that works at the level of the transport (T=0) leaves it to us, so it is done here either way.
 */
export async function exchange(reader: CardReader, command: Uint8Array): Promise<ApduResponse> {
  let response = splitResponse(await reader.transmit(command));
  // A wrong length is asked again once with the length the card names; waiting data is then collected. Both can happen in turn.
  if (response.sw >> 8 === SW1_WRONG_LE && command.length === 5) {
    const retry = Uint8Array.from(command);
    retry[4] = response.sw & 0xff;
    response = splitResponse(await reader.transmit(retry));
  }
  if (response.sw >> 8 === SW1_MORE_DATA) {
    const more = splitResponse(await reader.transmit(getResponse(response.sw & 0xff)));
    return { data: concat(response.data, more.data), sw: more.sw };
  }
  return response;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
