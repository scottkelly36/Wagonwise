import { creditsValue, parseCredits, ReceiveWindow, SendCredits, CREDITS_END } from './credits';
import { decodeItem, ITEM_NAMES, type ItemDids, type ItemName } from './items';
import type { Consent, TachographSnapshot } from './snapshot';
import { encodeMessage, MessageAssembler } from './transport';
import { NRC, parseReadReply, readDataByIdentifierRequest } from './uds';

/**
 * What the phone's Bluetooth Low Energy layer must give this client, for one of the tachograph's serial-port services (Download or
 * Diagnostics). A real implementation wraps the platform's BLE library; the simulator in this folder implements the other end.
 */
export interface BleLink {
  /** The ATT MTU agreed at connection (the minimum, 23, until the phone and the unit agree a bigger one). */
  readonly attMtu: number;
  /** Writes to the service's FIFO (data) or Credits characteristic. */
  write(characteristic: 'fifo' | 'credits', value: Uint8Array): Promise<void>;
  /** Calls `handler` for each indication from the unit; returns how to stop. */
  subscribe(handler: (characteristic: 'fifo' | 'credits', value: Uint8Array) => void): () => void;
}

export type TachographErrorCode = 'rejected' | 'timeout' | 'closed' | 'protocol';

export class TachographError extends Error {
  constructor(
    readonly code: TachographErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TachographError';
  }
}

export interface ClientOptions {
  /** How many packets the unit may send before waiting for more credits from us. */
  readonly receiveWindow?: number;
  readonly timeoutMs?: number;
}

interface Waiter<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (error: TachographError) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * The phone's side of a serial-port connection to the tachograph: opens it with flow control, sends a request as packets within
 * the credits it was given, and puts the reply back together. One request at a time, which is all the tachograph's services
 * expect of a client.
 */
export class TachographClient {
  readonly #send = new SendCredits();
  readonly #window: ReceiveWindow;
  readonly #assembler = new MessageAssembler();
  readonly #timeoutMs: number;
  #unsubscribe: (() => void) | undefined;
  #state: 'new' | 'opening' | 'open' | 'closed' = 'new';
  #failure: TachographError | undefined;
  readonly #inbox: Uint8Array[] = [];
  #messageWaiter: Waiter<Uint8Array> | undefined;
  #creditWaiters: (() => void)[] = [];

  constructor(
    private readonly link: BleLink,
    options: ClientOptions = {},
  ) {
    this.#window = new ReceiveWindow(options.receiveWindow ?? 16);
    this.#timeoutMs = options.timeoutMs ?? 5_000;
  }

  /** Starts the connection: gives the unit credits to send to us, and waits for it to give us credits (or to refuse). */
  async open(): Promise<void> {
    if (this.#state !== 'new')
      throw new TachographError('protocol', 'The connection was already opened');
    this.#state = 'opening';
    this.#unsubscribe = this.link.subscribe((c, v) => this.#onIndication(c, v));
    await this.link.write('credits', creditsValue(this.#window.open()));
    await this.#waitForCredit();
    this.#state = 'open';
  }

  /** Sends one request and returns the unit's next message. */
  async request(message: Uint8Array): Promise<Uint8Array> {
    this.#assertOpen();
    this.#inbox.length = 0;
    for (const packet of encodeMessage(message, this.link.attMtu)) {
      await this.#waitForCredit();
      await this.link.write('fifo', packet);
    }
    return this.next();
  }

  /** The unit's next message: the reply, or a further reply after "still working". */
  next(): Promise<Uint8Array> {
    this.#assertOpen();
    const waiting = this.#inbox.shift();
    if (waiting !== undefined) return Promise.resolve(waiting);
    return new Promise<Uint8Array>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#messageWaiter = undefined;
        reject(new TachographError('timeout', 'The tachograph did not answer in time'));
      }, this.#timeoutMs);
      this.#messageWaiter = { resolve, reject, timer };
    });
  }

  /** Ends the connection: writes the end marker (the unit does not confirm it) and lets go. */
  async close(): Promise<void> {
    if (this.#state === 'closed') return;
    const wasOpen = this.#state === 'open';
    this.#shutDown(new TachographError('closed', 'The connection was closed'));
    if (wasOpen) await this.link.write('credits', Uint8Array.of(CREDITS_END));
  }

  #assertOpen(): void {
    if (this.#failure !== undefined) throw this.#failure;
    if (this.#state !== 'open') throw new TachographError('protocol', 'The connection is not open');
  }

  #onIndication(characteristic: 'fifo' | 'credits', value: Uint8Array): void {
    if (this.#state === 'closed') return;
    if (characteristic === 'credits') {
      const event = parseCredits(value);
      if (event.kind === 'reject') {
        this.#shutDown(
          new TachographError('rejected', 'The tachograph refused or ended the connection'),
        );
        return;
      }
      this.#send.grant(event.credits);
      const waiters = this.#creditWaiters;
      this.#creditWaiters = [];
      for (const wake of waiters) wake();
      return;
    }
    const give = this.#window.onPacket();
    if (give > 0) void this.link.write('credits', creditsValue(give)).catch(() => undefined);
    const result = this.#assembler.feed(value);
    if (result.kind === 'message') this.#deliver(result.message);
    else if (result.kind === 'error') {
      this.#messageWaiter?.reject(
        new TachographError('protocol', `Bad packet from the tachograph: ${result.reason}`),
      );
      this.#clearMessageWaiter();
    }
  }

  #deliver(message: Uint8Array): void {
    const waiter = this.#messageWaiter;
    if (waiter === undefined) {
      this.#inbox.push(message);
      return;
    }
    this.#clearMessageWaiter();
    waiter.resolve(message);
  }

  #clearMessageWaiter(): void {
    if (this.#messageWaiter !== undefined) clearTimeout(this.#messageWaiter.timer);
    this.#messageWaiter = undefined;
  }

  /** Waits until one credit is spent; fails if none arrives in time or the connection ends. */
  #waitForCredit(): Promise<void> {
    if (this.#failure !== undefined) return Promise.reject(this.#failure);
    if (this.#send.tryTake()) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#creditWaiters = this.#creditWaiters.filter((w) => w !== wake);
        reject(new TachographError('timeout', 'The tachograph gave no credits in time'));
      }, this.#timeoutMs);
      const wake = (): void => {
        clearTimeout(timer);
        if (this.#failure !== undefined) reject(this.#failure);
        else if (this.#send.tryTake()) resolve();
        else this.#creditWaiters.push(wake);
      };
      this.#creditWaiters.push(wake);
    });
  }

  #shutDown(error: TachographError): void {
    this.#failure = error;
    this.#state = 'closed';
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    const waiter = this.#messageWaiter;
    this.#clearMessageWaiter();
    waiter?.reject(error);
    const waiters = this.#creditWaiters;
    this.#creditWaiters = [];
    for (const wake of waiters) wake();
  }
}

/**
 * Reads each item we know the identifier of and gathers the answers. A refusal for lack of the driver's consent makes the
 * snapshot say so; any other refusal is kept for diagnosis. An item without an identifier is not asked for.
 */
export async function readSnapshot(
  client: TachographClient,
  dids: ItemDids,
  now: number,
): Promise<TachographSnapshot> {
  const values: Partial<Record<ItemName, number | string>> = {};
  const refused: Partial<Record<ItemName, number>> = {};
  let answered = 0;
  for (const name of ITEM_NAMES) {
    const did = dids[name];
    if (did === undefined) continue;
    let reply = await client.request(readDataByIdentifierRequest(did));
    let parsed = parseReadReply(reply, did);
    // "Still working": wait for the real answer, do not ask again.
    while (parsed.kind === 'pending') {
      reply = await client.next();
      parsed = parseReadReply(reply, did);
    }
    if (parsed.kind === 'data') {
      answered += 1;
      const value = decodeItem(name, parsed.data);
      if (value !== undefined) values[name] = value;
    } else if (parsed.kind === 'refused') {
      refused[name] = parsed.code;
    } else {
      throw new TachographError('protocol', `Unexpected reply for ${name}: ${parsed.reason}`);
    }
  }
  const consent: Consent = Object.values(refused).includes(NRC.securityAccessDenied)
    ? 'withheld'
    : answered > 0
      ? 'given'
      : 'unknown';
  const minutes = (name: ItemName): number | undefined => {
    const v = values[name];
    return typeof v === 'number' ? v : undefined;
  };
  const state = values.workingState;
  return {
    at: now,
    consent,
    workingState:
      typeof state === 'string' ? (state as TachographSnapshot['workingState']) : undefined,
    continuousDrivingMin: minutes('continuousDrivingTime'),
    cumulativeBreakMin: minutes('cumulativeBreakTime'),
    currentActivityMin: minutes('currentActivityDuration'),
    dailyDrivingMin: minutes('currentDailyDrivingTime'),
    weeklyDrivingMin: minutes('currentWeeklyDrivingTime'),
    previousAndCurrentWeekDrivingMin: minutes('previousAndCurrentWeekDrivingTime'),
    refused: Object.keys(refused).length > 0 ? refused : undefined,
  };
}
