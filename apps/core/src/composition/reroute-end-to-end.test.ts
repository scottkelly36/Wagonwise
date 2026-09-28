import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import type { Pool } from 'pg';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';
import type { AccessTokenClaims, AccessTokenVerifier } from '../host/access-token-verifier.js';
import type { PushNotification, PushNotifier } from '../modules/routing/api.js';
import { createPool } from '../platform/db.js';
import { runMigrations } from '../platform/migrations/run-migrations.js';
import { FakeClock } from '../shared/testing/fake-clock.js';
import { composeCore, type Core } from './compose-core.js';

const migrationsDir = fileURLToPath(new URL('../../migrations', import.meta.url));

const fakeTokenSigner = {
  signAccessToken: () => Promise.resolve('unused-in-this-test'),
  signStaffAccessToken: () => Promise.resolve('unused-in-this-test'),
  publicJwk: () => Promise.resolve({ kty: 'OKP', crv: 'Ed25519', x: 'fake' }),
};

/** Maps an arbitrary bearer string straight to fixed claims — this test bypasses the real OTP
 *  sign-in flow entirely (M1.5 already covers it exhaustively) so it can seed two specific,
 *  known driver ids without an invite code or reading a console-logged OTP. */
class MapAccessTokenVerifier implements AccessTokenVerifier {
  #claimsByToken = new Map<string, AccessTokenClaims>();

  register(token: string, driverId: string): void {
    this.#claimsByToken.set(token, { driverId, sessionId: `session-${driverId}` });
  }

  verify(token: string): Promise<AccessTokenClaims> {
    const claims = this.#claimsByToken.get(token);
    if (!claims) return Promise.reject(new Error('unknown test token'));
    return Promise.resolve(claims);
  }
}

class FakePushNotifier implements PushNotifier {
  readonly calls: { token: string; notification: PushNotification }[] = [];

  send(token: string, notification: PushNotification): Promise<void> {
    this.calls.push({ token, notification });
    return Promise.resolve();
  }
}

// Same hand-rolled polyline6 encoder as postgres-route-plan-repository.test.ts (M6.4) — kept
// test-only there too, so duplicating it here rather than importing it is consistent with that
// file's own precedent, not a shortcut: a composition-level test may not reach into
// routing/infrastructure/ at all (modules-reachable-only-through-api).
function encodeValue(raw: number): string {
  let value = raw < 0 ? ~(raw << 1) : raw << 1;
  let output = '';
  while (value >= 0x20) {
    output += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }
  return output + String.fromCharCode(value + 63);
}
function encodePolyline(points: { lat: number; lon: number }[]): string {
  const factor = 10 ** 6;
  let output = '';
  let prevLat = 0;
  let prevLon = 0;
  for (const { lat, lon } of points) {
    const lat5 = Math.round(lat * factor);
    const lon5 = Math.round(lon * factor);
    output += encodeValue(lat5 - prevLat) + encodeValue(lon5 - prevLon);
    prevLat = lat5;
    prevLon = lon5;
  }
  return output;
}

// A straight line running north, five points a fixed ~1.1km apart (0.01° latitude) — real enough
// for PostGIS's ST_DWithin, and far enough apart that hazards placed at different points on it
// never merge into one report (hazards' own MERGE_RADIUS_M is 50m).
const FAKE_ROUTE_POINTS = [
  { lat: 54.9, lon: -2.1 },
  { lat: 54.91, lon: -2.1 },
  { lat: 54.92, lon: -2.1 },
  { lat: 54.93, lon: -2.1 },
  { lat: 54.94, lon: -2.1 },
];
const FAKE_ROUTE_GEOMETRY = encodePolyline(FAKE_ROUTE_POINTS);
// A detour nowhere near FAKE_ROUTE_POINTS — the fake Valhalla server returns this whenever the
// request carries an avoid zone (`exclude_polygons`), the same way a real routing engine given
// one would actually move the route away from it. Without this, every "reroute" would land
// exactly back on the original corridor (since it's the only geometry the fake ever knew about),
// making it look like a fresh, still-unstarted "nearby plan" to the *next* hazard report on the
// same corridor — a snowball this test's own first draft actually hit, caused by the fake being
// unrealistic, not by a real bug in detectReroute's own candidate search.
const DETOUR_GEOMETRY = encodePolyline([
  { lat: 55.5, lon: -1.5 },
  { lat: 55.51, lon: -1.49 },
]);
const ORIGIN = FAKE_ROUTE_POINTS[0]!;
const DESTINATION = FAKE_ROUTE_POINTS[4]!;
const DIMENSIONS = { heightM: 4.2, widthM: 2.6, lengthM: 16.5, grossWeightT: 32 };
/** Below DIMENSIONS.heightM, so `applies()` genuinely blocks this vehicle (AGENTS.md's own
 *  most-safety-critical function, exercised for real here rather than faked). */
const LOW_BRIDGE_MEASUREMENT = { kind: 'height' as const, value: 3.5, unit: 'm' as const };

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const start = Date.now();
  for (;;) {
    if (await predicate()) return;
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor: condition never became true');
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/**
 * The full path M6.4's own deviations flagged as unproven: a real HTTP hazard report, through the
 * real outbox, dispatched by the real (fast-polling) `OutboxDispatcher` into routing's real
 * reroute-detection handlers, ending in a real `RerouteAlert` + `RoutePlan` row and a real
 * `PushNotifier.send()` call — across all three modules (hazards, routing, identity), through
 * `composeCore` exactly as production wires it. Only the two genuinely-external services are
 * faked: Valhalla (a local HTTP stand-in, same technique as `valhalla-routing-engine.test.ts` —
 * decision 13 keeps a real Valhalla out of the per-PR tier) and `PushNotifier` (so this test never
 * reaches Expo's real endpoint, mirroring `otpSender`'s own override precedent). Sign-in itself is
 * bypassed with a token-to-claims map instead of a real OTP round trip — M1.5/M1.6 already cover
 * that flow exhaustively; this test's job is the wiring between hazards, the outbox and routing.
 */
describe('reroute alerts — end to end (M6.7)', () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let valhalla: Server;
  let valhallaUrl: string;
  let core: Core | undefined;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgis/postgis:16-3.4').start();
    pool = createPool(container.getConnectionUri());
    await runMigrations(pool, migrationsDir);

    valhalla = createServer((request, response) => {
      const chunks: Buffer[] = [];
      request.on('data', (chunk: Buffer) => chunks.push(chunk));
      request.on('end', () => {
        const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as {
          exclude_polygons?: unknown;
        };
        const shape = body.exclude_polygons ? DETOUR_GEOMETRY : FAKE_ROUTE_GEOMETRY;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(
          JSON.stringify({ trip: { summary: { time: 300, length: 4.4 }, legs: [{ shape }] } }),
        );
      });
    });
    await new Promise<void>((resolve) => valhalla.listen(0, '127.0.0.1', resolve));
    const address = valhalla.address();
    if (address === null || typeof address === 'string') {
      throw new Error('expected a real listening address');
    }
    valhallaUrl = `http://127.0.0.1:${address.port}`;
  }, 120_000);

  afterAll(async () => {
    await pool.end();
    await container.stop();
    await new Promise<void>((resolve, reject) => {
      valhalla.close((error) => (error ? reject(error) : resolve()));
    });
  });

  afterEach(async () => {
    await core?.close();
    core = undefined;
    await pool.query('delete from routing.reroute_alerts');
    await pool.query('delete from routing.active_trips');
    await pool.query('delete from routing.route_plans');
    await pool.query('delete from routing.vehicle_profiles');
    await pool.query('delete from identity.devices');
    await pool.query('delete from identity.drivers');
    await pool.query('delete from hazards.reports');
    await pool.query('delete from outbox.handled');
    await pool.query('delete from outbox.events');
  });

  interface Driver {
    readonly id: string;
    readonly token: string;
  }

  /** Real rows via the real HTTP routes throughout — a seeded `identity.drivers` row (identity
   *  has no sign-up endpoint of its own to drive; M1.5's own precedent is seeding this table
   *  directly), then a real `POST /identity/devices`, a real vehicle profile and a real planned
   *  route, so the "recent unstarted plan near this location" row `detectReroute` finds is
   *  genuine, not hand-inserted. */
  async function seedDriverWithPlan(
    app: Core['app'],
    verifier: MapAccessTokenVerifier,
    identifier: string,
    pushToken: string,
  ): Promise<{ driver: Driver; routePlanId: string }> {
    const driverId = randomUUID();
    const token = `token-${driverId}`;
    verifier.register(token, driverId);
    await pool.query('insert into identity.drivers (id, identifier) values ($1, $2)', [
      driverId,
      identifier,
    ]);

    const deviceResponse = await app.inject({
      method: 'POST',
      url: '/identity/devices',
      payload: { pushToken },
      headers: { authorization: `Bearer ${token}`, 'x-internal-key': 'local-dev-internal-key' },
    });
    expect(deviceResponse.statusCode).toBe(201);

    const profileResponse = await app.inject({
      method: 'POST',
      url: '/routing/vehicle-profiles',
      payload: { name: 'Big Wagon', dimensions: DIMENSIONS },
      headers: { authorization: `Bearer ${token}`, 'x-internal-key': 'local-dev-internal-key' },
    });
    expect(profileResponse.statusCode).toBe(201);
    const { id: profileId } = profileResponse.json<{ id: string }>();

    const planResponse = await app.inject({
      method: 'POST',
      url: '/routing/route-plans',
      payload: { profileId, origin: ORIGIN, destination: DESTINATION },
      headers: { authorization: `Bearer ${token}`, 'x-internal-key': 'local-dev-internal-key' },
    });
    expect(planResponse.statusCode).toBe(201);
    const { id: routePlanId } = planResponse.json<{ id: string }>();

    return { driver: { id: driverId, token }, routePlanId };
  }

  async function reportHazard(
    app: Core['app'],
    reporter: Driver,
    location: { lat: number; lon: number },
  ): Promise<string> {
    const response = await app.inject({
      method: 'POST',
      url: '/hazards/reports',
      payload: {
        id: randomUUID(),
        type: 'low_bridge',
        location,
        measurement: LOW_BRIDGE_MEASUREMENT,
        source: 'tap',
      },
      headers: {
        authorization: `Bearer ${reporter.token}`,
        'x-internal-key': 'local-dev-internal-key',
      },
    });
    expect(response.statusCode).toBe(200);
    return response.json<{ id: string }>().id;
  }

  async function rerouteAlertCount(subjectId: string): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(
      "select count(*)::text as count from routing.reroute_alerts where subject_type = 'route_plan' and subject_id = $1",
      [subjectId],
    );
    return Number(rows[0]?.count ?? '0');
  }

  it('reroutes the affected driver, records the alert, and never notifies the reporter', async () => {
    const verifier = new MapAccessTokenVerifier();
    const pushNotifier = new FakePushNotifier();
    const clock = new FakeClock('2026-06-15T08:00:00.000Z');
    const config = loadConfig({
      DATABASE_URL: container.getConnectionUri(),
      VALHALLA_URL: valhallaUrl,
      LOG_LEVEL: 'silent',
      OUTBOX_POLL_INTERVAL_MS: '100',
    });
    core = composeCore(config, fakeTokenSigner, verifier, { clock, pushNotifier });

    const reporterSeed = await seedDriverWithPlan(
      core.app,
      verifier,
      `reporter-${randomUUID()}@example.com`,
      'reporter-token',
    );
    const nearbySeed = await seedDriverWithPlan(
      core.app,
      verifier,
      `nearby-${randomUUID()}@example.com`,
      'nearby-token',
    );

    // On the middle point of the fake route both drivers just planned — within 30m of both plans'
    // geometry (AGENTS.md rule 15's ON_ROUTE_RADIUS_M), reported by the reporter themselves.
    await reportHazard(core.app, reporterSeed.driver, FAKE_ROUTE_POINTS[2]!);

    // Waiting on the push itself, not just the alert row — the two are sequential awaits inside
    // the same handler call (the alert commits, *then* it looks up push tokens and sends), so
    // polling only the row can observe a real, if narrow, gap between the two under load and
    // assert too early.
    await waitFor(() => Promise.resolve(pushNotifier.calls.length >= 1));
    await waitFor(async () => (await rerouteAlertCount(nearbySeed.routePlanId)) === 1);

    // The reporter's own plan must never be rerouted for their own report (design doc §6: "don't
    // notify the driver who made the report") — asserted as a real absence, not just "we never
    // called send() for them" below, since a genuinely different bug (skipping the push but still
    // rerouting/persisting an alert) would otherwise slip through.
    expect(await rerouteAlertCount(reporterSeed.routePlanId)).toBe(0);

    expect(pushNotifier.calls).toHaveLength(1);
    expect(pushNotifier.calls[0]?.token).toBe('nearby-token');
    expect(pushNotifier.calls.some((call) => call.token === 'reporter-token')).toBe(false);

    const { rows: newPlanRows } = await pool.query<{ driver_id: string }>(
      'select driver_id from routing.route_plans where id = $1',
      [pushNotifier.calls[0]?.notification.data.newRoutePlanId],
    );
    expect(newPlanRows[0]?.driver_id).toBe(nearbySeed.driver.id);
  }, 20_000);

  it('is idempotent: confirming the same hazard again never creates a second alert', async () => {
    const verifier = new MapAccessTokenVerifier();
    const pushNotifier = new FakePushNotifier();
    const clock = new FakeClock('2026-06-15T08:00:00.000Z');
    const config = loadConfig({
      DATABASE_URL: container.getConnectionUri(),
      VALHALLA_URL: valhallaUrl,
      LOG_LEVEL: 'silent',
      OUTBOX_POLL_INTERVAL_MS: '100',
    });
    core = composeCore(config, fakeTokenSigner, verifier, { clock, pushNotifier });

    const reporterSeed = await seedDriverWithPlan(
      core.app,
      verifier,
      `reporter-${randomUUID()}@example.com`,
      'reporter-token',
    );
    const nearbySeed = await seedDriverWithPlan(
      core.app,
      verifier,
      `nearby-${randomUUID()}@example.com`,
      'nearby-token',
    );

    await reportHazard(core.app, reporterSeed.driver, FAKE_ROUTE_POINTS[2]!);
    await waitFor(async () => (await rerouteAlertCount(nearbySeed.routePlanId)) === 1);
    await waitFor(() => Promise.resolve(pushNotifier.calls.length >= 1));
    await waitFor(async () => {
      const { rows } = await pool.query<{ count: string }>(
        "select count(*)::text as count from outbox.events where event_type = 'HazardReported' and processed_at is not null",
      );
      return Number(rows[0]?.count ?? '0') === 1;
    });

    // A genuine redelivery of the *same* already-handled event — exactly what AGENTS.md rule 9
    // ("event delivery is at-least-once") describes: a crash between a handler completing and
    // the event being marked processed, or (M6.7's own real find) two overlapping dispatcher
    // polls both claiming a still-unprocessed row. Resetting `processed_at` back to null is the
    // deterministic way to force a real redelivery through the real dispatcher, rather than
    // hoping to catch a timing race.
    await pool.query(
      "update outbox.events set processed_at = null where event_type = 'HazardReported'",
    );
    await waitFor(async () => {
      const { rows } = await pool.query<{ attempts: string }>(
        "select attempts::text from outbox.events where event_type = 'HazardReported'",
      );
      return Number(rows[0]?.attempts ?? '0') >= 2;
    });

    expect(await rerouteAlertCount(nearbySeed.routePlanId)).toBe(1);
    expect(pushNotifier.calls).toHaveLength(1);
  }, 20_000);

  it('caps reroute alerts for the same subject at 3 within a rolling hour', async () => {
    const verifier = new MapAccessTokenVerifier();
    const pushNotifier = new FakePushNotifier();
    const clock = new FakeClock('2026-06-15T08:00:00.000Z');
    const config = loadConfig({
      DATABASE_URL: container.getConnectionUri(),
      VALHALLA_URL: valhallaUrl,
      LOG_LEVEL: 'silent',
      OUTBOX_POLL_INTERVAL_MS: '100',
    });
    core = composeCore(config, fakeTokenSigner, verifier, { clock, pushNotifier });

    const reporterSeed = await seedDriverWithPlan(
      core.app,
      verifier,
      `reporter-${randomUUID()}@example.com`,
      'reporter-token',
    );
    const nearbySeed = await seedDriverWithPlan(
      core.app,
      verifier,
      `nearby-${randomUUID()}@example.com`,
      'nearby-token',
    );

    // Four distinct hazards (different ids, >1km apart so hazards' own ~50m merge radius never
    // collapses them into one report) all near the same route, 10 minutes apart — all four land
    // inside the same rolling hour, so the fourth must be skipped by the rate cap
    // (RATE_LIMIT_PER_SUBJECT_PER_HOUR = 3, decision 80), not merged or deduped for any other
    // reason.
    for (let i = 0; i < 4; i++) {
      await reportHazard(core.app, reporterSeed.driver, FAKE_ROUTE_POINTS[i]!);
      clock.advance(10 * 60 * 1000);
    }

    await waitFor(async () => (await rerouteAlertCount(nearbySeed.routePlanId)) === 3);

    // Give the dispatcher a moment to have genuinely finished all four, not just the first three
    // — every hazard's own outbox event must be marked processed, including the rate-limited
    // fourth (a skip is not a failure; the handler still completes and the event is handled).
    await waitFor(async () => {
      const { rows } = await pool.query<{ count: string }>(
        "select count(*)::text as count from outbox.events where event_type = 'HazardReported' and processed_at is not null",
      );
      return Number(rows[0]?.count ?? '0') >= 4;
    });
    await waitFor(() => Promise.resolve(pushNotifier.calls.length >= 3));

    expect(await rerouteAlertCount(nearbySeed.routePlanId)).toBe(3);
    expect(pushNotifier.calls).toHaveLength(3);
  }, 20_000);
});
