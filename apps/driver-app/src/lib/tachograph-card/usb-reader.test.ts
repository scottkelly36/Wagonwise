import { toBase64 } from './base64';
import { downloadDriverCard } from './download-card';
import { CardError } from './errors';
import { fakeDescriptors, FakeCcidReader } from './fake-ccid-reader';
import { SimulatedCard, type SimulatedCardOptions } from './simulated-card';
import {
  createUsbReaderProvider,
  type UsbCardReaderNative,
  type UsbDeviceInfo,
} from './usb-reader';

const READER: UsbDeviceInfo = {
  name: '/dev/bus/usb/001/002',
  vendorId: 0x072f,
  productId: 0x1205,
  product: 'Pretend reader',
  interfaceClasses: [0x0b],
  isCardReader: true,
  hasPermission: true,
};

/** The native module, played by a pretend reader. */
function fakeNative(
  options: {
    devices?: UsbDeviceInfo[];
    granted?: boolean;
    card?: SimulatedCardOptions;
    failOpen?: { code: string };
  } = {},
) {
  const fake = new FakeCcidReader(new SimulatedCard(options.card), { level: 'apdu' });
  const state = { closed: 0, detach: undefined as (() => void) | undefined, removed: 0 };
  const native: UsbCardReaderNative = {
    listDevices: () => options.devices ?? [READER],
    requestPermission: async () => options.granted ?? true,
    open: async () => {
      if (options.failOpen !== undefined) {
        throw Object.assign(new Error('nope'), { code: options.failOpen.code });
      }
      return {
        descriptors: toBase64(fakeDescriptors(0x20000 | 0x2)),
        vendorId: READER.vendorId,
        productId: READER.productId,
        product: READER.product,
        maxPacketIn: 64,
        maxPacketOut: 64,
      };
    },
    write: (data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      return fake.write(bytes);
    },
    read: async () => {
      const chunk = await fake.read();
      return btoa(String.fromCharCode(...chunk));
    },
    close: () => {
      state.closed++;
    },
    addListener: (_event, listener) => {
      state.detach = listener;
      return {
        remove: () => {
          state.removed++;
        },
      };
    },
  };
  return { native, state };
}

const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'no error';
  } catch (error) {
    return error instanceof CardError ? error.code : String(error);
  }
};

describe('the USB reader provider', () => {
  it('finds the reader and reads a whole card through it, then hands the reader back', async () => {
    const { native, state } = fakeNative();
    const log: string[] = [];
    const provider = createUsbReaderProvider(native, (l) => log.push(l));
    expect(await provider.available()).toBe(true);
    const result = await downloadDriverCard(await provider.open());
    expect(result.files).toHaveLength(16);
    expect(state.closed).toBe(1);
    expect(state.removed).toBe(1);
    const text = log.join('\n');
    expect(text).toContain('072f:1205');
    expect(text).toContain('reader works at apdu level');
    expect(text).not.toMatch(/SIMULATED/);
  });

  it('says there is no reader when none is plugged in, and lists what the phone did see', async () => {
    const keyboard: UsbDeviceInfo = {
      ...READER,
      name: 'kbd',
      vendorId: 1,
      productId: 2,
      interfaceClasses: [3],
      isCardReader: false,
    };
    const { native } = fakeNative({ devices: [keyboard] });
    const log: string[] = [];
    const provider = createUsbReaderProvider(native, (l) => log.push(l));
    expect(await provider.available()).toBe(false);
    expect(await code(provider.open())).toBe('no_reader');
    expect(log.join('\n')).toContain('0001:0002 classes 3');
  });

  it('asks for permission when it has none, and says so when refused', async () => {
    const { native } = fakeNative({
      devices: [{ ...READER, hasPermission: false }],
      granted: false,
    });
    expect(await code(createUsbReaderProvider(native).open())).toBe('no_permission');
    const ok = fakeNative({ devices: [{ ...READER, hasPermission: false }], granted: true });
    const reader = await createUsbReaderProvider(ok.native).open();
    await reader.powerOff();
  });

  it('turns what the phone throws into something to tell the driver', async () => {
    const noPermission = fakeNative({ failOpen: { code: 'ERR_NO_PERMISSION' } });
    expect(await code(createUsbReaderProvider(noPermission.native).open())).toBe('no_permission');
    const gone = fakeNative({ failOpen: { code: 'ERR_NO_DEVICE' } });
    expect(await code(createUsbReaderProvider(gone.native).open())).toBe('no_reader');
    const other = fakeNative({ failOpen: { code: 'ERR_CLAIM' } });
    expect(await code(createUsbReaderProvider(other.native).open())).toBe('read_failed');
  });

  it('stops with a clear answer when the reader is unplugged part way', async () => {
    const { native, state } = fakeNative();
    const reader = await createUsbReaderProvider(native).open();
    await reader.powerOn();
    state.detach?.();
    expect(await code(reader.transmit(Uint8Array.from([0, 0xa4, 2, 0xc, 2, 0, 2])))).toBe(
      'no_reader',
    );
  });

  it('reports no card when the slot is empty', async () => {
    const { native } = fakeNative({ card: { noCard: true } });
    const reader = await createUsbReaderProvider(native).open();
    // The pretend reader here does not model an empty slot's status; powering on fails the way a real empty slot does.
    expect(await code(reader.powerOn())).toBe('no_card');
  });
});
