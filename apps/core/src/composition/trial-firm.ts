import type { BillingModule } from '../modules/billing/api.js';
import type { CompaniesModule } from '../modules/companies/api.js';
import type { FirmStarter } from '../modules/signups/api.js';
import { ok } from '../shared/result.js';

/** How many vehicles a trial opened from a website sign-up has room for (the plan's capacity), so the firm can add its first ones. */
export const TRIAL_VEHICLES = 5;

/**
 * What the Testers page's "Start trial" does: `companies` makes the company on a trial and invites its first person, then `billing`
 * gives its plan room for a few vehicles. A new company's plan covers none, and fleet refuses to create a vehicle beyond the plan, so
 * without this the firm could sign in and not add one. If the plan cannot be set the firm and its invitation still stand and the
 * answer says 0 vehicles, so the page tells the owner to set it on the Plans page.
 */
export function trialFirmStarter(
  companies: Pick<CompaniesModule, 'startTrialFirm' | 'startSelfServeTrialFirm'>,
  billing: Pick<BillingModule, 'giveStartingCapacity'>,
): FirmStarter {
  return {
    startTrialFirm: async (input) => {
      const made = await companies.startTrialFirm(input);
      if (!made.ok) return made;
      let vehicles = 0;
      try {
        await billing.giveStartingCapacity(made.value.companyId, TRIAL_VEHICLES, input.staffId);
        vehicles = TRIAL_VEHICLES;
      } catch {
        // Left at 0: the owner sets the plan by hand.
      }
      return ok({ ...made.value, vehicles });
    },
    // A firm that confirmed its own email address: the same, with no WagonWise staff member involved (the plan's room has no setter).
    startSelfServeTrialFirm: async (input) => {
      const made = await companies.startSelfServeTrialFirm(input);
      if (!made.ok) return made;
      let vehicles = 0;
      try {
        await billing.giveStartingCapacity(made.value.companyId, TRIAL_VEHICLES, null);
        vehicles = TRIAL_VEHICLES;
      } catch {
        // Left at 0: the owner sets the plan by hand.
      }
      return ok({ ...made.value, vehicles });
    },
  };
}
