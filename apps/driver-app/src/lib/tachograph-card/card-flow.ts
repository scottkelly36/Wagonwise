import type { DownloadResult } from './download-card';
import type { CardReader } from './reader';

/** One file of the download, as the screen lists it. */
export interface FileLine {
  readonly name: string;
  readonly bytes: number;
  readonly signed: boolean;
  readonly skipped: boolean;
}

/** What the driver is told after a successful read. Counts and sizes only: nothing is read out of the file. */
export interface CardSummary {
  readonly fileName: string;
  readonly totalBytes: number;
  readonly files: readonly FileLine[];
  readonly signedCount: number;
  readonly skippedCount: number;
}

export type CardReadState =
  | { readonly status: 'idle' }
  | {
      readonly status: 'reading';
      readonly step: number;
      readonly steps: number;
      readonly file: string;
    }
  | { readonly status: 'done'; readonly summary: CardSummary }
  | { readonly status: 'failed'; readonly message: string };

export type CardReadAction =
  | { readonly type: 'start' }
  | {
      readonly type: 'progress';
      readonly step: number;
      readonly steps: number;
      readonly file: string;
    }
  | { readonly type: 'done'; readonly summary: CardSummary }
  | { readonly type: 'failed'; readonly message: string }
  | { readonly type: 'reset' };

export function cardReadReducer(state: CardReadState, action: CardReadAction): CardReadState {
  switch (action.type) {
    case 'start':
      return { status: 'reading', step: 0, steps: 1, file: 'Starting' };
    case 'progress':
      // A late progress report after the read has ended or been reset is ignored.
      return state.status === 'reading'
        ? { status: 'reading', step: action.step, steps: action.steps, file: action.file }
        : state;
    case 'done':
      return { status: 'done', summary: action.summary };
    case 'failed':
      return { status: 'failed', message: action.message };
    case 'reset':
      return { status: 'idle' };
  }
}

const pad = (n: number): string => String(n).padStart(2, '0');

/** The name a download tool would give the file: `C_` for a card, then the UK date and time, then `.DDD`. */
export function dddFileName(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = pad(Number(get('hour')) % 24);
  return `C_${get('year')}${get('month')}${get('day')}_${hour}${get('minute')}.DDD`;
}

/** "280 KB", "24 KB", "2.4 MB". */
export function sizeText(bytes: number): string {
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function summarise(result: DownloadResult): CardSummary {
  const files = result.files.map((f) => ({
    name: f.name,
    bytes: f.bytes,
    signed: f.signed,
    skipped: f.skipped,
  }));
  return {
    fileName: dddFileName(result.startedAt),
    totalBytes: result.ddd.length,
    files,
    signedCount: files.filter((f) => f.signed).length,
    skippedCount: files.filter((f) => f.skipped).length,
  };
}

/**
 * A log short enough to share: a whole card is over a thousand commands, so past `keep` lines it keeps the first and last halves and
 * says how many it left out. The start shows how the reader and card introduced themselves; the end shows where it stopped.
 */
export function condenseLog(lines: readonly string[], keep = 240): readonly string[] {
  if (lines.length <= keep) return lines;
  const half = Math.floor(keep / 2);
  return [
    ...lines.slice(0, half),
    `... ${lines.length - half * 2} lines left out ...`,
    ...lines.slice(lines.length - half),
  ];
}

/** Slows a reader down so progress can be watched. A real card is slow; a fake one is not. */
export function withDelay(reader: CardReader, ms: number): CardReader {
  if (ms <= 0) return reader;
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, ms));
  return {
    powerOn: async () => {
      await wait();
      return reader.powerOn();
    },
    transmit: async (command) => {
      await wait();
      return reader.transmit(command);
    },
    powerOff: () => reader.powerOff(),
  };
}
