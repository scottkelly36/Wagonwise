import { useTripTollsStore } from './trip-tolls-store';

beforeEach(() => useTripTollsStore.setState({ avoiding: {} }));

it('remembers a route chosen for having no toll, and nothing else', () => {
  useTripTollsStore.getState().markAvoiding('plan-1');
  expect(useTripTollsStore.getState().isAvoiding('plan-1')).toBe(true);
  expect(useTripTollsStore.getState().isAvoiding('plan-2')).toBe(false);
  expect(useTripTollsStore.getState().isAvoiding(undefined)).toBe(false);
});

it('carries the choice to a plan made from it, and only when there was a choice', () => {
  useTripTollsStore.getState().markAvoiding('plan-1');
  useTripTollsStore.getState().carryOver('plan-1', 'plan-2');
  useTripTollsStore.getState().carryOver('plan-3', 'plan-4');
  expect(useTripTollsStore.getState().isAvoiding('plan-2')).toBe(true);
  expect(useTripTollsStore.getState().isAvoiding('plan-4')).toBe(false);
});
