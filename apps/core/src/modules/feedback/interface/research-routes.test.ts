import { RESEARCH_CONTACT_WORDING } from '@wagonwise/contracts/feedback';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../../../shared/testing/fake-clock.js';
import { RecordingDataScopes } from '../../../shared/testing/recording-data-scopes.js';
import { SequentialIdGenerator } from '../../../shared/testing/sequential-id-generator.js';
import type { StaffCaller } from '../application/review-feedback.js';
import { InMemoryFeedbackNoteRepository } from '../application/testing/in-memory-feedback-note-repository.js';
import { InMemoryResearchConsentRepository } from '../application/testing/in-memory-research-consent-repository.js';
import { registerFeedbackRoutes } from './routes.js';

const ADMIN = 'staff-admin';
const SAM = 'staff-sam';
const PAT = 'staff-pat';
const people: Record<string, StaffCaller> = {
  [ADMIN]: { kind: 'platform' },
  [SAM]: { kind: 'fleet', companyId: 'company-acme', privileges: ['manage_users'] },
  [PAT]: { kind: 'fleet', companyId: 'company-beta', privileges: ['dispatch'] },
};
const labels = new Map([
  [SAM, { name: 'Sam Boss', email: 'sam@acme.test', companyName: 'Acme Haulage' }],
  [PAT, { name: 'Pat Other', email: 'pat@beta.test', companyName: 'Beta Freight' }],
]);

function buildApp(enabled = true) {
  const consent = new InMemoryResearchConsentRepository();
  const scopes = new RecordingDataScopes();
  const clock = new FakeClock('2026-11-23T10:00:00.000Z');
  const notes = new InMemoryFeedbackNoteRepository();
  const app: FastifyInstance = Fastify();
  app.addHook('onRequest', (request, _reply, done) => {
    const staffId = request.headers['x-test-staff-id'];
    if (typeof staffId === 'string') request.staffId = staffId;
    done();
  });
  registerFeedbackRoutes(app, {
    submitFeedback: { repo: notes, clock, ids: new SequentialIdGenerator() },
    review: { repo: notes, clock, labels: { labelsFor: () => Promise.resolve(new Map()) } },
    callerDirectory: { getCaller: (id) => Promise.resolve(people[id] ?? null) },
    dataScopes: scopes,
    research: {
      repo: consent,
      labels: {
        describe: (ids) =>
          Promise.resolve(
            new Map(ids.flatMap((id) => (labels.has(id) ? [[id, labels.get(id)!] as const] : []))),
          ),
      },
      clock,
      ids: new SequentialIdGenerator(),
      enabled,
      wordingVersion: RESEARCH_CONTACT_WORDING.version,
    },
  });
  const as = (staffId: string) => ({ headers: { 'x-test-staff-id': staffId } });
  return { app, consent, scopes, clock, as };
}

const V = RESEARCH_CONTACT_WORDING.version;

describe('the market research contact option', () => {
  it('is off for everyone to begin with: nobody has answered, and the wording is there to show', async () => {
    const { app, as } = buildApp();
    const mine = await app.inject({ method: 'GET', url: '/staff/research-contact', ...as(SAM) });
    expect(mine.statusCode).toBe(200);
    expect(mine.json()).toEqual({
      available: true,
      agreed: null,
      at: null,
      version: V,
      text: RESEARCH_CONTACT_WORDING.text,
      note: RESEARCH_CONTACT_WORDING.note,
    });
  });

  it("records yes and no as separate answers, each to the wording shown, in the person's own company scope", async () => {
    const { app, as, consent, scopes } = buildApp();
    const yes = await app.inject({
      method: 'PUT',
      url: '/staff/research-contact',
      payload: { agreed: true, version: V },
      ...as(SAM),
    });
    expect(yes.statusCode).toBe(200);
    expect(yes.json()).toMatchObject({ agreed: true, at: '2026-11-23T10:00:00.000Z' });
    const no = await app.inject({
      method: 'PUT',
      url: '/staff/research-contact',
      payload: { agreed: false, version: V },
      ...as(SAM),
    });
    expect(no.json()).toMatchObject({ agreed: false });
    expect(consent.rows.map((r) => [r.staffId, r.companyId, r.agreed, r.wordingVersion])).toEqual([
      [SAM, 'company-acme', true, V],
      [SAM, 'company-acme', false, V],
    ]);
    expect(scopes.used).toContainEqual({ kind: 'company', companyId: 'company-acme' });
    const read = await app.inject({ method: 'GET', url: '/staff/research-contact', ...as(SAM) });
    expect(read.json()).toMatchObject({ agreed: false });
  });

  it("keeps one person's answer from another", async () => {
    const { app, as } = buildApp();
    await app.inject({
      method: 'PUT',
      url: '/staff/research-contact',
      payload: { agreed: true, version: V },
      ...as(SAM),
    });
    const pat = await app.inject({ method: 'GET', url: '/staff/research-contact', ...as(PAT) });
    expect(pat.json()).toMatchObject({ agreed: null });
  });

  it('refuses an answer to wording that is not the wording now, so what is stored is what they saw', async () => {
    const { app, as, consent } = buildApp();
    const stale = await app.inject({
      method: 'PUT',
      url: '/staff/research-contact',
      payload: { agreed: true, version: V + 1 },
      ...as(SAM),
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({ tag: 'WordingChanged' });
    expect(consent.rows).toEqual([]);
  });

  it('takes no answer while the option is switched off, and says so', async () => {
    const { app, as, consent } = buildApp(false);
    const mine = await app.inject({ method: 'GET', url: '/staff/research-contact', ...as(SAM) });
    expect(mine.json()).toMatchObject({ available: false, agreed: null });
    const put = await app.inject({
      method: 'PUT',
      url: '/staff/research-contact',
      payload: { agreed: true, version: V },
      ...as(SAM),
    });
    expect(put.statusCode).toBe(409);
    expect(put.json()).toMatchObject({ tag: 'NotAvailable' });
    expect(consent.rows).toEqual([]);
    const list = await app.inject({ method: 'GET', url: '/staff/research-contacts', ...as(ADMIN) });
    expect(list.json()).toMatchObject({ available: false, people: [] });
  });

  it("is for a company's staff: WagonWise staff and strangers are not asked", async () => {
    const { app, as } = buildApp();
    const admin = await app.inject({ method: 'GET', url: '/staff/research-contact', ...as(ADMIN) });
    expect(admin.statusCode).toBe(403);
    const stranger = await app.inject({
      method: 'GET',
      url: '/staff/research-contact',
      ...as('nobody'),
    });
    expect(stranger.statusCode).toBe(401);
    const anonymous = await app.inject({ method: 'GET', url: '/staff/research-contact' });
    expect(anonymous.statusCode).toBe(401);
    const bad = await app.inject({
      method: 'PUT',
      url: '/staff/research-contact',
      payload: { agreed: 'yes', version: V },
      ...as(SAM),
    });
    expect(bad.statusCode).toBe(400);
  });

  it('lists to WagonWise staff only those whose latest answer is yes, named, with their company', async () => {
    const { app, as } = buildApp();
    const put = (who: string, agreed: boolean) =>
      app.inject({
        method: 'PUT',
        url: '/staff/research-contact',
        payload: { agreed, version: V },
        ...as(who),
      });
    await put(SAM, true);
    await put(PAT, true);
    await put(PAT, false); // changed their mind: no longer on the list
    const list = await app.inject({ method: 'GET', url: '/staff/research-contacts', ...as(ADMIN) });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toEqual({
      available: true,
      version: V,
      people: [
        {
          name: 'Sam Boss',
          email: 'sam@acme.test',
          company: 'Acme Haulage',
          at: '2026-11-23T10:00:00.000Z',
        },
      ],
    });
    expect(
      (await app.inject({ method: 'GET', url: '/staff/research-contacts', ...as(SAM) })).statusCode,
    ).toBe(403);
  });

  it('does not list a person whose only yes was to older wording', async () => {
    const { app, as, consent } = buildApp();
    await consent.add({
      id: 'old',
      staffId: SAM,
      companyId: 'company-acme',
      agreed: true,
      wordingVersion: V - 1 < 1 ? 0 : V - 1,
      at: new Date('2026-01-01T00:00:00Z'),
    });
    const list = await app.inject({ method: 'GET', url: '/staff/research-contacts', ...as(ADMIN) });
    expect(list.json()).toMatchObject({ people: [] });
    const mine = await app.inject({ method: 'GET', url: '/staff/research-contact', ...as(SAM) });
    expect(mine.json()).toMatchObject({ agreed: null });
  });
});
