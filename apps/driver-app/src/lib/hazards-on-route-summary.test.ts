import { hazardsToggleLabel } from './hazards-on-route-summary';

describe('hazardsToggleLabel', () => {
  it('says how many hazards are on the route and what a tap does', () => {
    expect(hazardsToggleLabel(0, false)).toBe('No hazards reported on this route. Show the list.');
    expect(hazardsToggleLabel(1, false)).toBe('1 hazard on this route. Show the list.');
    expect(hazardsToggleLabel(3, true)).toBe('3 hazards on this route. Hide the list.');
  });
});
