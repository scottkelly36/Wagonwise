import type { BleLink } from './client';
import { creditsValue, parseCredits, ReceiveWindow, SendCredits, CREDITS_END } from './credits';
import { encodeItem, type ItemDids, type ItemName, type ItemValue } from './items';
import type { TachographSnapshot } from './snapshot';
import { DEFAULT_ATT_MTU, encodeMessage, MessageAssembler } from './transport';
import {
  negativeReply,
  NRC,
  readDataByIdentifierReply,
  SERVICE_READ_DATA_BY_IDENTIFIER,
} from './uds';

export interface SimulatedVuOptions {
  readonly attMtu?: number;
  /** Credits the simulated tachograph gives the phone when the connection opens. */
  readonly credits?: number;
  /** Refuse the connection, as a unit that is not ready or already has a phone connected would. */
  readonly refuse?: boolean;
}

type Indicate = (characteristic: 'fifo' | 'credits', value: Uint8Array) => void;

/**
 * A stand-in for a smart V2 tachograph, speaking the transport protocol at the byte level: it gives credits, splits long replies
 * into packets, stops when it runs out of the phone's credits, and answers ReadDataByIdentifier from a table. For building and
 * testing the connection code with no lorry. It does NOT prove the real unit behaves the same: the real data identifiers and
 * encodings are still to be confirmed (see items.ts), and so is each maker's behaviour.
 */
export class SimulatedVu {
  readonly link: BleLink;
  readonly #items = new Map<number, Uint8Array>();
  readonly #denied = new Map<number, number>();
  readonly #pendingFirst = new Set<number>();
  readonly #assembler = new MessageAssembler();
  readonly #peerCredits = new SendCredits();
  readonly #window: ReceiveWindow;
  readonly #outbox: Uint8Array[] = [];
  readonly #subscribers = new Set<Indicate>();
  #open = false;
  readonly #options: SimulatedVuOptions;

  constructor(options: SimulatedVuOptions = {}) {
    this.#options = options;
    this.#window = new ReceiveWindow(options.credits ?? 8);
    this.link = {
      attMtu: options.attMtu ?? DEFAULT_ATT_MTU,
      write: (characteristic, value) => this.#onWrite(characteristic, value),
      subscribe: (handler) => {
        this.#subscribers.add(handler);
        return () => this.#subscribers.delete(handler);
      },
    };
  }

  /** Makes `did` answer with `data`. */
  setItem(did: number, data: Uint8Array): void {
    this.#items.set(did, data);
  }

  /** Makes `did` refuse with a reason code, as for personal data when the driver has not given consent. */
  deny(did: number, code: number): void {
    this.#denied.set(did, code);
  }

  /** The first request for `did` is answered "still working" before the real reply. */
  answerPendingFirst(did: number): void {
    this.#pendingFirst.add(did);
  }

  /** Lays a snapshot out as the unit would hold it, using the identifiers given. */
  show(snapshot: TachographSnapshot, dids: ItemDids): void {
    const put = (name: ItemName, value: ItemValue | undefined): void => {
      const did = dids[name];
      if (did !== undefined) this.setItem(did, encodeItem(name, value));
    };
    put('workingState', snapshot.workingState);
    put('continuousDrivingTime', snapshot.continuousDrivingMin);
    put('cumulativeBreakTime', snapshot.cumulativeBreakMin);
    put('currentActivityDuration', snapshot.currentActivityMin);
    put('currentDailyDrivingTime', snapshot.dailyDrivingMin);
    put('currentWeeklyDrivingTime', snapshot.weeklyDrivingMin);
    put('previousAndCurrentWeekDrivingTime', snapshot.previousAndCurrentWeekDrivingMin);
  }

  /** Delivered a moment later, as a real indication would be. */
  #indicate(characteristic: 'fifo' | 'credits', value: Uint8Array): void {
    void Promise.resolve().then(() => {
      for (const handler of [...this.#subscribers]) handler(characteristic, value);
    });
  }

  async #onWrite(characteristic: 'fifo' | 'credits', value: Uint8Array): Promise<void> {
    await Promise.resolve();
    if (characteristic === 'credits') {
      const event = parseCredits(value);
      if (event.kind === 'reject') {
        this.#open = false;
        this.#peerCredits.reset();
        return;
      }
      this.#peerCredits.grant(event.credits);
      if (!this.#open) {
        if (this.#options.refuse === true) {
          this.#indicate('credits', Uint8Array.of(CREDITS_END));
          return;
        }
        this.#open = true;
        this.#indicate('credits', creditsValue(this.#window.open()));
      }
      this.#flush();
      return;
    }
    if (!this.#open) return;
    const give = this.#window.onPacket();
    if (give > 0) this.#indicate('credits', creditsValue(give));
    const result = this.#assembler.feed(value);
    if (result.kind === 'message') this.#answer(result.message);
  }

  #answer(request: Uint8Array): void {
    if (request[0] !== SERVICE_READ_DATA_BY_IDENTIFIER || request.length !== 3) {
      this.#queue(negativeReply(NRC.serviceNotSupported));
      return;
    }
    const did = ((request[1] as number) << 8) | (request[2] as number);
    if (this.#pendingFirst.delete(did)) this.#queue(negativeReply(NRC.responsePending));
    const denied = this.#denied.get(did);
    const data = this.#items.get(did);
    if (denied !== undefined) this.#queue(negativeReply(denied));
    else if (data === undefined) this.#queue(negativeReply(NRC.requestOutOfRange));
    else this.#queue(readDataByIdentifierReply(did, data));
  }

  #queue(message: Uint8Array): void {
    this.#outbox.push(...encodeMessage(message, this.link.attMtu));
    this.#flush();
  }

  /** Sends what the phone's credits allow, and keeps the rest until it gives more. */
  #flush(): void {
    while (this.#outbox.length > 0 && this.#peerCredits.tryTake()) {
      this.#indicate('fifo', this.#outbox.shift() as Uint8Array);
    }
  }
}
