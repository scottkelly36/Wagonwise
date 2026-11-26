import {
  cardReadReducer,
  dddFileName,
  sizeText,
  summarise,
  withDelay,
  condenseLog,
  type CardReadState,
} from './card-flow';
import { downloadDriverCard } from './download-card';
import { SCENARIOS } from './scenarios';
import { SimulatedCard } from './simulated-card';

describe('cardReadReducer', () => {
  const idle: CardReadState = { status: 'idle' };

  it('goes idle, reading, then done or failed, and back', () => {
    const reading = cardReadReducer(idle, { type: 'start' });
    expect(reading.status).toBe('reading');
    expect(
      cardReadReducer(reading, { type: 'progress', step: 3, steps: 16, file: 'Faults' }),
    ).toEqual({
      status: 'reading',
      step: 3,
      steps: 16,
      file: 'Faults',
    });
    expect(cardReadReducer(reading, { type: 'failed', message: 'x' })).toEqual({
      status: 'failed',
      message: 'x',
    });
    expect(cardReadReducer(reading, { type: 'reset' })).toEqual(idle);
  });

  it('ignores a late progress report once the read is over', () => {
    const failed: CardReadState = { status: 'failed', message: 'x' };
    expect(cardReadReducer(failed, { type: 'progress', step: 1, steps: 2, file: 'a' })).toBe(
      failed,
    );
    expect(cardReadReducer(idle, { type: 'progress', step: 1, steps: 2, file: 'a' })).toBe(idle);
  });
});

describe('summarise', () => {
  it('counts the parts and sizes, and names the file like a download tool would', async () => {
    const result = await downloadDriverCard(new SimulatedCard(), {
      now: () => new Date('2026-11-26T10:05:00Z'),
    });
    const summary = summarise(result);
    expect(summary.fileName).toBe('C_20261126_1005.DDD');
    expect(summary.totalBytes).toBe(result.ddd.length);
    expect(summary.files).toHaveLength(16);
    expect(summary.signedCount).toBe(11);
    expect(summary.skippedCount).toBe(0);
  });

  it('counts a skipped optional file', async () => {
    const older = SCENARIOS.find((s) => s.id === 'older');
    const summary = summarise(await downloadDriverCard(new SimulatedCard(older?.options)));
    expect(summary.skippedCount).toBe(1);
    expect(summary.signedCount).toBe(10);
  });
});

describe('dddFileName', () => {
  it('uses UK time, across the clocks changing', () => {
    expect(dddFileName(new Date('2026-06-30T23:30:00Z'))).toBe('C_20260701_0030.DDD');
    expect(dddFileName(new Date('2026-12-31T00:00:00Z'))).toBe('C_20261231_0000.DDD');
  });
});

describe('sizeText', () => {
  it('reads sizes as a person would', () => {
    expect(sizeText(500)).toBe('500 B');
    expect(sizeText(24_782)).toBe('25 KB');
    expect(sizeText(2_400_000)).toBe('2.4 MB');
  });
});

describe('withDelay', () => {
  it('leaves a reader alone at zero, and waits before each command otherwise', async () => {
    const card = new SimulatedCard();
    expect(withDelay(card, 0)).toBe(card);
    jest.useFakeTimers();
    try {
      const slow = withDelay(card, 50);
      let on = false;
      const pending = slow.powerOn().then(() => {
        on = true;
      });
      await jest.advanceTimersByTimeAsync(49);
      expect(on).toBe(false);
      await jest.advanceTimersByTimeAsync(2);
      await pending;
      expect(on).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('the pretend cards', () => {
  it('each end the way they say they will', async () => {
    const outcomes: Record<string, string> = {};
    for (const s of SCENARIOS) {
      try {
        await downloadDriverCard(new SimulatedCard(s.options));
        outcomes[s.id] = 'read';
      } catch (error) {
        outcomes[s.id] = (error as { code?: string }).code ?? 'other';
      }
    }
    expect(outcomes).toEqual({
      good: 'read',
      t0: 'read',
      older: 'read',
      none: 'no_card',
      removed: 'card_removed',
      workshop: 'not_driver_card',
      unsigned: 'signature_failed',
      damaged: 'file_missing',
    });
  });
});

describe('condenseLog', () => {
  it('leaves a short log alone', () => {
    expect(condenseLog(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('keeps the start and the end of a long one and says how much it left out', () => {
    const lines = Array.from({ length: 1000 }, (_, i) => String(i));
    const out = condenseLog(lines, 10);
    expect(out).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '... 990 lines left out ...',
      '995',
      '996',
      '997',
      '998',
      '999',
    ]);
  });
});
