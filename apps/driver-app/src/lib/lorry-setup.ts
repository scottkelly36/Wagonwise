import type { FromMode } from './route-points';
import { VEHICLE_PRESETS, type VehiclePreset } from './vehicle-presets';

/**
 * The guided set-up before a first route (the first-trip redesign, steps 1 to 4): what you drive, what you are carrying, where you
 * start, then where you are heading on the Plan route screen. Pure helpers only; the screens are `app/setup-lorry.tsx` and
 * `app/plan-route.tsx`.
 */

export const SETUP_STEPS = 4;

/** What the driver has picked on the vehicle step: one of their saved vehicles, or a preset size to save as a new one. */
export type VehicleSelection =
  | { readonly kind: 'profile'; readonly id: string }
  | { readonly kind: 'preset'; readonly id: string };

interface NamedProfile {
  readonly id: string;
  readonly name: string;
}

/** The driver's usual lorry, if it is still one of their saved vehicles; otherwise their only vehicle, when they have just one. */
export function usualProfile<T extends NamedProfile>(
  profiles: readonly T[] | undefined,
  usualId: string | undefined,
): T | undefined {
  if (profiles === undefined) return undefined;
  const usual = usualId === undefined ? undefined : profiles.find((p) => p.id === usualId);
  return usual ?? (profiles.length === 1 ? profiles[0] : undefined);
}

/** Whether the driver has set a usual lorry that is still one of their saved vehicles. */
export function hasUsual(
  profiles: readonly NamedProfile[] | undefined,
  usualId: string | undefined,
): boolean {
  return usualId !== undefined && profiles !== undefined && profiles.some((p) => p.id === usualId);
}

/**
 * Whether Where to? starts with the set-up steps: until the driver has a usual lorry ("Where to? does the same until a lorry is
 * set", the design canvas). Not while the vehicles are still loading or could not be fetched (no signal): Plan route then opens as
 * before, rather than a set-up that cannot list the driver's vehicles.
 */
export function needsSetup(
  profiles: readonly NamedProfile[] | undefined,
  usualId: string | undefined,
): boolean {
  return profiles !== undefined && !hasUsual(profiles, usualId);
}

/** What the vehicle step starts with: the usual lorry, else the only saved one, else nothing (a new driver picks a size). */
export function initialSelection(
  profiles: readonly NamedProfile[] | undefined,
  usualId: string | undefined,
): VehicleSelection | undefined {
  const usual = usualProfile(profiles, usualId);
  return usual === undefined ? undefined : { kind: 'profile', id: usual.id };
}

export function presetById(id: string): VehiclePreset | undefined {
  return VEHICLE_PRESETS.find((p) => p.id === id);
}

/** How the vehicle was chosen, as the flow events' fixed list names it: a preset's id, or `existing` for a saved one. */
export function vehicleChoice(selection: VehicleSelection): string {
  return selection.kind === 'preset' ? selection.id : 'existing';
}

/** The Plan route screen's parameters at the end of the set-up, so it opens on the heading-to step with the rest filled in. */
export interface PlanAfterSetup {
  readonly profile: string;
  readonly from: FromMode;
  readonly chosen: string;
  readonly via: 'setup';
}

export function planParams(profileId: string, from: FromMode, chosen: string): PlanAfterSetup {
  return { profile: profileId, from, chosen, via: 'setup' };
}

/** A route parameter as one string, or undefined (expo-router gives a string, an array or nothing). */
export function param(value: string | readonly string[] | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** The start mode a Plan route parameter asks for; anything else is the driver's own position. */
export function fromParam(value: string | undefined): FromMode {
  return value === 'search' || value === 'map' ? value : 'here';
}

/** One line for the summary card: "Artic, 44 tonnes · Normal load". */
export function lorrySummary(name: string, loaded: boolean): string {
  return `${name} · ${loaded ? 'Hill-sensitive load' : 'Normal load'}`;
}
