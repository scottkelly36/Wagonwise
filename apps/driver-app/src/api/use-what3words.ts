import { useMutation } from '@tanstack/react-query';

import { useAccessToken } from '../hooks/use-access-token';
import * as what3wordsApi from './what3words';

/** Looks up three words when the driver asks. A mutation, not a query: each lookup is billed, so nothing is fetched on its own,
 *  retried, or repeated when the screen is revisited. */
export function useWordsToLocation() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (words: string) => what3wordsApi.wordsToLocation(accessToken, words),
    retry: false,
  });
}

/** The three words for a position, when the driver asks (the SOS screen, a shown location). */
export function useLocationToWords() {
  const accessToken = useAccessToken();
  return useMutation({
    mutationFn: (location: { lat: number; lon: number }) =>
      what3wordsApi.locationToWords(accessToken, location),
    retry: false,
  });
}
