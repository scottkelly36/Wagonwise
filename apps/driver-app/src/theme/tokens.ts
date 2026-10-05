import type { ViewStyle } from 'react-native';

import type { ThemeColors } from './colors';

/** Corner radii: soft and generous, so cards and sheets read as one family. */
export const radius = {
  card: 16,
  sheet: 24,
  badge: 14,
  pill: 999,
} as const;

/** The lifted look shared by floating cards: a white (or dark-slate) card with a soft shadow, so it
 *  stays legible over a busy map in both themes. */
export function cardStyle(colors: ThemeColors): ViewStyle {
  return {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    shadowColor: '#0B1220',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  };
}
