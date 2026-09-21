import type { Clock } from '../shared/ports/clock.js';

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
