import type { FastifyInstance } from 'fastify';
import type { Clock } from '../../shared/ports/clock.js';
import type { IdGenerator } from '../../shared/ports/id-generator.js';
import type { CallerDirectory } from './application/announcements.js';
import {
  PostgresAnnouncementRepository,
  type UntypedDb,
} from './infrastructure/postgres-announcement-repository.js';
import { registerAnnouncementRoutes } from './interface/routes.js';

// Re-exported so composition/ can type its wiring without reaching past this facade.
export type { UntypedDb } from './infrastructure/postgres-announcement-repository.js';
export type { CallerDirectory, StaffCaller } from './application/announcements.js';

export interface AnnouncementsModuleDeps {
  readonly db: UntypedDb;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  /** Who a signed-in staff account is. Supplied by composition over `companies`. */
  readonly callers: CallerDirectory;
}

export interface AnnouncementsModule {
  registerRoutes(app: FastifyInstance): void;
}

/**
 * `announcements`' only public surface (AGENTS.md rule 6): notes from WagonWise to its drivers about what has changed in the app. WagonWise staff write
 * them in the portal; the driver app shows the newest once as "What's new".
 */
export function createAnnouncementsModule(deps: AnnouncementsModuleDeps): AnnouncementsModule {
  const announcements = new PostgresAnnouncementRepository(deps.db);
  return {
    registerRoutes(app: FastifyInstance): void {
      registerAnnouncementRoutes(app, {
        announcements: { announcements, ids: deps.ids, clock: deps.clock },
        callerDirectory: deps.callers,
      });
    },
  };
}
