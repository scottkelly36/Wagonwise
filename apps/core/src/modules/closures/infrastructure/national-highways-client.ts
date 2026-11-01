import { err, ok, type Result } from '../../../shared/result.js';
import type { Closure, ClosureSourceUnavailable } from '../domain/closure.js';
import type { ClosureSource } from '../application/closure-source.js';
import { parseClosuresFeed } from './datex-closures-parser.js';

export interface NationalHighwaysSettings {
  /** The subscription keys from National Highways' developer portal: the primary, then the secondary if there is one. Tried in order. */
  readonly keys: readonly string[];
  /** The Road and Lane Closures (v2.0) address. */
  readonly url: string;
}

/** A source that is not set up: every fetch says so and no request is made. */
export class NoClosureSource implements ClosureSource {
  readonly enabled = false;

  fetchClosures(): Promise<Result<readonly Closure[], ClosureSourceUnavailable>> {
    return Promise.resolve(err({ tag: 'ClosureSourceUnavailable', reason: 'not_configured' }));
  }
}

/** The whole feed is about 10 MB and takes a second or two; this is for a service that has stopped answering. */
const REQUEST_TIMEOUT_MS = 60_000;

/**
 * National Highways' Road and Lane Closures feed. One GET returns every closure (about 10 MB of DATEX II), so a refresh is one request
 * and the service's limit of 10 a minute is never close. The feed is built afresh on each request and has no version header, so it
 * cannot be fetched "only if changed".
 *
 * Two keys are issued so one can be replaced without a gap. A key the service refuses (401 or 403) hands over to the next one; any
 * other failure does not, since a second key would fail the same way.
 */
export class NationalHighwaysClient implements ClosureSource {
  readonly enabled: boolean;

  constructor(
    private readonly settings: NationalHighwaysSettings,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly onProblem?: (what: string, detail: unknown) => void,
  ) {
    this.enabled = settings.keys.length > 0;
  }

  async fetchClosures(): Promise<Result<readonly Closure[], ClosureSourceUnavailable>> {
    if (!this.enabled) return err({ tag: 'ClosureSourceUnavailable', reason: 'not_configured' });
    let refusedStatus: number | undefined;
    for (const [index, key] of this.settings.keys.entries()) {
      let response: Response;
      try {
        response = await this.fetchFn(this.settings.url, {
          headers: { 'Ocp-Apim-Subscription-Key': key, Accept: 'application/xml' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (cause) {
        this.onProblem?.('could not reach National Highways', cause);
        return err({ tag: 'ClosureSourceUnavailable', reason: 'unreachable' });
      }
      if (response.status === 401 || response.status === 403) {
        refusedStatus = response.status;
        this.onProblem?.(`National Highways refused key ${index + 1}`, response.status);
        continue;
      }
      if (!response.ok) {
        this.onProblem?.('National Highways answered with an error', response.status);
        return err({
          tag: 'ClosureSourceUnavailable',
          reason: 'http_error',
          status: response.status,
        });
      }
      try {
        return ok(parseClosuresFeed(await response.text()));
      } catch (cause) {
        this.onProblem?.('the closures feed could not be read', cause);
        return err({ tag: 'ClosureSourceUnavailable', reason: 'unreadable' });
      }
    }
    return err({ tag: 'ClosureSourceUnavailable', reason: 'unauthorised', status: refusedStatus });
  }
}
