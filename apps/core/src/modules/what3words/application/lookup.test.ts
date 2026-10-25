import { describe, expect, it } from 'vitest';
import { err, ok } from '../../../shared/result.js';
import type { What3wordsAddress } from '../domain/words.js';
import { locationToWords, wordsToLocation } from './lookup.js';
import type { WordsProvider } from './words-provider.js';

const address: What3wordsAddress = {
  words: 'filled.count.soap',
  location: { lat: 51.52, lon: -0.2 },
  nearestPlace: 'Bayswater, London',
  country: 'GB',
};

function provider(enabled = true) {
  const asked: string[] = [];
  const fake: WordsProvider = {
    enabled,
    toLocation: (words) => {
      asked.push(words);
      return Promise.resolve(
        words === 'filled.count.soap' ? ok(address) : err({ tag: 'WordsNotFound' as const }),
      );
    },
    toWords: () => Promise.resolve(ok(address)),
  };
  return { fake, asked };
}

describe('wordsToLocation', () => {
  it('asks the service for the cleaned-up words', async () => {
    const { fake, asked } = provider();
    expect(await wordsToLocation(fake, '///Filled Count Soap')).toEqual({
      ok: true,
      value: address,
    });
    expect(asked).toEqual(['filled.count.soap']);
  });

  it('refuses something that is not three words without asking the service', async () => {
    const { fake, asked } = provider();
    expect(await wordsToLocation(fake, 'filled.count')).toEqual({
      ok: false,
      error: { tag: 'InvalidWords' },
    });
    expect(asked).toEqual([]);
  });

  it('passes on a square that does not exist', async () => {
    const { fake } = provider();
    expect(await wordsToLocation(fake, 'index.home.raft')).toEqual({
      ok: false,
      error: { tag: 'WordsNotFound' },
    });
  });

  it('is unavailable without a key, and asks nothing', async () => {
    const { fake, asked } = provider(false);
    expect(await wordsToLocation(fake, 'filled.count.soap')).toEqual({
      ok: false,
      error: { tag: 'LookupUnavailable' },
    });
    expect(asked).toEqual([]);
  });
});

describe('locationToWords', () => {
  it('gives the words for a position, and is unavailable without a key', async () => {
    expect(await locationToWords(provider().fake, { lat: 51.52, lon: -0.2 })).toEqual({
      ok: true,
      value: address,
    });
    expect(await locationToWords(provider(false).fake, { lat: 51.52, lon: -0.2 })).toEqual({
      ok: false,
      error: { tag: 'LookupUnavailable' },
    });
  });
});
