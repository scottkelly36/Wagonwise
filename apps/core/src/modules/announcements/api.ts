import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type {
  AnnouncementAudience,
  AnnouncementPusher,
  CallerDirectory,
} from './application/announcements.js';
import { ExpoAnnouncementPusher } from './infrastructure/expo-announcement-pusher.js';
import {
  PostgresAnnouncementRepository,
  PostgresPushPreferences,
  type UntypedDb,
} from './infrastructure/postgres-announcement-repository.js';
import { registerAnnouncementRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/postgres-announcement-repository.js';
export type {
  AnnouncementAudience,
  AnnouncementPusher,
  CallerDirectory,
  PushTarget,
  StaffCaller,
} from './application/announcements.js';

export interface AnnouncementsModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
  /** The phones a notification could go to, and whose they are. Supplied by composition over `identity`. */
  readonly audience: AnnouncementAudience;
  /** Expo's access token, when the project uses one. */
  readonly expoAccessToken?: string | undefined;
  /** Replaces the Expo sender, for tests. */
  readonly pusher?: AnnouncementPusher | undefined;
}

export interface AnnouncementsModule {
  registerRoutes(app: FastifyInstance): void;
  /** Removes a deleted account's choice about notifications. Safe to run twice. */
  eraseDriverData(driverId: string): Promise<void>;
}

/**
 * `announcements`' only public surface (AGENTS.md rule 6): notes from WagonWise to its drivers about what has changed in the app. WagonWise staff write
 * them in the portal; the driver app shows the newest once as "What's new".
 */
export function createAnnouncementsModule(deps: AnnouncementsModuleDeps): AnnouncementsModule {
  const announcements = new PostgresAnnouncementRepository(deps.db);
  const preferences = new PostgresPushPreferences(deps.db);
  const pusher = deps.pusher ?? new ExpoAnnouncementPusher(deps.expoAccessToken);
  return {
    eraseDriverData: (driverId) => preferences.erase(driverId),
    registerRoutes(app: FastifyInstance): void {
      registerAnnouncementRoutes(app, {
        announcements: {
          announcements,
          ids: deps.ids,
          clock: deps.clock,
          audience: deps.audience,
          pusher,
          preferences,
        },
        callerDirectory: deps.callers,
      });
    },
  };
}
