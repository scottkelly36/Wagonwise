import type { Clock } from '../../../shared/ports/clock.js';
import { err, ok, type Result } from '../../../shared/result.js';
import { formatCode } from '../domain/company-code.js';
import type { CompanyId } from '../domain/vehicle.js';
import { canManageFleet } from './authorization.js';
import type { Forbidden } from './errors.js';
import type { Caller } from './ports/caller-directory.js';
import type { CodeGenerator, CompanyCodeRepository } from './ports/company-code-repository.js';

export interface CompanyCodeDeps {
  readonly codes: CompanyCodeRepository;
  readonly generator: CodeGenerator;
  readonly clock: Clock;
}

interface Input {
  readonly caller: Caller;
  readonly companyId: CompanyId;
}

/** The company's join code, made the first time staff ask for it. Shown as ABCD-2345. */
export async function getCompanyCode(
  deps: CompanyCodeDeps,
  input: Input,
): Promise<Result<string, Forbidden>> {
  if (!canManageFleet(input.caller, input.companyId)) return err({ tag: 'Forbidden' });
  const existing = await deps.codes.findByCompany(input.companyId);
  if (existing !== null) return ok(formatCode(existing));
  return ok(await makeNew(deps, input.companyId));
}

/** A new code: the old one stops working at once (use if it has leaked). */
export async function regenerateCompanyCode(
  deps: CompanyCodeDeps,
  input: Input,
): Promise<Result<string, Forbidden>> {
  if (!canManageFleet(input.caller, input.companyId)) return err({ tag: 'Forbidden' });
  return ok(await makeNew(deps, input.companyId));
}

async function makeNew(deps: CompanyCodeDeps, companyId: CompanyId): Promise<string> {
  const code = deps.generator.generate();
  await deps.codes.save(companyId, code, deps.clock.now());
  return formatCode(code);
}
