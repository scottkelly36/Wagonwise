/** The one line a driver sees where their firm's job would be, when the firm's account is paused. Their free app (routing, hazards, SOS)
 *  carries on, and the line says so. */
export function pausedCompanyMessage(companyName: string): string {
  return `${companyName}'s account is paused, so its jobs are switched off for now. Routing, hazards and SOS still work.`;
}
