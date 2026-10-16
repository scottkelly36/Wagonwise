import { comparisonText, savingText } from './faster-route';

it('says the saving in whole minutes', () => {
  expect(savingText(8)).toBe('Faster route: saves 8 minutes');
  expect(savingText(1)).toBe('Faster route: saves 1 minute');
  expect(savingText(65)).toBe('Faster route: saves 1 h 5 min');
});

it('compares the two times', () => {
  expect(comparisonText(60, 52)).toBe('52 min instead of 1 h, counting traffic.');
  expect(comparisonText(355, 301)).toBe('5 h 1 min instead of 5 h 55 min, counting traffic.');
});
