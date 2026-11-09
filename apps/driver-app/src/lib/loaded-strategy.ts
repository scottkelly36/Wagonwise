import { useLoadStore } from '../state/load-store';

/**
 * For a route made from where the lorry is now (a re-plan, the next stop of a job, a parking spot): the gentle strategy when the driver
 * has chosen Loaded, and nothing otherwise, so the request is exactly what it was. `planRoute` falls back to the ordinary route when the
 * server has no height data.
 */
export function loadedStrategy(): { strategy?: 'gentle' } {
  return useLoadStore.getState().loaded ? { strategy: 'gentle' } : {};
}
