import type {
  WeatherWarningDto,
  WeatherWarningKind,
  WeatherWarningLevel,
} from '@wagonwise/contracts/weather';

import type { IconName } from '../components/ui/icon';

/** The Met Office's own colours. */
export const LEVEL_COLOURS: Record<WeatherWarningLevel, string> = {
  yellow: '#F5C400',
  amber: '#F28C00',
  red: '#D4261C',
};

const LEVEL_LABELS: Record<WeatherWarningLevel, string> = {
  yellow: 'Yellow',
  amber: 'Amber',
  red: 'Red',
};

const KIND_LABELS: Record<WeatherWarningKind, string> = {
  wind: 'wind',
  rain: 'rain',
  snow: 'snow',
  ice: 'ice',
  fog: 'fog',
  thunderstorm: 'thunderstorms',
  heat: 'heat',
  other: 'weather',
};

export const KIND_ICONS: Record<WeatherWarningKind, IconName> = {
  wind: 'weather-windy',
  rain: 'weather-pouring',
  snow: 'weather-snowy-heavy',
  ice: 'snowflake-alert',
  fog: 'weather-fog',
  thunderstorm: 'weather-lightning',
  heat: 'thermometer-high',
  other: 'weather-cloudy-alert',
};

const LEVEL_ORDER: Record<WeatherWarningLevel, number> = { yellow: 0, amber: 1, red: 2 };

/** A position to the nearest tenth of a degree (about 10 km), so the query key only changes when the
 *  driver has really moved on. */
export function roundedForWeather(point: { readonly lat: number; readonly lon: number }) {
  return { lat: Math.round(point.lat * 10) / 10, lon: Math.round(point.lon * 10) / 10 };
}

/** "Amber wind" / "Yellow rain and wind". */
export function warningTitle(warning: Pick<WeatherWarningDto, 'level' | 'kinds'>): string {
  const kinds = warning.kinds.map((k) => KIND_LABELS[k]);
  const what =
    kinds.length <= 1
      ? (kinds[0] ?? 'weather')
      : `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}`;
  return `${LEVEL_LABELS[warning.level]} ${what}`;
}

/** The warning to show on the badge: the most severe, the one in force before one still to come, then
 *  the sooner to start. */
export function headlineWarning(
  warnings: readonly WeatherWarningDto[],
  now: Date,
): WeatherWarningDto | undefined {
  const inForce = (w: WeatherWarningDto) => new Date(w.validFrom).getTime() <= now.getTime();
  return [...warnings].sort(
    (a, b) =>
      LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] ||
      Number(inForce(b)) - Number(inForce(a)) ||
      new Date(a.validFrom).getTime() - new Date(b.validFrom).getTime(),
  )[0];
}

/** "Thu 14:00 to Fri 06:00". */
export function warningWhen(warning: Pick<WeatherWarningDto, 'validFrom' | 'validTo'>): string {
  const format = (iso: string) =>
    new Date(iso).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
  return `${format(warning.validFrom)} to ${format(warning.validTo)}`;
}
