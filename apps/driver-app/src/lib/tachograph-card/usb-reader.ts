import { requireOptionalNativeModule } from 'expo';

import { fromBase64, toBase64 } from './base64';
import { CcidReader, hex, parseCcidDescriptor, type CcidInfo, type UsbTransport } from './ccid';
import { CardError } from './errors';
import type { CardReader, CardReaderProvider } from './reader';

/** One USB device the phone can see. */
export interface UsbDeviceInfo {
  readonly name: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly product: string | null;
  readonly interfaceClasses: readonly number[];
  readonly isCardReader: boolean;
  readonly hasPermission: boolean;
}

export interface OpenedUsbReader {
  /** The device's raw USB descriptors, as base64. */
  readonly descriptors: string;
  readonly vendorId: number;
  readonly productId: number;
  readonly product: string | null;
  readonly maxPacketIn: number;
  readonly maxPacketOut: number;
}

/** What the native module (modules/usb-card-reader) offers. Raw USB only: what the bytes mean is `ccid.ts`. */
export interface UsbCardReaderNative {
  listDevices(): UsbDeviceInfo[];
  requestPermission(name: string): Promise<boolean>;
  open(name: string): Promise<OpenedUsbReader>;
  write(dataBase64: string, timeoutMs: number): Promise<void>;
  /** One transfer as base64; an empty string when nothing came in time. */
  read(timeoutMs: number): Promise<string>;
  close(): void;
  addListener(event: 'onDetached', listener: () => void): { remove(): void };
}

/** The native module, or `null` in a build that does not have it (a store build, iOS, or a JavaScript-only update on an old build). */
export function usbReaderNative(): UsbCardReaderNative | null {
  return requireOptionalNativeModule<UsbCardReaderNative>('UsbCardReader');
}

/** Whether this build can talk to a USB card reader at all. */
export function usbReaderSupported(): boolean {
  return usbReaderNative() !== null;
}

const WRITE_TIMEOUT_MS = 5000;

function vidPid(device: { vendorId: number; productId: number }): string {
  const h = (n: number) => n.toString(16).padStart(4, '0');
  return `${h(device.vendorId)}:${h(device.productId)}`;
}

/** Turns anything the native module throws into something the screen can explain. */
function asCardError(error: unknown): CardError {
  if (error instanceof CardError) return error;
  const text = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  if (code === 'ERR_NOT_OPEN' || code === 'ERR_NO_DEVICE') {
    return new CardError('no_reader', text);
  }
  if (code === 'ERR_NO_PERMISSION') return new CardError('no_permission', text);
  return new CardError('read_failed', text);
}

/**
 * The real card reader: a USB reader plugged into the phone, found, permitted and opened through the native module, speaking the
 * standard card-reader protocol (`ccid.ts`) to the download code. `log` is told what the phone and reader said (device numbers,
 * descriptors, status words and sizes; never what is on the card) so a first run on a real reader can be understood afterwards.
 */
export function createUsbReaderProvider(
  native: UsbCardReaderNative,
  log: (line: string) => void = () => undefined,
): CardReaderProvider {
  const readers = (): UsbDeviceInfo[] => native.listDevices().filter((d) => d.isCardReader);
  return {
    available: async () => readers().length > 0,
    open: async (): Promise<CardReader> => {
      const all = native.listDevices();
      log(
        all.length === 0
          ? 'the phone sees no USB devices'
          : `the phone sees: ${all.map((d) => `${vidPid(d)} classes ${d.interfaceClasses.join(',')}`).join('; ')}`,
      );
      const device = all.find((d) => d.isCardReader);
      if (device === undefined) throw new CardError('no_reader', 'no USB card reader plugged in');
      if (!device.hasPermission) {
        log('asking the driver for permission to use the reader');
        let granted: boolean;
        try {
          granted = await native.requestPermission(device.name);
        } catch (error) {
          throw asCardError(error);
        }
        if (!granted) {
          throw new CardError('no_permission', 'permission to use the reader was refused');
        }
      }
      let opened: OpenedUsbReader;
      try {
        opened = await native.open(device.name);
      } catch (error) {
        throw asCardError(error);
      }
      const raw = fromBase64(opened.descriptors);
      log(
        `opened ${vidPid(opened)}${opened.product === null ? '' : ` "${opened.product}"`}, packets in ${opened.maxPacketIn} out ${opened.maxPacketOut}`,
      );
      log(`descriptors: ${hex(raw)}`);
      const info: CcidInfo | undefined = parseCcidDescriptor(raw);
      if (info === undefined) {
        native.close();
        throw new CardError('protocol', 'the reader has no card-reader descriptor');
      }
      log(
        `reader works at ${info.level} level, protocols ${info.protocols}, features 0x${info.features.toString(16)}, max message ${info.maxMessageLength}`,
      );

      let unplugged = false;
      const subscription = native.addListener('onDetached', () => {
        unplugged = true;
        log('the reader was unplugged');
      });
      const transport: UsbTransport = {
        write: async (bytes) => {
          if (unplugged) throw new CardError('no_reader', 'the reader was unplugged');
          try {
            await native.write(toBase64(bytes), WRITE_TIMEOUT_MS);
          } catch (error) {
            throw asCardError(error);
          }
        },
        read: async (timeoutMs) => {
          if (unplugged) throw new CardError('no_reader', 'the reader was unplugged');
          try {
            return fromBase64(await native.read(timeoutMs));
          } catch (error) {
            throw asCardError(error);
          }
        },
      };
      const ccid = new CcidReader(transport, info, { log });
      return {
        powerOn: () => ccid.powerOn(),
        transmit: (command) => ccid.transmit(command),
        // The one read is over: turn the card off and hand the reader back so another app (or the next read) can have it.
        powerOff: async () => {
          await ccid.powerOff();
          subscription.remove();
          native.close();
        },
      };
    },
  };
}
