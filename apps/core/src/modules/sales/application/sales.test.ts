import { describe, expect, it } from 'vitest';
import { makeId } from '../../../shared/brand.js';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import {
  stageAfterEntry,
  type Prospect,
  type ProspectId,
  type SalesEntry,
  type SalesEntryId,
} from '../domain/sales.js';
import {
  addEntry,
  createProspect,
  deleteEntry,
  deleteProspect,
  importProspects,
  listSales,
  updateProspect,
  type SalesDeps,
  type SalesRepository,
  type StaffCaller,
} from './sales.js';

class InMemorySales implements SalesRepository {
  readonly prospects = new Map<string, Prospect>();
  readonly entries = new Map<string, SalesEntry>();

  listProspects(): Promise<Prospect[]> {
    return Promise.resolve([...this.prospects.values()]);
  }
  listEntries(): Promise<SalesEntry[]> {
    return Promise.resolve([...this.entries.values()]);
  }
  findProspect(id: ProspectId): Promise<Prospect | null> {
    return Promise.resolve(this.prospects.get(id) ?? null);
  }
  insertIfNew(p: Prospect): Promise<boolean> {
    if (this.#taken(p.name)) return Promise.resolve(false);
    this.prospects.set(p.id, p);
    return Promise.resolve(true);
  }
  nameTaken(name: string, exceptId?: ProspectId): Promise<boolean> {
    return Promise.resolve(this.#taken(name, exceptId));
  }
  update(p: Prospect): Promise<boolean> {
    if (!this.prospects.has(p.id)) return Promise.resolve(false);
    this.prospects.set(p.id, p);
    return Promise.resolve(true);
  }
  recordEntry(entry: SalesEntry, prospect: Prospect): Promise<void> {
    this.entries.set(entry.id, entry);
    this.prospects.set(prospect.id, prospect);
    return Promise.resolve();
  }
  deleteProspect(id: ProspectId): Promise<boolean> {
    for (const [key, e] of this.entries) if (e.prospectId === id) this.entries.delete(key);
    return Promise.resolve(this.prospects.delete(id));
  }
  deleteEntry(id: SalesEntryId): Promise<boolean> {
    return Promise.resolve(this.entries.delete(id));
  }
  #taken(name: string, exceptId?: ProspectId): boolean {
    return [...this.prospects.values()].some(
      (p) => p.name.toLowerCase() === name.toLowerCase() && p.id !== exceptId,
    );
  }
}

const ADMIN: StaffCaller = { kind: 'platform' };
const FLEET: StaffCaller = { kind: 'fleet', companyId: 'c1', privileges: ['manage_users'] };

function setup() {
  const sales = new InMemorySales();
  const clock = new FakeClock('2026-11-09T09:00:00.000Z');
  const deps: SalesDeps = { sales, ids: new SequentialIdGenerator(), clock };
  return { sales, deps, clock };
}

async function addFirm(deps: SalesDeps, name = 'Hubbuck Ltd', extra = {}): Promise<Prospect> {
  const result = await createProspect(deps, ADMIN, { name, ...extra });
  if (!result.ok) throw new Error(`could not add ${name}`);
  return result.value;
}

describe('stageAfterEntry', () => {
  it('moves a firm forward only', () => {
    expect(stageAfterEntry('not_contacted', 'sent')).toBe('contacted');
    expect(stageAfterEntry('contacted', 'replied')).toBe('replied');
    expect(stageAfterEntry('demo', 'sent')).toBe('demo');
    expect(stageAfterEntry('demo', 'replied')).toBe('demo');
    expect(stageAfterEntry('conversation', 'demo')).toBe('demo');
    expect(stageAfterEntry('paying', 'conversation')).toBe('paying');
  });

  it('always takes a no or an opt-out, and lets a firm that said no back in when it replies', () => {
    expect(stageAfterEntry('demo', 'not_interested')).toBe('not_interested');
    expect(stageAfterEntry('contacted', 'opted_out')).toBe('do_not_contact');
    expect(stageAfterEntry('not_interested', 'replied')).toBe('replied');
    expect(stageAfterEntry('not_interested', 'sent')).toBe('contacted');
  });
});

describe('who may use it', () => {
  it('refuses every use case to anyone but WagonWise staff', async () => {
    const { deps } = setup();
    const firm = await addFirm(deps);
    const forbidden = { ok: false, error: { tag: 'Forbidden' } };
    expect(await listSales(deps, FLEET)).toEqual(forbidden);
    expect(await createProspect(deps, FLEET, { name: 'Acme' })).toEqual(forbidden);
    expect(await updateProspect(deps, FLEET, firm.id, { town: 'Hexham' })).toEqual(forbidden);
    expect(await deleteProspect(deps, FLEET, firm.id)).toEqual(forbidden);
    expect(await addEntry(deps, FLEET, firm.id, { how: 'phone', result: 'sent' })).toEqual(
      forbidden,
    );
    expect(await deleteEntry(deps, FLEET, makeId<'SalesEntryId'>('x'))).toEqual(forbidden);
    expect(await importProspects(deps, FLEET, [{ name: 'Acme' }])).toEqual(forbidden);
  });
});

describe('adding and changing firms', () => {
  it('adds a firm with sensible defaults and tidies what was typed', async () => {
    const { deps } = setup();
    const firm = await addFirm(deps, '  Hubbuck Ltd ', { town: ' Hexham ', phone: '  ' });
    expect(firm).toMatchObject({
      name: 'Hubbuck Ltd',
      town: 'Hexham',
      phone: undefined,
      stage: 'not_contacted',
      legalForm: 'unknown',
      relationship: 'new',
    });
  });

  it('refuses a missing name, a bad number of lorries and a next-step date that is not a date', async () => {
    const { deps } = setup();
    expect(await createProspect(deps, ADMIN, { name: '  ' })).toMatchObject({
      ok: false,
      error: { tag: 'InvalidProspect', field: 'name' },
    });
    expect(await createProspect(deps, ADMIN, { name: 'A', fleetSize: -1 })).toMatchObject({
      error: { field: 'fleet_size' },
    });
    expect(
      await createProspect(deps, ADMIN, { name: 'A', nextStepOn: '2026-02-31' }),
    ).toMatchObject({
      error: { field: 'next_step_on' },
    });
  });

  it('will not list the same firm twice, in any case', async () => {
    const { deps } = setup();
    await addFirm(deps, 'Hubbuck Ltd');
    expect(await createProspect(deps, ADMIN, { name: 'HUBBUCK LTD' })).toEqual({
      ok: false,
      error: { tag: 'AlreadyListed' },
    });
  });

  it('changes the fields sent, clears one with null, and leaves the rest', async () => {
    const { deps } = setup();
    const firm = await addFirm(deps, 'Hubbuck Ltd', { town: 'Hexham', phone: '01434 602417' });
    const result = await updateProspect(deps, ADMIN, firm.id, { town: null, fleetSize: 4 });
    expect(result).toMatchObject({
      ok: true,
      value: { town: undefined, fleetSize: 4, phone: '01434 602417', name: 'Hubbuck Ltd' },
    });
  });

  it('will not rename a firm to one already listed', async () => {
    const { deps } = setup();
    await addFirm(deps, 'Hubbuck Ltd');
    const other = await addFirm(deps, 'Denham Ltd');
    expect(await updateProspect(deps, ADMIN, other.id, { name: 'hubbuck ltd' })).toEqual({
      ok: false,
      error: { tag: 'AlreadyListed' },
    });
  });

  it('says when the firm is not there', async () => {
    const { deps } = setup();
    expect(await updateProspect(deps, ADMIN, makeId<'ProspectId'>('nope'), {})).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
  });
});

describe('logging a contact', () => {
  it('records the entry, moves the stage and sets the next step together', async () => {
    const { deps, sales } = setup();
    const firm = await addFirm(deps);
    const result = await addEntry(deps, ADMIN, firm.id, {
      how: 'email',
      result: 'sent',
      pitch: 'checks',
      note: 'Sent the short message',
      nextStep: 'Follow up',
      nextStepOn: '2026-11-16',
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        prospect: { stage: 'contacted', nextStep: 'Follow up', nextStepOn: '2026-11-16' },
        entry: { how: 'email', result: 'sent', pitch: 'checks', note: 'Sent the short message' },
      },
    });
    expect(sales.entries.size).toBe(1);
    expect((await sales.findProspect(firm.id))?.stage).toBe('contacted');
  });

  it('stamps the entry now unless a day is given', async () => {
    const { deps, clock } = setup();
    const firm = await addFirm(deps);
    const now = await addEntry(deps, ADMIN, firm.id, { how: 'phone', result: 'sent' });
    const earlier = await addEntry(deps, ADMIN, firm.id, {
      how: 'phone',
      result: 'sent',
      at: new Date('2026-11-05T12:00:00.000Z'),
    });
    expect(now.ok && now.value.entry.at).toEqual(clock.now());
    expect(earlier.ok && earlier.value.entry.at).toEqual(new Date('2026-11-05T12:00:00.000Z'));
  });

  it('keeps the old next step when none is given, and clears it with null', async () => {
    const { deps } = setup();
    const firm = await addFirm(deps, 'Hubbuck Ltd', { nextStep: 'Ring', nextStepOn: '2026-11-10' });
    const kept = await addEntry(deps, ADMIN, firm.id, { how: 'phone', result: 'sent' });
    expect(kept.ok && kept.value.prospect.nextStep).toBe('Ring');
    const cleared = await addEntry(deps, ADMIN, firm.id, {
      how: 'phone',
      result: 'replied',
      nextStep: null,
      nextStepOn: null,
    });
    expect(cleared.ok && cleared.value.prospect).toMatchObject({
      nextStep: undefined,
      nextStepOn: undefined,
    });
  });

  it('refuses an unknown way, result or pitch, and a bad next-step date, and records nothing', async () => {
    const { deps, sales } = setup();
    const firm = await addFirm(deps);
    expect(
      await addEntry(deps, ADMIN, firm.id, { how: 'carrier pigeon', result: 'sent' }),
    ).toMatchObject({
      error: { tag: 'InvalidEntry', field: 'how' },
    });
    expect(await addEntry(deps, ADMIN, firm.id, { how: 'phone', result: 'won' })).toMatchObject({
      error: { field: 'result' },
    });
    expect(
      await addEntry(deps, ADMIN, firm.id, { how: 'phone', result: 'sent', pitch: 'magic' }),
    ).toMatchObject({ error: { field: 'pitch' } });
    expect(
      await addEntry(deps, ADMIN, firm.id, { how: 'phone', result: 'sent', nextStepOn: 'soon' }),
    ).toMatchObject({ error: { field: 'next_step_on' } });
    expect(sales.entries.size).toBe(0);
  });
});

describe('a firm that asked not to be contacted', () => {
  async function optedOut() {
    const ctx = setup();
    const firm = await addFirm(ctx.deps);
    await addEntry(ctx.deps, ADMIN, firm.id, { how: 'email', result: 'opted_out' });
    return { ...ctx, firm };
  }

  it('is marked do not contact by the entry that says so', async () => {
    const { sales, firm } = await optedOut();
    expect((await sales.findProspect(firm.id))?.stage).toBe('do_not_contact');
  });

  it('refuses a further entry, a move back into the pipeline, and deleting it', async () => {
    const { deps, firm, sales } = await optedOut();
    expect(await addEntry(deps, ADMIN, firm.id, { how: 'phone', result: 'sent' })).toEqual({
      ok: false,
      error: { tag: 'OptedOut' },
    });
    expect(await updateProspect(deps, ADMIN, firm.id, { stage: 'contacted' })).toEqual({
      ok: false,
      error: { tag: 'OptedOut' },
    });
    expect(await deleteProspect(deps, ADMIN, firm.id)).toEqual({
      ok: false,
      error: { tag: 'OptedOut' },
    });
    expect(sales.prospects.has(firm.id)).toBe(true);
  });

  it('can still have its contact details tidied away', async () => {
    const { deps, firm } = await optedOut();
    const result = await updateProspect(deps, ADMIN, firm.id, { phone: null, email: null });
    expect(result).toMatchObject({ ok: true, value: { stage: 'do_not_contact' } });
  });
});

describe('deleting', () => {
  it('removes a firm and its log', async () => {
    const { deps, sales } = setup();
    const firm = await addFirm(deps);
    await addEntry(deps, ADMIN, firm.id, { how: 'phone', result: 'sent' });
    expect(await deleteProspect(deps, ADMIN, firm.id)).toEqual({ ok: true, value: undefined });
    expect(sales.prospects.size).toBe(0);
    expect(sales.entries.size).toBe(0);
  });

  it('removes one entry and leaves the stage', async () => {
    const { deps, sales } = setup();
    const firm = await addFirm(deps);
    const added = await addEntry(deps, ADMIN, firm.id, { how: 'phone', result: 'sent' });
    if (!added.ok) throw new Error('not added');
    expect(await deleteEntry(deps, ADMIN, added.value.entry.id)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(sales.entries.size).toBe(0);
    expect((await sales.findProspect(firm.id))?.stage).toBe('contacted');
    expect(await deleteEntry(deps, ADMIN, added.value.entry.id)).toEqual({
      ok: false,
      error: { tag: 'NotFound' },
    });
  });
});

describe('importProspects', () => {
  it('adds the readable rows, reading the cells leniently, and never guesses the kind of business', async () => {
    const { deps, sales } = setup();
    const result = await importProspects(deps, ADMIN, [
      {
        name: 'Hubbuck Ltd',
        fleetSize: 'about 4',
        legalForm: 'Ltd.',
        relationship: 'Existing contact',
        phone: '01434 602417',
      },
      { name: 'E Dodd & Sons', fleetSize: 'not stated', legalForm: 'who knows' },
    ]);
    expect(result).toEqual({ ok: true, value: { added: 2, skipped: [] } });
    const [hubbuck, dodd] = [...sales.prospects.values()];
    expect(hubbuck).toMatchObject({ fleetSize: 4, legalForm: 'limited', relationship: 'warm' });
    expect(dodd).toMatchObject({ fleetSize: undefined, legalForm: 'unknown', relationship: 'new' });
  });

  it('skips a firm already listed, one repeated in the file and a row with no name, so a second import adds nothing', async () => {
    const { deps } = setup();
    const rows = [
      { name: 'Hubbuck Ltd' },
      { name: 'hubbuck ltd' },
      { name: '  ' },
      { name: 'Denham Ltd' },
    ];
    const first = await importProspects(deps, ADMIN, rows);
    expect(first).toEqual({
      ok: true,
      value: {
        added: 2,
        skipped: [
          { name: 'hubbuck ltd', reason: 'already_listed' },
          { name: '', reason: 'invalid' },
        ],
      },
    });
    const second = await importProspects(deps, ADMIN, rows);
    expect(second).toMatchObject({ ok: true, value: { added: 0 } });
  });
});
