import { useThemeStore } from '../state/theme-store';

export interface ThemeColors {
  /** Screen/panel background. */
  readonly background: string;
  /** Chip/input/tab background — one step away from `background`. */
  readonly surface: string;
  /** A more prominent surface: active/selected tab fill, drag handles. */
  readonly surfaceStrong: string;
  /** Subtle dividing lines (list separators, suggestion-list borders). */
  readonly divider: string;
  /** Primary text/headings. */
  readonly text: string;
  /** Body text one step down from `text` (list items, detail copy). */
  readonly textSecondary: string;
  /** Labels, section titles, hints. */
  readonly textMuted: string;
  /** Footnotes and other de-emphasised text; also doubles as an outline-button border. */
  readonly textDim: string;
  /** Text sat on top of an accent-coloured button or chip — stays dark in both themes since the
   *  accent colours themselves don't change with theme. */
  readonly textOnAccent: string;
  /** Brand blue, sampled from the app icon's road/arrow (2026-09-26, replacing the earlier
   *  orange) — primary actions (buttons, selected chips). Constant across themes. Distinct from
   *  `accentBlue` below on purpose: this is "do the primary thing," that's "informational/
   *  active state" — kept as two tokens even though they're both blue now, since they still mean
   *  different things and may need to diverge again later. */
  readonly accent: string;
  /** Sky blue — origin pin, links, active-tab border. Constant across themes. */
  readonly accentBlue: string;
  /** Green — success/current-position pin. Constant across themes. */
  readonly accentGreen: string;
  /** Errors. Deliberately a different shade per theme (see `lightColors`) — the dark theme's
   *  soft red doesn't have enough contrast against a light background. */
  readonly danger: string;
}

// The app's whole colour palette before the light/dark feature was these ten-odd hex values,
// hardcoded on every screen (docs/progress.md's field-testing backlog, 2026-09-25) — kept as-is
// here so switching to "dark" changed nothing anyone had already seen. `accent` is the one
// exception, updated 2026-09-26 from the original orange to a blue sampled from the app icon.
export const darkColors: ThemeColors = {
  background: '#0B1220',
  surface: '#1F2937',
  surfaceStrong: '#334155',
  divider: '#1F2937',
  text: '#FFFFFF',
  textSecondary: '#E5E7EB',
  textMuted: '#9CA3AF',
  textDim: '#6B7280',
  textOnAccent: '#0B1220',
  accent: '#00A4FE',
  accentBlue: '#38BDF8',
  accentGreen: '#34D399',
  danger: '#F87171',
};

// A close-to-systematic swap of the dark palette (dark's `surface` becomes light's
// `textSecondary` and vice versa) rather than a from-scratch design — keeps the two themes
// reading as genuinely the same app. `danger` and the background/surface tones are the
// exceptions, tuned for contrast against a light background instead of swapped directly.
export const lightColors: ThemeColors = {
  background: '#F8FAFC',
  surface: '#E5E7EB',
  surfaceStrong: '#CBD5E1',
  divider: '#E2E8F0',
  text: '#0B1220',
  textSecondary: '#1F2937',
  textMuted: '#4B5563',
  textDim: '#6B7280',
  textOnAccent: '#0B1220',
  accent: '#00A4FE',
  accentBlue: '#38BDF8',
  accentGreen: '#34D399',
  danger: '#DC2626',
};

/** The app's map (`components/route-map.tsx`) and its pins/hazard markers are deliberately left
 *  out of this — MapLibre tiles don't repaint for an app-chrome theme switch, so nothing there
 *  reads as "light mode" or "dark mode" either way; only the screens around the map do. */
export function useThemeColors(): ThemeColors {
  const mode = useThemeStore((s) => s.mode);
  return mode === 'light' ? lightColors : darkColors;
}
