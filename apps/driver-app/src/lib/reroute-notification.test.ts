import { newRoutePlanIdFrom } from './reroute-notification';

describe('newRoutePlanIdFrom', () => {
  it('extracts newRoutePlanId from a well-formed data payload', () => {
    expect(newRoutePlanIdFrom({ newRoutePlanId: 'plan-1' })).toBe('plan-1');
  });

  it('returns undefined when the field is missing', () => {
    expect(newRoutePlanIdFrom({ someOtherField: 'x' })).toBeUndefined();
  });

  it('returns undefined for an empty string, not the empty string itself', () => {
    expect(newRoutePlanIdFrom({ newRoutePlanId: '' })).toBeUndefined();
  });

  it('returns undefined when the field is the wrong type', () => {
    expect(newRoutePlanIdFrom({ newRoutePlanId: 42 })).toBeUndefined();
  });

  it('returns undefined for null or non-object data', () => {
    expect(newRoutePlanIdFrom(null)).toBeUndefined();
    expect(newRoutePlanIdFrom('plan-1')).toBeUndefined();
    expect(newRoutePlanIdFrom(undefined)).toBeUndefined();
  });
});
