import { MANEUVER_ICONS } from './maneuver-icons';

describe('MANEUVER_ICONS', () => {
  it('draws a road exit as an arrow, not a person running out of a door', () => {
    expect(MANEUVER_ICONS.exit_left).toBe('arrow-top-left-thick');
    expect(MANEUVER_ICONS.exit_right).toBe('arrow-top-right-thick');
    for (const icon of Object.values(MANEUVER_ICONS)) {
      expect(icon).not.toMatch(/run|walk|door/);
    }
  });

  it('keeps an exit apart from keeping left or right', () => {
    expect(MANEUVER_ICONS.exit_left).not.toBe(MANEUVER_ICONS.keep_left);
    expect(MANEUVER_ICONS.exit_right).not.toBe(MANEUVER_ICONS.keep_right);
  });
});
