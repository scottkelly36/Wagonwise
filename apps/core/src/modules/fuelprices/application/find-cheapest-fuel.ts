import type { Clock } from '../../../shared/ports/clock.js';
import {
  MIN_SHARE_OF_MEDIAN,
  type FuelPosition,
  type FuelType,
  type NearbyFuel,
} from '../domain/fuel.js';
import type { FuelRepository } from './fuel-repository.js';

const MS_PER_DAY = 86_400_000;

export interface FindCheapestFuelDeps {
  readonly repo: FuelRepository;
  readonly clock: Clock;
}

export interface FindCheapestFuelInput {
  readonly centre: FuelPosition;
  readonly radiusM: number;
  readonly fuelType: FuelType;
  /** Leave out prices last reported more than this many days ago; undefined keeps them all (the answer carries each one's age). */
  readonly maxAgeDays: number | undefined;
  readonly limit: number;
}

/**
 * The stations around a point, cheapest first for one fuel. Closed stations are never listed, and a price far below the national
 * median is left out as a typing slip. Old prices stay unless asked to go: Fuel Finder retailers report rarely, so the caller shows
 * each price's age rather than hiding a third of the country.
 */
export async function findCheapestFuel(
  deps: FindCheapestFuelDeps,
  input: FindCheapestFuelInput,
): Promise<NearbyFuel> {
  const median = await deps.repo.nationalMedian(input.fuelType);
  return deps.repo.findNearby({
    centre: input.centre,
    radiusM: input.radiusM,
    fuelType: input.fuelType,
    minPencePerLitre: median === undefined ? undefined : median * MIN_SHARE_OF_MEDIAN,
    updatedSince:
      input.maxAgeDays === undefined
        ? undefined
        : new Date(deps.clock.now().getTime() - input.maxAgeDays * MS_PER_DAY),
    limit: input.limit,
  });
}
