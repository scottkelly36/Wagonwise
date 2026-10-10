import { comparisonText, savingText } from './faster-route';

it('says the saving in whole minutes', () => {
  expect(savingText(8)).toBe('Faster route: saves 8 minutes');
  expect(savingText(1)).toBe('Faster route: saves 1 minute');
});

it('compares the two times', () => {
  expect(comparisonText(60, 52)).toBe('52 min instead of 60 min, counting traffic.');
});
