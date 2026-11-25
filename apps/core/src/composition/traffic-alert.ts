/** How often the owner is emailed about the same traffic problem. TomTom refusing calls goes on for hours, so once is enough. */
export const TRAFFIC_ALERT_EVERY_MS = 6 * 60 * 60 * 1000;

export type TrafficProblem = 'flow' | 'incidents' | 'limit';

/**
 * What to do when the traffic service says a TomTom call failed or the day's allowance ran out: log it always, and email the owner at most
 * once every few hours for each kind, so a refused key or a used-up allowance is heard about before drivers say there is no traffic. With
 * no alert address set it only logs. A failing email never reaches the caller: it is traffic that is the problem, not the alert.
 */
export function trafficProblemHandler(deps: {
  readonly now: () => Date;
  readonly log: (what: TrafficProblem, error: unknown) => void;
  readonly email: ((subject: string, text: string) => Promise<void>) | undefined;
}): (what: TrafficProblem, error?: unknown) => void {
  const lastEmailed = new Map<TrafficProblem, number>();
  return (what, error) => {
    deps.log(what, error);
    if (deps.email === undefined) return;
    const at = deps.now().getTime();
    const last = lastEmailed.get(what);
    if (last !== undefined && at - last < TRAFFIC_ALERT_EVERY_MS) return;
    lastEmailed.set(what, at);
    const reason = error instanceof Error ? error.message : undefined;
    const subject =
      what === 'limit'
        ? "Live traffic: the day's TomTom allowance is used up"
        : 'Live traffic: TomTom is refusing calls';
    const text = [
      what === 'limit'
        ? "WagonWise's own daily limit on TomTom calls has been reached, so routes are planned without live traffic until tomorrow (UTC)."
        : `A call to TomTom's ${what === 'flow' ? 'traffic flow' : 'traffic incidents'} service failed, so routes are being planned without live traffic.`,
      ...(reason === undefined ? [] : ['', `What TomTom said: ${reason}`]),
      '',
      'If TomTom says there are not enough credits, check the usage and billing pages in your TomTom developer account: the free allowance may be',
      'used up, and more can be bought there. This email is sent at most once every six hours for each kind of problem.',
    ].join('\n');
    deps.email(subject, text).catch(() => undefined);
  };
}
