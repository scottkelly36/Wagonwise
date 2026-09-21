import type { Clock } from '../shared/ports/clock';

export const systemClock: Clock = { now: () => new Date() };
