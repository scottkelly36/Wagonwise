import type { Clock } from '../shared/ports/clock';

export function buildApp(clock: Clock) {
  return { health: () => ({ status: 'ok', time: clock.now().toISOString() }) };
}
