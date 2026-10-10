/**
 * Flow control for the tachograph's serial port (section 4.2.3 and 4.3 of the transport protocol). Each side tells the other how
 * many packets it may send before it must wait for more credits; credits received are added to the ones left. A connection
 * without flow control is not supported. Credits are an integer 0..255 on the Credits characteristic: the value 255 (0xFF, "-1")
 * written by the phone ends the connection, and sent by the tachograph refuses it.
 */

export const CREDITS_END = 0xff;

export type CreditsEvent =
  { readonly kind: 'grant'; readonly credits: number } | { readonly kind: 'reject' };

/** Reads what arrived on the Credits characteristic. */
export function parseCredits(value: Uint8Array): CreditsEvent {
  if (value.length !== 1) throw new Error(`The credits value is one byte, not ${value.length}`);
  const credits = value[0] as number;
  return credits === CREDITS_END ? { kind: 'reject' } : { kind: 'grant', credits };
}

/** What to write to the Credits characteristic to give the other side `credits` more packets. */
export function creditsValue(credits: number): Uint8Array {
  if (!Number.isInteger(credits) || credits < 0 || credits >= CREDITS_END) {
    throw new Error(`Credits must be a whole number from 0 to ${CREDITS_END - 1}`);
  }
  return Uint8Array.of(credits);
}

/** The packets we may still send. */
export class SendCredits {
  #available = 0;

  get available(): number {
    return this.#available;
  }

  grant(credits: number): void {
    this.#available += credits;
  }

  /** Spends one credit; false when there is none, and nothing may be sent. */
  tryTake(): boolean {
    if (this.#available === 0) return false;
    this.#available -= 1;
    return true;
  }

  /** Spends `count` credits at once, or none: a message goes out whole or waits. */
  tryTakeAll(count: number): boolean {
    if (this.#available < count) return false;
    this.#available -= count;
    return true;
  }

  reset(): void {
    this.#available = 0;
  }
}

/**
 * The packets the other side may still send us. We give credits when the connection opens and again when the window runs low, so
 * the sender never has to stop for long and we never receive more than we have room for.
 */
export class ReceiveWindow {
  #outstanding = 0;

  constructor(
    private readonly size: number,
    private readonly refillBelow: number = Math.ceil(size / 2),
  ) {
    if (size < 1 || size >= CREDITS_END) throw new Error('The window must be 1 to 254 packets');
  }

  /** Credits to give when the connection opens. */
  open(): number {
    this.#outstanding = this.size;
    return this.size;
  }

  /** A packet arrived. Says how many credits to give now, or 0 when there is still plenty of room. */
  onPacket(): number {
    this.#outstanding = Math.max(0, this.#outstanding - 1);
    if (this.#outstanding >= this.refillBelow) return 0;
    const give = this.size - this.#outstanding;
    this.#outstanding = this.size;
    return give;
  }
}
