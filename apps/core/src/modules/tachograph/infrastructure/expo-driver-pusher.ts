import type { DriverPusher } from '../application/ports.js';

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
  pushTokensFor(driverId: string): Promise<readonly string[]>;
}

/**
 * Pushes a message to each of a driver's phones through Expo's Push API, like the jobs module's notifier (each module keeps its own
 * so neither reaches into the other). The message carries `type: 'tachograph_due'` so the app opens the Send my tachograph file
 * screen. A stale or revoked token is a lower `accepted`, never thrown; only the service being unreachable throws.
 */
export class ExpoDriverPusher implements DriverPusher {
  constructor(
    private readonly devices: DriverDevices,
    private readonly accessToken?: string | undefined,
    private readonly pushUrl: string = DEFAULT_EXPO_PUSH_URL,
  ) {}

  async push(
    driverId: string,
    message: { title: string; body: string },
  ): Promise<{ devices: number; accepted: number }> {
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
          data: { type: 'tachograph_due' },
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
