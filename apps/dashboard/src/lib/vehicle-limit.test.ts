import { describe, expect, it } from 'vitest';
import { vehicleLimitText } from './vehicle-limit';

const base = { capacityToday: 5, vehiclesInUse: 2, detailsOnFile: false, paymentsAvailable: true };

describe('vehicleLimitText', () => {
  it('says how many more can be added, and how to remove the limit, before payment details are on file', () => {
    expect(vehicleLimitText(base)).toEqual({
      limited: true,
      text: 'You have 2 vehicles set up, so you can add 3 more. Add your payment details above to remove the limit.',
    });
  });

  it('says the plan is full when it is, and when it is over', () => {
    expect(vehicleLimitText({ ...base, vehiclesInUse: 5 }).text).toBe(
      'You have 5 vehicles set up, all that the plan covers. Add your payment details above to remove the limit.',
    );
    expect(vehicleLimitText({ ...base, vehiclesInUse: 7 }).text).toBe(
      'You have 7 vehicles set up, more than the plan covers. You can’t add any more. Add your payment details above to remove the limit.',
    );
  });

  it('says there is no limit once payment details are on file, however full the plan is', () => {
    expect(vehicleLimitText({ ...base, vehiclesInUse: 5, detailsOnFile: true })).toEqual({
      limited: false,
      text: 'You have 5 vehicles set up. There is no limit on how many you can add: you pay for the ones you use.',
    });
  });

  it('points at WagonWise, not at a button that is not there, when there is no payment provider', () => {
    expect(vehicleLimitText({ ...base, vehiclesInUse: 5, paymentsAvailable: false }).text).toBe(
      'You have 5 vehicles set up, all that the plan covers. To add another, ask WagonWise to raise your plan.',
    );
  });

  it('copes with one vehicle', () => {
    expect(vehicleLimitText({ ...base, vehiclesInUse: 1, detailsOnFile: true }).text).toContain(
      'You have 1 vehicle set up.',
    );
  });
});
