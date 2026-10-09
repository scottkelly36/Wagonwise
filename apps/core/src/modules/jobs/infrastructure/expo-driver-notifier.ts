import type {
  DeliveryReport,
  DriverMessage,
  DriverNotifier,
} from '../application/ports/notices.js';
import type { DriverId } from '../domain/job.js';

/** Expo's own fixed public endpoint (docs.expo.dev). */
const DEFAULT_EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface Ticket {
  readonly status: 'ok' | 'error';
}

function isTickets(body: unknown): body is { data: Ticket[] } {
  return typeof body === 'object' && body !== null && 'data' in body && Array.isArray(body.data);
}

/** The push tokens registered to a driver. Supplied by composition over identity. */
export interface DriverDevices {
  pushTokensFor(driverId: DriverId): Promise<readonly string[]>;
}

/**
 * Pushes a message to each of a driver's phones through Expo's Push API, and says how many it took. Hand-rolled HTTP like
 * routing's own notifier. A stale or revoked token is an expected outcome, counted as not accepted, never thrown.
 */
export class ExpoDriverNotifier implements DriverNotifier {
  constructor(
    private readonly devices: DriverDevices,
    private readonly accessToken?: string | undefined,
    private readonly pushUrl: string = DEFAULT_EXPO_PUSH_URL,
  ) {}

  async notify(driverId: DriverId, message: DriverMessage): Promise<DeliveryReport> {
    const tokens = await this.devices.pushTokensFor(driverId);
    if (tokens.length === 0) return { devices: 0, accepted: 0 };
    const response = await fetch(this.pushUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(this.accessToken === undefined ? {} : { authorization: `Bearer ${this.accessToken}` }),
      },
      body: JSON.stringify(
        tokens.map((to) => ({
          to,
          title: message.title,
          body: message.body,
          data: message.data,
          sound: 'default',
          channelId: 'default',
          priority: 'high',
        })),
      ),
    });
    const parsed: unknown = await response.json();
    if (!response.ok || !isTickets(parsed)) {
      throw new Error(`Expo push API returned ${response.status} with an unrecognised body`);
    }
    return {
      devices: tokens.length,
      accepted: parsed.data.filter((t) => t.status === 'ok').length,
    };
  }
}
