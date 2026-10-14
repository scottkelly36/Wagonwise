import { err, ok, type Result } from '../../../shared/result.js';
import {
  normalizeDriverName,
  setName,
  type Driver,
  type DriverId,
  type NameTooLong,
} from '../domain/driver.js';
import type { DriverNotFound } from './errors.js';
import type { DriverRepository } from './ports/driver-repository.js';

export type SetDriverNameError = DriverNotFound | NameTooLong;

export interface SetDriverNameDeps {
  readonly driverRepo: DriverRepository;
}

export interface SetDriverNameInput {
  readonly driverId: DriverId;
  /** As typed. Empty clears the name. */
  readonly name: string;
}

/** A driver gives (or clears) the name companies see them by. Optional and changeable at any time. */
export async function setDriverName(
  deps: SetDriverNameDeps,
  input: SetDriverNameInput,
): Promise<Result<Driver, SetDriverNameError>> {
  const name = normalizeDriverName(input.name);
  if (!name.ok) return name;
  const driver = await deps.driverRepo.findById(input.driverId);
  if (!driver) return err({ tag: 'DriverNotFound' });
  const named = setName(driver, name.value);
  await deps.driverRepo.save(named);
  return ok(named);
}
