import { PORTAL_PAGES, portalEventsRequestSchema } from '@wagonwise/contracts/usage';
import { describe, expect, it } from 'vitest';
import {
  PortalTracker,
  pageForPath,
  problemFromTag,
  type PortalTrackerDeps,
} from './portal-tracker';

const ID = '64000000-0000-4000-8000-000000000001';

function setup(failWith?: { status?: number }) {
  const sent: { events: { event: string }[]; keepalive: boolean }[] = [];
  let calls = 0;
  const clock = { t: Date.parse('2026-11-23T10:00:00.000Z') };
  const deps: PortalTrackerDeps = {
    send: (request, keepalive) => {
      calls += 1;
      if (failWith !== undefined) return Promise.reject(Object.assign(new Error('x'), failWith));
      sent.push({ events: [...request.events], keepalive });
      // The server would refuse anything off the lists, so the tracker's own output must parse.
      expect(portalEventsRequestSchema.safeParse(request).success).toBe(true);
      return Promise.resolve();
    },
    now: () => new Date(clock.t),
    newId: () => ID,
  };
  const tracker = new PortalTracker(deps);
  tracker.setEnabled(true);
  return { tracker, sent, clock, calls: () => calls };
}

describe('pageForPath', () => {
  it('names each tracked page, and a page beneath one takes its name', () => {
    expect(pageForPath('/fleet')).toBe('fleet_overview');
    expect(pageForPath('/fleet/jobs')).toBe('jobs');
    expect(pageForPath('/fleet/job-costs')).toBe('job_costs');
    expect(pageForPath('/guide/jobs')).toBe('guide');
    expect(pageForPath('/staff/plan')).toBe('plan');
  });

  it("leaves out WagonWise's admin pages, the sign-in and anything unknown", () => {
    expect(pageForPath('/admin/usage')).toBeUndefined();
    expect(pageForPath('/staff/sign-in')).toBeUndefined();
    expect(pageForPath('/fleet/nope')).toBeUndefined();
    expect(pageForPath('/somewhere')).toBeUndefined();
  });

  it('every page it can return is one the server accepts', () => {
    for (const path of ['/fleet', '/fleet/jobs', '/guide', '/staff/users', '/staff/settings']) {
      const page = pageForPath(path);
      expect(page !== undefined && PORTAL_PAGES.includes(page)).toBe(true);
    }
  });
});

describe('problemFromTag', () => {
  it('maps a refusal to a kind of problem and never carries the message', () => {
    expect(problemFromTag('CapacityReached')).toBe('capacity_reached');
    expect(problemFromTag('AccountPaused')).toBe('not_allowed');
    expect(problemFromTag('Forbidden')).toBe('not_allowed');
    expect(problemFromTag('SomethingOdd')).toBe('other');
    expect(problemFromTag(undefined)).toBe('other');
  });
});

describe('PortalTracker', () => {
  it('records nothing until it is switched on, and nothing after it is switched off', async () => {
    const { tracker, sent } = setup();
    tracker.setEnabled(false);
    tracker.page('jobs');
    tracker.formTouched('add_vehicle');
    await tracker.flush();
    expect(sent).toEqual([]);
    expect(tracker.pending).toBe(0);
  });

  it('counts the same page announced twice in a moment as one view, but not a later visit', async () => {
    const { tracker, sent, clock } = setup();
    tracker.page('jobs');
    tracker.page('jobs');
    clock.t += 5000;
    tracker.page('jobs');
    tracker.page('reports');
    await tracker.flush();
    expect(sent[0]?.events).toHaveLength(3);
  });

  it('counts a form as opened on the first thing typed, once, and sent when it is sent', async () => {
    const { tracker, sent } = setup();
    tracker.formTouched('add_vehicle');
    tracker.formTouched('add_vehicle');
    tracker.formProblem('add_vehicle', 'height', 'required');
    tracker.formSent('add_vehicle');
    await tracker.flush();
    expect(sent[0]?.events.map((e) => e.event)).toEqual(['form_opened', 'form_error', 'form_sent']);
  });

  it('opens the form again after it was sent, and counts one left part-way only if it was started', async () => {
    const { tracker, sent } = setup();
    tracker.formLeft('create_job');
    tracker.formTouched('create_job');
    tracker.formSent('create_job');
    tracker.formTouched('create_job');
    tracker.formLeft('create_job');
    tracker.formLeft('create_job');
    await tracker.flush();
    expect(sent[0]?.events.map((e) => e.event)).toEqual([
      'form_opened',
      'form_sent',
      'form_opened',
      'form_left',
    ]);
  });

  it('closing the portal leaves every form still open', async () => {
    const { tracker, sent } = setup();
    tracker.formTouched('invite_person');
    tracker.formTouched('invite_driver');
    tracker.leaveAllForms();
    await tracker.flush(true);
    expect(sent[0]?.events.filter((e) => e.event === 'form_left')).toHaveLength(2);
    expect(sent[0]?.keepalive).toBe(true);
  });

  it('sends at most 50 events a request, a batch at a time, and puts a batch back when there is no network', async () => {
    const full = setup();
    for (let i = 0; i < 120; i += 1) {
      full.tracker.page('jobs');
      full.clock.t += 2000;
    }
    await full.tracker.flush();
    expect(full.sent[0]?.events).toHaveLength(50);
    expect(full.tracker.pending).toBe(70);

    const offline = setup({});
    offline.tracker.page('jobs');
    await offline.tracker.flush();
    expect(offline.tracker.pending).toBe(1);
  });

  it('drops a batch the server refused, so it is not sent again and again', async () => {
    const refused = setup({ status: 400 });
    refused.tracker.page('jobs');
    await refused.tracker.flush();
    expect(refused.tracker.pending).toBe(0);
    expect(refused.calls()).toBe(1);
  });

  it('keeps only the newest when a very long time offline fills the queue', () => {
    const { tracker, clock } = setup();
    for (let i = 0; i < 260; i += 1) {
      tracker.page('jobs');
      clock.t += 2000;
    }
    expect(tracker.pending).toBe(200);
  });
});
