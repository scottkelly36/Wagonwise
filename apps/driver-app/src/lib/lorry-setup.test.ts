import {
  fromParam,
  hasUsual,
  initialSelection,
  lorrySummary,
  needsSetup,
  param,
  planParams,
  usualProfile,
  vehicleChoice,
} from './lorry-setup';

const a = { id: 'a', name: 'Artic' };
const b = { id: 'b', name: 'Rigid' };

describe('usualProfile', () => {
  it('is the usual lorry while it is still saved', () => {
    expect(usualProfile([a, b], 'b')).toBe(b);
  });

  it('falls back to the only vehicle, and to none when there are several and no usual', () => {
    expect(usualProfile([a], 'gone')).toBe(a);
    expect(usualProfile([a, b], 'gone')).toBeUndefined();
    expect(usualProfile([a, b], undefined)).toBeUndefined();
    expect(usualProfile(undefined, 'a')).toBeUndefined();
  });
});

it('asks for set-up until there is a usual lorry, and not while the vehicles are unknown', () => {
  expect(needsSetup(undefined, undefined)).toBe(false);
  expect(needsSetup([], undefined)).toBe(true);
  expect(needsSetup([a], undefined)).toBe(true);
  expect(needsSetup([a], 'gone')).toBe(true);
  expect(needsSetup([a, b], 'b')).toBe(false);
  expect(hasUsual([a], 'a')).toBe(true);
  expect(hasUsual(undefined, 'a')).toBe(false);
});

it('starts the vehicle step on the usual lorry', () => {
  expect(initialSelection([a, b], 'a')).toEqual({ kind: 'profile', id: 'a' });
  expect(initialSelection([], undefined)).toBeUndefined();
});

it('names the choice as the flow events list does', () => {
  expect(vehicleChoice({ kind: 'preset', id: 'artic-44' })).toBe('artic-44');
  expect(vehicleChoice({ kind: 'profile', id: 'a' })).toBe('existing');
});

it('reads route parameters safely', () => {
  expect(param('x')).toBe('x');
  expect(param(['x'])).toBeUndefined();
  expect(param('')).toBeUndefined();
  expect(fromParam('map')).toBe('map');
  expect(fromParam('elsewhere')).toBe('here');
  expect(fromParam(undefined)).toBe('here');
  expect(planParams('p', 'search', 'existing')).toEqual({
    profile: 'p',
    from: 'search',
    chosen: 'existing',
    via: 'setup',
  });
});

it('sums up the lorry and load in one line', () => {
  expect(lorrySummary('Artic, 44 tonnes', false)).toBe('Artic, 44 tonnes · Normal load');
  expect(lorrySummary('Artic, 44 tonnes', true)).toBe('Artic, 44 tonnes · Hill-sensitive load');
});
