import {
  COMPUTE_DIGITAL_SIGNATURE,
  MAX_READ,
  PERFORM_HASH_OF_FILE,
  readBinary,
  SIGNATURE_LENGTH,
  SW_FILE_NOT_FOUND,
  SW_OK,
  selectApplication,
  selectFile,
  swText,
  TACHOGRAPH_AID,
} from './apdu';
import {
  APPLICATION_FILES,
  APPLICATION_IDENTIFICATION,
  NO_APPLICATION_YET,
  parseAppIdentification,
  ROOT_FILES,
  TOTAL_STEPS,
  fidText,
  type AppIdentification,
  type CardFileSpec,
} from './card-files';
import { buildDdd, DATA, SIGNATURE, type DddRecord } from './ddd';
import { CardError } from './errors';
import { exchange, type CardReader } from './reader';

export interface DownloadProgress {
  /** Files done so far, and in all. */
  readonly step: number;
  readonly steps: number;
  /** The file being read now, in words. */
  readonly file: string;
}

export interface FileSummary {
  readonly fid: number;
  readonly name: string;
  readonly bytes: number;
  readonly signed: boolean;
  /** True when an optional file was not on the card. */
  readonly skipped: boolean;
}

export interface DownloadResult {
  /** The download as a tachograph tool would save it: the card's files and their signatures, unaltered. */
  readonly ddd: Uint8Array;
  readonly files: readonly FileSummary[];
  /** The card's holder and card number are inside the file; nothing is read out of it here. */
  readonly startedAt: Date;
}

export interface DownloadOptions {
  readonly onProgress?: (progress: DownloadProgress) => void;
  readonly signal?: AbortSignal;
  readonly now?: () => Date;
}

/**
 * Reads a first-generation driver card through the reader and builds the download file. The order is the one the Cardpeek tachograph
 * script uses: the two files at the top of the card, then the tachograph application, its identification (whose counters size the
 * other files), then each file with, for a signed one, the card's hash and signature. The bytes are kept exactly as the card gave
 * them. Nothing is read out of them, so a wrong guess about what is inside cannot reach a driver.
 */
export async function downloadDriverCard(
  reader: CardReader,
  options: DownloadOptions = {},
): Promise<DownloadResult> {
  const now = options.now ?? (() => new Date());
  const startedAt = now();
  const records: DddRecord[] = [];
  const summaries: FileSummary[] = [];
  let step = 0;

  const checkStop = () => {
    if (options.signal?.aborted === true) throw new CardError('cancelled', 'stopped');
  };
  const report = (file: string) => options.onProgress?.({ step, steps: TOTAL_STEPS, file });

  async function send(command: Uint8Array) {
    checkStop();
    return exchange(reader, command);
  }

  /** Reads one file in pieces, with its signature when the card signs it. Returns its bytes, or `undefined` for an optional file the card lacks. */
  async function readFile(
    spec: CardFileSpec,
    app: AppIdentification | undefined,
  ): Promise<Uint8Array | undefined> {
    report(spec.name);
    const selected = await send(selectFile(spec.fid));
    if (selected.sw === SW_FILE_NOT_FOUND) {
      if (spec.optional) {
        summaries.push({ fid: spec.fid, name: spec.name, bytes: 0, signed: false, skipped: true });
        step++;
        return undefined;
      }
      throw new CardError('file_missing', `file ${fidText(spec.fid)} not found`);
    }
    if (selected.sw !== SW_OK) {
      throw new CardError(
        'read_failed',
        `select ${fidText(spec.fid)} answered ${swText(selected.sw)}`,
      );
    }

    if (spec.signed) {
      const hashed = await send(PERFORM_HASH_OF_FILE);
      if (hashed.sw !== SW_OK) {
        throw new CardError(
          'signature_failed',
          `hash of ${fidText(spec.fid)} answered ${swText(hashed.sw)}`,
        );
      }
    }

    const size = spec.size(app ?? NO_APPLICATION_YET);
    if (!Number.isInteger(size) || size < 1 || size > 0x7fff) {
      throw new CardError('protocol', `file ${fidText(spec.fid)} would be ${size} bytes`);
    }
    const data = new Uint8Array(size);
    let at = 0;
    while (at < size) {
      const want = Math.min(MAX_READ, size - at);
      const part = await send(readBinary(at, want));
      if (part.sw !== SW_OK || part.data.length === 0) {
        throw new CardError(
          'read_failed',
          `read of ${fidText(spec.fid)} at ${at} answered ${swText(part.sw)}`,
        );
      }
      if (part.data.length > want) {
        throw new CardError(
          'protocol',
          `read of ${fidText(spec.fid)} gave more than was asked for`,
        );
      }
      data.set(part.data, at);
      at += part.data.length;
    }

    records.push({ fid: spec.fid, appendix: DATA, data });
    let signed = false;
    if (spec.signed) {
      const signature = await send(COMPUTE_DIGITAL_SIGNATURE);
      if (signature.sw !== SW_OK) {
        throw new CardError(
          'signature_failed',
          `signature of ${fidText(spec.fid)} answered ${swText(signature.sw)}`,
        );
      }
      if (signature.data.length !== SIGNATURE_LENGTH) {
        throw new CardError(
          'signature_failed',
          `signature of ${fidText(spec.fid)} was ${signature.data.length} bytes`,
        );
      }
      records.push({ fid: spec.fid, appendix: SIGNATURE, data: signature.data });
      signed = true;
    }
    summaries.push({ fid: spec.fid, name: spec.name, bytes: size, signed, skipped: false });
    step++;
    return data;
  }

  try {
    checkStop();
    await reader.powerOn();

    for (const spec of ROOT_FILES) await readFile(spec, undefined);

    report('Tachograph application');
    const application = await send(selectApplication(TACHOGRAPH_AID));
    if (application.sw !== SW_OK) {
      throw new CardError(
        'not_driver_card',
        `application select answered ${swText(application.sw)}`,
      );
    }

    const identification = await readFile(APPLICATION_IDENTIFICATION, undefined);
    const app = identification === undefined ? undefined : parseAppIdentification(identification);
    if (app === undefined)
      throw new CardError('protocol', 'application identification could not be read');
    if (app.cardType !== 1) throw new CardError('not_driver_card', `card type ${app.cardType}`);

    for (const spec of APPLICATION_FILES) await readFile(spec, app);

    return { ddd: buildDdd(records), files: summaries, startedAt };
  } finally {
    await reader.powerOff().catch(() => undefined);
  }
}
