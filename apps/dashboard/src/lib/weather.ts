import type {
  WeatherWarningKind,
  WeatherWarningLevel,
  WeatherWarningsWithAreasResponse,
} from '@wagonwise/contracts/weather';

type Warning = WeatherWarningsWithAreasResponse['warnings'][number];

/** The Met Office's own colours. */
export const LEVEL_COLOURS: Record<WeatherWarningLevel, string> = {
  yellow: '#f5c400',
  amber: '#f28c00',
  red: '#d4261c',
};

export const LEVEL_LABELS: Record<WeatherWarningLevel, string> = {
  yellow: 'Yellow',
  amber: 'Amber',
  red: 'Red',
};

export const KIND_LABELS: Record<WeatherWarningKind, string> = {
  wind: 'wind',
  rain: 'rain',
  snow: 'snow',
  ice: 'ice',
  fog: 'fog',
  thunderstorm: 'thunderstorms',
  heat: 'heat',
  other: 'weather',
};

const LEVEL_ORDER: Record<WeatherWarningLevel, number> = { yellow: 0, amber: 1, red: 2 };

/** "Amber wind" / "Yellow rain and wind". */
export function warningTitle(warning: Pick<Warning, 'level' | 'kinds'>): string {
  const kinds = warning.kinds.map((k) => KIND_LABELS[k]);
  const what =
    kinds.length <= 1
      ? (kinds[0] ?? 'weather')
      : `${kinds.slice(0, -1).join(', ')} and ${kinds.at(-1)}`;
  return `${LEVEL_LABELS[warning.level]} ${what}`;
}

const WHEN = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

/** "Thu 14:00 to Fri 06:00". */
export function warningWhen(warning: Pick<Warning, 'validFrom' | 'validTo'>): string {
  return `${WHEN.format(new Date(warning.validFrom))} to ${WHEN.format(new Date(warning.validTo))}`;
}

/** The worst level among warnings, or undefined when there are none. */
export function worstLevel(
  warnings: readonly Pick<Warning, 'level'>[],
): WeatherWarningLevel | undefined {
  let worst: WeatherWarningLevel | undefined;
  for (const w of warnings) {
    if (worst === undefined || LEVEL_ORDER[w.level] > LEVEL_ORDER[worst]) worst = w.level;
  }
  return worst;
}

/** The warnings as GeoJSON for the map, least severe first so the worst is drawn on top. */
export function warningsGeoJson(warnings: readonly Warning[]) {
  return {
    type: 'FeatureCollection' as const,
    features: [...warnings]
      .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
      .map((w) => ({
        type: 'Feature' as const,
        properties: { id: w.id, colour: LEVEL_COLOURS[w.level], title: warningTitle(w) },
        geometry: w.area,
      })),
  };
}
