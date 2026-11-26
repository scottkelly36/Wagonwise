/**
 * Whether the pretend-card screen is offered: in development, and in the test builds EAS makes with the `preview` profile (which sets
 * `EXPO_PUBLIC_CARD_SIMULATOR`). Never in the store builds, so a driver is never shown a fake card.
 */
export function cardSimulatorEnabled(): boolean {
  return __DEV__ || process.env.EXPO_PUBLIC_CARD_SIMULATOR === 'true';
}
