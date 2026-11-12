import type { AnnouncementPusher, PushReport } from '../application/announcements.js';
import type { PushMessage } from '../domain/announcement.js';

/** Expo's own fixed public endpoint (docs.expo.dev). */
const DEFAULT_EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo takes at most 100 messages in one request. */
const BATCH_SIZE = 100;

interface Ticket {
  readonly status: 'ok' | 'error';
}

function isTickets(body: unknown): body is { data: Ticket[] } {
  return typeof body === 'object' && body !== null && 'data' in body && Array.isArray(body.data);
}

/**
 * Sends a note to many phones through Expo's Push API, in batches, and says how many it took. Hand-rolled HTTP like routing's and jobs' notifiers. These are news,
 * not alerts: no sound, ordinary priority and their own Android channel, so one never rings while a driver is on the road. A stale or revoked token is an expected
 * outcome, counted as not accepted. A batch the service refuses as a whole throws, and the caller treats the send as failed.
 */
export class ExpoAnnouncementPusher implements AnnouncementPusher {
  constructor(
    private readonly accessToken?: string | undefined,
    private readonly pushUrl: string = DEFAULT_EXPO_PUSH_URL,
  ) {}

  async send(tokens: readonly string[], message: PushMessage): Promise<PushReport> {
    let accepted = 0;
    for (let start = 0; start < tokens.length; start += BATCH_SIZE) {
      const batch = tokens.slice(start, start + BATCH_SIZE);
      const response = await fetch(this.pushUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...(this.accessToken === undefined
            ? {}
            : { authorization: `Bearer ${this.accessToken}` }),
        },
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title: message.title,
            body: message.body,
            data: message.data,
            sound: null,
            channelId: 'news',
            priority: 'default',
          })),
        ),
      });
      const parsed: unknown = await response.json();
      if (!response.ok || !isTickets(parsed)) {
        throw new Error(`Expo push API returned ${response.status} with an unrecognised body`);
      }
      accepted += parsed.data.filter((t) => t.status === 'ok').length;
    }
    return { devices: tokens.length, accepted };
  }
}
