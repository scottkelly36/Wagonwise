import type { PushNotification, PushNotifier } from '../application/ports/push-notifier.js';

/** Expo's own fixed public endpoint (docs.expo.dev) — unlike Valhalla, this isn't self-hosted, so
 *  there's no per-deployment URL to configure; only the (optional) access token varies. */
const DEFAULT_EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface ExpoPushTicket {
  readonly status: 'ok' | 'error';
  readonly id?: string;
  readonly message?: string;
  readonly details?: { readonly error?: string };
}

interface ExpoPushResponse {
  readonly data: readonly ExpoPushTicket[];
}

function isExpoPushResponse(body: unknown): body is ExpoPushResponse {
  return typeof body === 'object' && body !== null && 'data' in body && Array.isArray(body.data);
}

/**
 * Real push delivery via Expo's Push API (design doc §6) — hand-rolled HTTP (decision 6/51's
 * "hand-roll small, well-understood things"), no client library: the request is one array of
 * message objects, the response is one array of tickets. `accessToken` is optional — Expo's
 * enhanced push security (requiring a bearer token) is an opt-in per-project setting, not a
 * universal requirement — sent as `Authorization: Bearer <token>` when set, same shape as core
 * forwarding `X-Internal-Key`.
 */
export class ExpoPushNotifier implements PushNotifier {
  constructor(
    private readonly accessToken?: string | undefined,
    private readonly pushUrl: string = DEFAULT_EXPO_PUSH_URL,
  ) {}

  async send(pushToken: string, notification: PushNotification): Promise<void> {
    const response = await fetch(this.pushUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        ...(this.accessToken === undefined ? {} : { authorization: `Bearer ${this.accessToken}` }),
      },
      body: JSON.stringify([
        {
          to: pushToken,
          title: notification.title,
          body: notification.body,
          data: notification.data,
        },
      ]),
    });
    const parsed: unknown = await response.json();

    if (!response.ok || !isExpoPushResponse(parsed)) {
      throw new Error(
        `Expo push API returned ${response.status} with an unrecognised body: ${JSON.stringify(parsed)}`,
      );
    }

    const ticket = parsed.data[0];
    if (!ticket) {
      throw new Error('Expo push API returned no ticket for the one message sent');
    }

    if (ticket.status === 'error') {
      // A routine, expected outcome — a stale or revoked device token, most commonly
      // (`DeviceNotRegistered`) — not an infra fault: `detect-reroute.ts` has already persisted
      // the RerouteAlert by the time this runs and has no per-token retry path (rule 9's
      // idempotency guard would skip a retried event's already-alerted subject entirely), so
      // throwing here would just abort the rest of this subject's token loop for no benefit.
      // Logged, not silent — matches `ConsolePushNotifier`'s own console-based visibility, which
      // is all Phase 1 has (M6.1 deviations: "no visibility beyond querying Postgres directly").
      console.warn(
        `[push] Expo rejected a push to ${pushToken}: ${
          ticket.details?.error ?? ticket.message ?? 'unknown error'
        }`,
      );
    }
  }
}
