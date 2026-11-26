import { FID } from './card-files';
import type { SimulatedCardOptions } from './simulated-card';

export interface Scenario {
  readonly id: string;
  readonly label: string;
  /** What to expect, in a few words. */
  readonly expect: string;
  readonly options: SimulatedCardOptions;
}

/** The pretend cards the test screen offers, so every outcome can be watched without a reader or a card. */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'good',
    label: 'A good card',
    expect: 'Reads every file and ends with a summary.',
    options: {},
  },
  {
    id: 't0',
    label: 'A card that answers in pieces',
    expect: 'Same result: the reader collects the pieces.',
    options: { t0: true },
  },
  {
    id: 'older',
    label: 'An older card',
    expect: 'Reads, and says one optional file is not on it.',
    options: { missing: [FID.SPECIFIC_CONDITIONS] },
  },
  {
    id: 'none',
    label: 'No card in the reader',
    expect: 'Says there is no card.',
    options: { noCard: true },
  },
  {
    id: 'removed',
    label: 'Card pulled out part way',
    expect: 'Stops and says the card was taken out.',
    options: { removeAfterCommands: 60 },
  },
  {
    id: 'workshop',
    label: 'The wrong kind of card',
    expect: 'Says it is not a driver card.',
    options: { cardType: 2 },
  },
  {
    id: 'unsigned',
    label: 'A card that will not sign',
    expect: 'Says the copy would not be a proper download.',
    options: { refuseSigning: true },
  },
  {
    id: 'damaged',
    label: 'A card missing a file',
    expect: 'Says the card did not have something it should.',
    options: { missing: [FID.DRIVER_ACTIVITY_DATA] },
  },
];
