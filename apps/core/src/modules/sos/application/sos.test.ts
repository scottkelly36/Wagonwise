import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { CompanyId, DriverId } from '../domain/sos.js';
import type { DriverSituation, OfficeContact, StaffCaller } from './ports.js';
import {
  cancelSos,
  listSos,
  pruneClosedSos,
  raiseSos,
  resolveSos,
  sendAlertEmails,
  sendCancelledEmails,
  type MailDeps,
  type SosDeps,
} from './sos.js';
import { InMemorySosRepository } from './testing/in-memory-sos-repository.js';

const acme = makeId<'CompanyId'>('11111111-1111-4111-8111-111111111111');
const beta = makeId<'CompanyId'>('22222222-2222-4222-8222-222222222222');
const pat = makeId<'DriverId'>('driver-pat');
const lee = makeId<'DriverId'>('driver-lee');
const here = { lat: 54.97, lon: -2.1 };
const request = '33333333-3333-4333-8333-333333333333';

const onAJob: DriverSituation = {
  name: 'Pat Smith',
  contact: '+447700900123',
  companies: [
    {
      id: acme,
      name: 'Acme Haulage',
      vehicle: { name: 'Scania R450', registration: 'AB12 CDE' },
      jobReference: 'JOB-77',
    },
  ],
};
const twoCompanies: DriverSituation = {
  name: 'Pat Smith',
  contact: '+447700900123',
  companies: [
    { id: acme, name: 'Acme Haulage' },
    { id: beta, name: 'Beta Transport' },
  ],
};
const solo: DriverSituation = { name: 'Pat Smith', contact: '+447700900123', companies: [] };

function setup(
  situation: DriverSituation,
  options: { words?: 'works' | 'down' | 'slow'; people?: Record<string, OfficeContact[]> } = {},
) {
  const repo = new InMemorySosRepository();
  const clock = new FakeClock('2026-10-25T10:00:00.000Z');
  const sent: { to: string; subject: string; text: string }[] = [];
  const asked: unknown[] = [];
  const sos: SosDeps = {
    repo,
    clock,
    ids: new SequentialIdGenerator(),
    situations: {
      forDriver: (driverId: DriverId, identifier: string) => {
        asked.push({ driverId, identifier });
        return Promise.resolve(situation);
      },
    },
    words: {
      wordsFor: () =>
        options.words === 'down'
          ? Promise.reject(new Error('offline'))
          : options.words === 'slow'
            ? new Promise(() => undefined)
            : Promise.resolve({
                words: 'filled.count.soap',
                nearestPlace: 'Hexham, Northumberland',
              }),
    },
    wordsTimeoutMs: 20,
  };
  const people = options.people ?? {
    [acme]: [
      { name: 'Dee Dispatcher', email: 'dee@acme.test', privileges: ['dispatch'] },
      { name: 'Vic Viewer', email: 'vic@acme.test', privileges: [] },
    ],
    [beta]: [{ name: 'Bo Boss', email: 'bo@beta.test', privileges: [] }],
  };
  const mail: MailDeps = {
    contacts: { forCompany: (id: CompanyId) => Promise.resolve(people[id] ?? []) },
    mailer: {
      send: (to, subject, text) => {
        if (to.startsWith('broken@')) return Promise.reject(new Error('mailbox full'));
        sent.push({ to, subject, text });
        return Promise.resolve();
      },
    },
    portalUrl: 'https://portal.example.com',
  };
  return { sos, mail, repo, clock, sent, asked };
}

const press = (deps: SosDeps, driverId: DriverId = pat, requestId = request) =>
  raiseSos(deps, { driverId, identifier: 'pat-login', requestId, location: here });

describe('raiseSos', () => {
  it('tells the company of the job the driver is on, with the lorry, the job and the three words', async () => {
    const { sos, repo } = setup(onAJob);
    const raised = await press(sos);
    expect(raised).toMatchObject({
      requestId: request,
      location: here,
      words: 'filled.count.soap',
      nearestPlace: 'Hexham, Northumberland',
      notified: [{ companyId: acme, name: 'Acme Haulage' }],
    });
    expect(raised.made).toHaveLength(1);
    const stored = await repo.listForCompany(acme, 'open', 10);
    expect(stored[0]).toMatchObject({
      driverName: 'Pat Smith',
      driverContact: '+447700900123',
      vehicleName: 'Scania R450',
      vehicleRegistration: 'AB12 CDE',
      jobReference: 'JOB-77',
      words: 'filled.count.soap',
      status: 'open',
    });
  });

  it('tells every company a driver with no job drives for', async () => {
    const { sos, repo } = setup(twoCompanies);
    const raised = await press(sos);
    expect(raised.notified.map((n) => n.name)).toEqual(['Acme Haulage', 'Beta Transport']);
    expect(await repo.listForCompany(acme, 'open', 10)).toHaveLength(1);
    expect(await repo.listForCompany(beta, 'open', 10)).toHaveLength(1);
  });

  it('stores and sends nothing for a driver with no company, but still gives them their three words', async () => {
    const { sos, mail, repo, sent } = setup(solo);
    const raised = await press(sos);
    expect(raised).toMatchObject({ words: 'filled.count.soap', notified: [], made: [] });
    expect(await sendAlertEmails(mail, raised.made)).toEqual({ sent: 0, failed: 0 });
    expect(sent).toEqual([]);
    expect(await repo.findByRequest(request, pat)).toEqual([]);
  });

  it('still tells the office, with the position, when the three words are down or slow', async () => {
    for (const words of ['down', 'slow'] as const) {
      const { sos } = setup(onAJob, { words });
      const raised = await press(sos);
      expect(raised.words).toBeUndefined();
      expect(raised.made[0]).toMatchObject({ location: here, words: undefined });
    }
  });

  it('a retry of the same press makes no second alert and tells nobody twice', async () => {
    const { sos, repo } = setup(onAJob);
    await press(sos);
    const again = await press(sos);
    expect(again.made).toEqual([]);
    expect(again).toMatchObject({
      words: 'filled.count.soap',
      notified: [{ name: 'Acme Haulage' }],
    });
    expect(await repo.listForCompany(acme, 'all', 10)).toHaveLength(1);
  });
});

describe('sendAlertEmails', () => {
  it('emails the people who dispatch, with who, where, how to ring them and what WagonWise did not do', async () => {
    const { sos, mail, sent } = setup(onAJob);
    const raised = await press(sos);
    expect(await sendAlertEmails(mail, raised.made)).toEqual({ sent: 1, failed: 0 });
    expect(sent.map((m) => m.to)).toEqual(['dee@acme.test']);
    const email = sent[0]!;
    expect(email.subject).toBe('SOS: Pat Smith (Scania R450 AB12 CDE)');
    for (const part of [
      '///filled.count.soap, near Hexham, Northumberland',
      'Ring the driver: +447700900123',
      'Vehicle: Scania R450 AB12 CDE',
      'Job: JOB-77',
      'https://www.openstreetmap.org/?mlat=54.97&mlon=-2.1',
      'WagonWise has not contacted the emergency services',
      'https://portal.example.com',
    ]) {
      expect(email.text).toContain(part);
    }
  });

  it('emails everyone the company has when nobody there dispatches, so it never goes nowhere', async () => {
    const { sos, mail, sent } = setup(twoCompanies);
    const raised = await press(sos);
    await sendAlertEmails(mail, raised.made);
    expect(sent.map((m) => m.to).sort()).toEqual(['bo@beta.test', 'dee@acme.test']);
  });

  it('gives the coordinates when there are no three words', async () => {
    const { sos, mail, sent } = setup(onAJob, { words: 'down' });
    await sendAlertEmails(mail, (await press(sos)).made);
    expect(sent[0]?.text).toContain('Position: 54.97000, -2.10000');
  });

  it('counts an email that fails, and carries on with the others', async () => {
    const { sos, mail, sent } = setup(onAJob, {
      people: {
        [acme]: [
          { name: 'Gone', email: 'broken@acme.test', privileges: ['dispatch'] },
          { name: 'Dee', email: 'dee@acme.test', privileges: ['dispatch'] },
        ],
      },
    });
    expect(await sendAlertEmails(mail, (await press(sos)).made)).toEqual({ sent: 1, failed: 1 });
    expect(sent.map((m) => m.to)).toEqual(['dee@acme.test']);
  });

  it('does not throw when the company has nobody to email', async () => {
    const { sos, mail } = setup(onAJob, { people: {} });
    expect(await sendAlertEmails(mail, (await press(sos)).made)).toEqual({ sent: 0, failed: 0 });
  });
});

describe('cancelSos', () => {
  it('cancels the driver’s open alerts, tells the office, and cancelling again does nothing more', async () => {
    const { sos, mail, repo, sent } = setup(onAJob);
    await press(sos);
    const cancelled = await cancelSos(sos, { driverId: pat, requestId: request });
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).toMatchObject({ status: 'cancelled' });
    await sendCancelledEmails(mail, cancelled);
    expect(sent[0]?.subject).toBe('SOS cancelled: Pat Smith');
    expect(await repo.listForCompany(acme, 'open', 10)).toEqual([]);
    expect(await cancelSos(sos, { driverId: pat, requestId: request })).toEqual([]);
  });

  it('only cancels the driver’s own press', async () => {
    const { sos, repo } = setup(onAJob);
    await press(sos);
    expect(await cancelSos(sos, { driverId: lee, requestId: request })).toEqual([]);
    expect(await repo.listForCompany(acme, 'open', 10)).toHaveLength(1);
  });
});

const staffId = makeId<'StaffId'>('staff-1');
const dispatcher: StaffCaller = { kind: 'fleet', companyId: acme, privileges: ['dispatch'] };
const viewer: StaffCaller = { kind: 'fleet', companyId: acme, privileges: [] };
const otherCompany: StaffCaller = { kind: 'fleet', companyId: beta, privileges: ['dispatch'] };
const admin: StaffCaller = { kind: 'platform' };

describe('the office', () => {
  it('lists its own open alerts, and all of them when asked', async () => {
    const { sos } = setup(twoCompanies);
    await press(sos);
    await cancelSos(sos, { driverId: pat, requestId: request });
    await press(sos, pat, '44444444-4444-4444-8444-444444444444');
    const open = await listSos(sos, { actor: viewer, status: 'open' });
    expect(open.ok && open.value).toHaveLength(1);
    const all = await listSos(sos, { actor: viewer, status: 'all' });
    expect(all.ok && all.value).toHaveLength(2);
    const theirs = await listSos(sos, { actor: otherCompany, status: 'open' });
    expect(theirs.ok && theirs.value.map((a) => a.companyId)).toEqual([beta]);
  });

  it('offers WagonWise staff nothing, since they have no company here', async () => {
    const { sos } = setup(onAJob);
    expect(await listSos(sos, { actor: admin, status: 'open' })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
  });

  it('lets a dispatcher resolve an alert, and says who and when', async () => {
    const { sos, repo, clock } = setup(onAJob);
    const raised = await press(sos);
    const id = raised.made[0]!.id;
    clock.advance(60_000);
    expect(await resolveSos(sos, { actor: dispatcher, staffId, id })).toEqual({
      ok: true,
      value: undefined,
    });
    expect(await repo.findById(id)).toMatchObject({
      status: 'resolved',
      resolvedBy: staffId,
      resolvedAt: new Date('2026-10-25T10:01:00.000Z'),
    });
    // Resolving again is harmless.
    expect((await resolveSos(sos, { actor: dispatcher, staffId, id })).ok).toBe(true);
  });

  it('refuses someone who cannot dispatch, another company’s staff, WagonWise staff, and an unknown alert', async () => {
    const { sos } = setup(onAJob);
    const id = (await press(sos)).made[0]!.id;
    expect(await resolveSos(sos, { actor: viewer, staffId, id })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await resolveSos(sos, { actor: admin, staffId, id })).toEqual({
      ok: false,
      error: { tag: 'Forbidden' },
    });
    expect(await resolveSos(sos, { actor: otherCompany, staffId, id })).toEqual({
      ok: false,
      error: { tag: 'SosNotFound' },
    });
    expect(
      await resolveSos(sos, { actor: dispatcher, staffId, id: makeId<'SosAlertId'>('nope') }),
    ).toEqual({ ok: false, error: { tag: 'SosNotFound' } });
  });
});

describe('pruneClosedSos', () => {
  it('deletes closed alerts past the retention and never an open one', async () => {
    const { sos, clock, repo } = setup(twoCompanies);
    await press(sos); // two alerts
    const first = (await repo.listForCompany(acme, 'open', 10))[0]!;
    await resolveSos(sos, { actor: dispatcher, staffId, id: first.id });
    clock.advance(40 * 24 * 60 * 60 * 1000);
    expect(await pruneClosedSos(sos, 30)).toBe(1);
    expect(await repo.listForCompany(acme, 'all', 10)).toEqual([]);
    expect(await repo.listForCompany(beta, 'open', 10)).toHaveLength(1);
  });
});
