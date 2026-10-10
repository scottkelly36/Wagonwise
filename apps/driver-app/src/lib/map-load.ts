/**
 * Whether the map has loaded, as the driver should be told. The map's style and first tiles come over the network, and on a weak
 * connection they can take a while; a blank map with no word looks broken. So: say "loading" at once, say it is slow if it takes
 * longer than {@link SLOW_AFTER_MS}, and if the map itself reports a failure say that and offer to try again.
 */
export type MapLoadState =
  | { readonly status: 'loading'; readonly slow: boolean }
  | { readonly status: 'ready' }
  | { readonly status: 'failed' };

export type MapLoadEvent = 'loaded' | 'failed' | 'slow' | 'retry';

/** How long to wait before saying the map is slow. */
export const SLOW_AFTER_MS = 6_000;

export const INITIAL_MAP_LOAD: MapLoadState = { status: 'loading', slow: false };

export function mapLoadReducer(state: MapLoadState, event: MapLoadEvent): MapLoadState {
  switch (event) {
    case 'loaded':
      // A map that failed once and then loads is fine, so loaded always wins.
      return { status: 'ready' };
    case 'failed':
      // Once the map is up, a later failure is a tile or two missing, not a map that is not there: leave it.
      return state.status === 'ready' ? state : { status: 'failed' };
    case 'slow':
      return state.status === 'loading' ? { status: 'loading', slow: true } : state;
    case 'retry':
      return INITIAL_MAP_LOAD;
  }
}

/** What to say over the map, or undefined when it is loaded. */
export function mapLoadMessage(state: MapLoadState): string | undefined {
  if (state.status === 'ready') return undefined;
  if (state.status === 'failed')
    return "Couldn't load the map. Check your signal, then tap to try again.";
  return state.slow ? 'The map is slow to load. Check your signal.' : 'Loading map…';
}
