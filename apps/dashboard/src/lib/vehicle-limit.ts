/**
 * What the Plan page says about how many vehicles a company can set up. While no payment details are on file the plan's room is a
 * limit; once they are there is none, because the company is billed on the vehicles it uses. Without a payment provider (nothing to
 * add details to) the limit can only be raised by WagonWise.
 */
export function vehicleLimitText(input: {
  readonly capacityToday: number;
  readonly vehiclesInUse: number;
  readonly detailsOnFile: boolean;
  readonly paymentsAvailable: boolean;
}): { readonly limited: boolean; readonly text: string } {
  const have = `You have ${input.vehiclesInUse} vehicle${input.vehiclesInUse === 1 ? '' : 's'} set up`;
  if (input.detailsOnFile) {
    return {
      limited: false,
      text: `${have}. There is no limit on how many you can add: you pay for the ones you use.`,
    };
  }
  const room = input.capacityToday - input.vehiclesInUse;
  const raise = input.paymentsAvailable
    ? 'Add your payment details above to remove the limit.'
    : 'To add another, ask WagonWise to raise your plan.';
  if (room > 0) {
    return { limited: true, text: `${have}, so you can add ${room} more. ${raise}` };
  }
  return {
    limited: true,
    text:
      room === 0
        ? `${have}, all that the plan covers. ${raise}`
        : `${have}, more than the plan covers. You can’t add any more. ${raise}`,
  };
}
