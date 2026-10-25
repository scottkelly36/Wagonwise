import type { FastifyInstance } from 'fastify';
import { locationToWords, wordsToLocation, type LookupError } from './application/lookup.js';
import type { WordsProvider } from './application/words-provider.js';
import type { GeoPoint, What3wordsAddress } from './domain/words.js';
import { NoWordsProvider, What3wordsClient } from './infrastructure/what3words-client.js';
import { registerWhat3wordsRoutes } from './interface/routes.js';
import type { Result } from '../../shared/result.js';

export type { What3wordsAddress } from './domain/words.js';

export interface What3wordsModuleDeps {
  /** The what3words key. Unset means no lookups (and none are billed), so a dev machine with no key still boots. */
  readonly apiKey?: string | undefined;
  /** Replaces the service; tests pass a fake. */
  readonly provider?: WordsProvider | undefined;
  /** Told once about a lookup that failed for a reason that is ours to fix (a bad key, the allowance used up, an outage). */
  readonly onProblem?: ((what: string, detail: unknown) => void) | undefined;
}

export interface What3wordsModule {
  registerRoutes(app: FastifyInstance): void;
  readonly enabled: boolean;
  /** For other modules, through composition (AGENTS.md rule 7): the three words for a position. */
  wordsFor(
    point: GeoPoint,
  ): Promise<Result<What3wordsAddress, Exclude<LookupError, { tag: 'InvalidWords' }>>>;
  locationOf(words: string): Promise<Result<What3wordsAddress, LookupError>>;
}

/** `what3words`' only public surface (AGENTS.md rule 6): three words to a spot and a spot to three words, for the driver app's
 *  Where to? screen and for SOS. Nothing is stored. */
export function createWhat3wordsModule(deps: What3wordsModuleDeps): What3wordsModule {
  const provider: WordsProvider =
    deps.provider ??
    (deps.apiKey === undefined
      ? new NoWordsProvider()
      : new What3wordsClient(deps.apiKey, undefined, deps.onProblem));
  return {
    enabled: provider.enabled,
    registerRoutes: (app) => registerWhat3wordsRoutes(app, provider),
    wordsFor: (point) => locationToWords(provider, point),
    locationOf: (words) => wordsToLocation(provider, words),
  };
}
