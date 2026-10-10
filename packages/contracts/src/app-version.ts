import { z } from 'zod';

/**
 * `GET /app/version` (public, no sign-in): what the driver app compares itself against to tell a driver a new build is out. Every
 * field is optional: with nothing set, the app says nothing. A new build is a store release (a native change, a new version
 * number); drivers on an older version do not receive over-the-air updates built for the newer one, so they need to hear about it.
 */
export const appVersionResponseSchema = z.object({
  /** The newest build in the store: an older app shows "a new version is available". */
  latestVersion: z.string().max(32).optional(),
  /** The oldest build still allowed: an older app is asked to update before going on. Leave unset unless it must be forced. */
  minimumVersion: z.string().max(32).optional(),
  /** Where to get it (the store listing, or the testing link). */
  updateUrl: z.url().max(500).optional(),
});
export type AppVersionResponse = z.infer<typeof appVersionResponseSchema>;
