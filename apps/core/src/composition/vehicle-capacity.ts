/**
 * How many vehicles a company may set up. While it has no payment details on file, that is what its plan allows (the free trial's
 * room, or what WagonWise set). Once it has added a card or bank details there is no limit: it is billed on the vehicles it uses, so a
 * growing firm is never blocked and nothing needs raising by hand. A company that loses its details (they were removed, or the payment
 * provider's customer was replaced) is back on its plan's limit: the vehicles it has stay, only adding more is held.
 */
export const NO_LIMIT = Number.MAX_SAFE_INTEGER;

export function vehicleLimit(
  planCapacity: (companyId: string) => Promise<number>,
  hasPaymentDetails: (companyId: string) => Promise<boolean>,
): (companyId: string) => Promise<number> {
  return async (companyId) =>
    (await hasPaymentDetails(companyId)) ? NO_LIMIT : planCapacity(companyId);
}
