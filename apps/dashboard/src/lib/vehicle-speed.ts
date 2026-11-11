export const KPH_PER_MPH = 1.609344;
/** 19 to 80 mph, which is core's 30 to 130 km/h. */
export const MIN_TOP_SPEED_MPH = 19;
export const MAX_TOP_SPEED_MPH = 80;

export type TopSpeedCheck =
  | { readonly ok: true; readonly kph: number | undefined }
  | { readonly ok: false; readonly message: string };

/** A top speed typed in miles per hour, as the km/h core stores. Blank is fine (the usual speed is used); anything else must be in range. */
export function topSpeedKphFromMph(text: string): TopSpeedCheck {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, kph: undefined };
  const mph = Number(trimmed);
  if (!Number.isFinite(mph) || mph < MIN_TOP_SPEED_MPH || mph > MAX_TOP_SPEED_MPH) {
    return {
      ok: false,
      message: `Top speed should be between ${MIN_TOP_SPEED_MPH} and ${MAX_TOP_SPEED_MPH} mph.`,
    };
  }
  return { ok: true, kph: Math.round(mph * KPH_PER_MPH * 10) / 10 };
}

/** The Euro VI choice as core stores it: left as "Not stated" it is absent, which a zone treats as a charge that may apply, never as compliant. */
export function euroVIFromChoice(choice: '' | 'yes' | 'no'): boolean | undefined {
  return choice === '' ? undefined : choice === 'yes';
}
