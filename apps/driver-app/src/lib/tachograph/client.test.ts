import { readSnapshot, TachographClient, TachographError } from './client';
import type { ItemDids } from './items';
import { SimulatedVu } from './simulator';
import type { TachographSnapshot } from './snapshot';
import { tachographToHoursStatus } from './to-hours-status';
import { NRC, readDataByIdentifierReply } from './uds';

/**
 * Made-up identifiers for the tests. The real ones are not known yet (see items.ts), so nothing here says what a real unit uses.
 */
const TEST_DIDS: ItemDids = {
  workingState: 0x1001,
  continuousDrivingTime: 0x1002,
  cumulativeBreakTime: 0x1003,
  currentActivityDuration: 0x1004,
  currentDailyDrivingTime: 0x1005,
  currentWeeklyDrivingTime: 0x1006,
  previousAndCurrentWeekDrivingTime: 0x1007,
};

const now = Date.UTC(2026, 9, 10, 10, 0);
const midShift: TachographSnapshot = {
  at: now,
  consent: 'given',
  workingState: 'drive',
  continuousDrivingMin: 150,
  cumulativeBreakMin: 0,
  currentActivityMin: 75,
  dailyDrivingMin: 200,
  weeklyDrivingMin: 1500,
  previousAndCurrentWeekDrivingMin: 3000,
};

async function connected(options: ConstructorParameters<typeof SimulatedVu>[0] = {}, window = 16) {
  const vu = new SimulatedVu(options);
  const client = new TachographClient(vu.link, { receiveWindow: window, timeoutMs: 500 });
  await client.open();
  return { vu, client };
}

describe('reading a simulated tachograph', () => {
  it('opens the connection, reads every item and gets back what the unit holds', async () => {
    const { vu, client } = await connected();
    vu.show(midShift, TEST_DIDS);
    const snapshot = await readSnapshot(client, TEST_DIDS, now);
    expect(snapshot).toEqual({ ...midShift, refused: undefined });
    await client.close();
  });

  it('feeds the driving-hours status the clock already understands', async () => {
    const { vu, client } = await connected();
    vu.show(midShift, TEST_DIDS);
    const snapshot = await readSnapshot(client, TEST_DIDS, now);
    const hours = tachographToHoursStatus(snapshot, { rules: 'assimilated_eu' });
    expect(hours.ok && hours.status.next).toBe('break');
    expect(hours.ok && Math.round(hours.status.drivingLeftMs / 60_000)).toBe(120);
  });

  it('works with a small window of credits, topping it up as packets arrive', async () => {
    // Two credits each way, and a reply of several packets: nothing stalls and nothing is lost.
    const { vu, client } = await connected({ credits: 2, attMtu: 23 }, 2);
    const long = Uint8Array.from({ length: 100 }, (_, i) => i);
    vu.setItem(0x2000, long);
    const reply = await client.request(Uint8Array.of(0x22, 0x20, 0x00));
    expect(Array.from(reply)).toEqual(Array.from(readDataByIdentifierReply(0x2000, long)));
  });

  it('copes with a bigger agreed MTU', async () => {
    const { vu, client } = await connected({ attMtu: 247 });
    vu.show(midShift, TEST_DIDS);
    expect((await readSnapshot(client, TEST_DIDS, now)).continuousDrivingMin).toBe(150);
  });

  it('waits through "still working" for the real answer', async () => {
    const { vu, client } = await connected();
    vu.show(midShift, TEST_DIDS);
    vu.answerPendingFirst(TEST_DIDS.continuousDrivingTime as number);
    const snapshot = await readSnapshot(client, TEST_DIDS, now);
    expect(snapshot.continuousDrivingMin).toBe(150);
  });

  it('says consent is withheld when the unit refuses the personal data, and keeps what it refused', async () => {
    const { vu, client } = await connected();
    vu.show(midShift, TEST_DIDS);
    for (const did of Object.values(TEST_DIDS)) vu.deny(did, NRC.securityAccessDenied);
    const snapshot = await readSnapshot(client, TEST_DIDS, now);
    expect(snapshot.consent).toBe('withheld');
    expect(snapshot.continuousDrivingMin).toBeUndefined();
    expect(snapshot.refused?.continuousDrivingTime).toBe(NRC.securityAccessDenied);
    expect(tachographToHoursStatus(snapshot, { rules: 'assimilated_eu' }).ok).toBe(false);
  });

  it('only asks for the items it knows the identifier of, and says what the unit left out', async () => {
    const { vu, client } = await connected();
    const partial: ItemDids = {
      workingState: 0x1001,
      continuousDrivingTime: 0x1002,
    };
    vu.show(midShift, partial);
    const snapshot = await readSnapshot(client, partial, now);
    expect(snapshot.continuousDrivingMin).toBe(150);
    expect(snapshot.dailyDrivingMin).toBeUndefined();
    const hours = tachographToHoursStatus(snapshot, { rules: 'assimilated_eu' });
    expect(hours.ok).toBe(false);
  });

  it('reports an item the unit has no identifier for as unavailable rather than inventing it', async () => {
    const { client } = await connected();
    const snapshot = await readSnapshot(client, { workingState: 0x1001 }, now);
    // The unit has nothing at that identifier: refused as out of range, and nothing answered.
    expect(snapshot.refused?.workingState).toBe(NRC.requestOutOfRange);
    expect(snapshot.consent).toBe('unknown');
  });
});

describe('the connection', () => {
  it('fails clearly when the unit refuses it', async () => {
    const vu = new SimulatedVu({ refuse: true });
    const client = new TachographClient(vu.link, { timeoutMs: 500 });
    await expect(client.open()).rejects.toMatchObject({ code: 'rejected' });
    await expect(client.request(Uint8Array.of(1))).rejects.toBeInstanceOf(TachographError);
  });

  it('times out when the unit gives no credits', async () => {
    const quiet = {
      attMtu: 23,
      write: () => Promise.resolve(),
      subscribe: () => () => undefined,
    };
    const client = new TachographClient(quiet, { timeoutMs: 20 });
    await expect(client.open()).rejects.toMatchObject({ code: 'timeout' });
  });

  it('times out when a request is never answered', async () => {
    const { client } = await connected();
    // Nothing is held at this identifier and the unit refuses it, so use a link that swallows the request instead.
    const silent = new TachographClient(
      {
        attMtu: 23,
        write: (c) => Promise.resolve(void c),
        subscribe: (handler) => {
          // Give the client credits as soon as it is opened, then say nothing more.
          setTimeout(() => handler('credits', Uint8Array.of(8)), 0);
          return () => undefined;
        },
      },
      { timeoutMs: 30 },
    );
    await silent.open();
    await expect(silent.request(Uint8Array.of(0x22, 0, 1))).rejects.toMatchObject({
      code: 'timeout',
    });
    await client.close();
  });

  it('cannot be used before it is open or after it is closed, and closing twice is harmless', async () => {
    const vu = new SimulatedVu();
    const client = new TachographClient(vu.link, { timeoutMs: 200 });
    await expect(client.request(Uint8Array.of(1))).rejects.toMatchObject({ code: 'protocol' });
    await client.open();
    await client.close();
    await client.close();
    await expect(client.request(Uint8Array.of(1))).rejects.toMatchObject({ code: 'closed' });
  });
});
