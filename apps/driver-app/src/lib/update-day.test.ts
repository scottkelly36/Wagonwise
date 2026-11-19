import { updateDay } from './update-day';

it('is the publish day of the update the phone runs, in UTC', () => {
  expect(updateDay(new Date('2026-11-18T23:30:00.000Z'), false)).toBe('2026-11-18');
});

it('is nothing for the store build’s own code, or an unknown time', () => {
  expect(updateDay(new Date('2026-11-18T10:00:00.000Z'), true)).toBeUndefined();
  expect(updateDay(null, false)).toBeUndefined();
  expect(updateDay(new Date('nonsense'), false)).toBeUndefined();
});
