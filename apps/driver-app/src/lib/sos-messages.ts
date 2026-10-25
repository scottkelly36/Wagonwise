import type { RaiseSosResponse } from '@wagonwise/contracts/sos';

/** Said on the screen after pressing, always: what WagonWise did and did not do. */
export const NOT_EMERGENCY_SERVICES =
  'This does not call the emergency services. If you need them, call 999.';

/** The position as text to read out, for when there are no three words. */
export function positionText(location: { lat: number; lon: number }): string {
  return `${location.lat.toFixed(5)}, ${location.lon.toFixed(5)}`;
}

/** What to read out to someone on the phone: the three words, or the position when there are none. */
export function readOutText(sent: Pick<RaiseSosResponse, 'words' | 'location'>): string {
  return sent.words === undefined ? positionText(sent.location) : `///${sent.words}`;
}

/**
 * What to read out, one line for each word, so a long word never wraps in the middle: ["///recapture.", "streaking.", "parent"].
 * With no three words, the position on one line.
 */
export function readOutLines(sent: Pick<RaiseSosResponse, 'words' | 'location'>): string[] {
  if (sent.words === undefined) return [positionText(sent.location)];
  const words = sent.words.split('.');
  return words.map((word, i) => `${i === 0 ? '///' : ''}${word}${i < words.length - 1 ? '.' : ''}`);
}

/** The company names as a sentence: "Acme", "Acme and Beta", "Acme, Beta and Gamma". */
export function namesText(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** What WagonWise did with the press, in plain words. */
export function outcomeText(sent: Pick<RaiseSosResponse, 'notified'>): string {
  if (sent.notified.length === 0) {
    return 'Nobody was told: you are not with a company in WagonWise. Read these to whoever you ring.';
  }
  return `${namesText(sent.notified.map((n) => n.name))} ${sent.notified.length === 1 ? 'has' : 'have'} been told where you are, with your name, number and vehicle.`;
}
