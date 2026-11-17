import { describe, expect, it } from 'vitest';
import { flowEventSchema, flowEventsRequestSchema, MAX_FLOW_EVENTS_PER_REQUEST } from './usage.js';

const AT = '2026-11-17T10:00:00.000Z';
const ok = (v: unknown) => flowEventSchema.safeParse(v).success;

describe('flowEventSchema', () => {
  it('accepts an event with one of its own choices, and one that carries none', () => {
    expect(ok({ event: 'load_chosen', choice: 'hill_sensitive', at: AT })).toBe(true);
    expect(ok({ event: 'start_chosen', choice: 'what3words', at: AT })).toBe(true);
    expect(ok({ event: 'route_shown', at: AT })).toBe(true);
  });

  it('refuses a choice that is not on the event’s list, so no free text can be stored', () => {
    expect(ok({ event: 'destination_chosen', choice: 'NE46 3DT', at: AT })).toBe(false);
    expect(ok({ event: 'destination_chosen', choice: 'filled.count.soap', at: AT })).toBe(false);
    expect(ok({ event: 'load_chosen', choice: 'what3words', at: AT })).toBe(false);
  });

  it('refuses a missing choice where one is needed, and any choice where none is', () => {
    expect(ok({ event: 'load_chosen', at: AT })).toBe(false);
    expect(ok({ event: 'route_shown', choice: 'fastest', at: AT })).toBe(false);
  });

  it('refuses an event that is not on the list, and a time that is not a time', () => {
    expect(ok({ event: 'position', choice: '54.97,-2.10', at: AT })).toBe(false);
    expect(ok({ event: 'route_shown', at: 'yesterday' })).toBe(false);
  });
});

describe('flowEventsRequestSchema', () => {
  const request = (events: unknown[]) => ({
    sessionId: 'b6f1a6b2-3c1d-4e8a-9f0b-2a4c6e8d0f12',
    appVersion: '1.2.1',
    platform: 'android',
    events,
  });

  it('accepts a batch from one session', () => {
    expect(
      flowEventsRequestSchema.safeParse(request([{ event: 'route_shown', at: AT }])).success,
    ).toBe(true);
  });

  it('refuses an empty batch and one over the limit', () => {
    expect(flowEventsRequestSchema.safeParse(request([])).success).toBe(false);
    const many = Array.from({ length: MAX_FLOW_EVENTS_PER_REQUEST + 1 }, () => ({
      event: 'route_shown',
      at: AT,
    }));
    expect(flowEventsRequestSchema.safeParse(request(many)).success).toBe(false);
  });

  it('refuses a session id that is not a random id, and a version that is not a version', () => {
    expect(
      flowEventsRequestSchema.safeParse({
        ...request([{ event: 'route_shown', at: AT }]),
        sessionId: 'driver-1',
      }).success,
    ).toBe(false);
    expect(
      flowEventsRequestSchema.safeParse({
        ...request([{ event: 'route_shown', at: AT }]),
        appVersion: 'me@example.com',
      }).success,
    ).toBe(false);
  });
});
