/**
 * The two emails sent when a firm registers on the For hauliers page: a line to the owner (so a keen firm is not left waiting until
 * someone happens to open the Testers page) and a short thank-you to the person. Plain text, like every other email here.
 */
export const OWNER_ALERT_PREFIX = 'New firm registered';

export interface RegistrationDetails {
  readonly email: string;
  readonly name: string | undefined;
  readonly role: string;
  readonly company: string | undefined;
  readonly fleetSize: string | undefined;
}

const ROLE_WORDS: Record<string, string> = {
  company: 'runs a fleet or haulage firm',
  both: 'drives and runs the firm',
  other: 'said something else',
};

/** To the owner: who registered and where to start a trial for them. `portalAddress` is the portal's address, when known. */
export function ownerAlert(
  who: RegistrationDetails,
  portalAddress: string | undefined,
): { readonly subject: string; readonly text: string } {
  const firm = who.company ?? who.email;
  return {
    subject: `${OWNER_ALERT_PREFIX}: ${firm}`,
    text: [
      `${who.name ?? who.email} ${ROLE_WORDS[who.role] ?? 'registered'}.`,
      '',
      `Email: ${who.email}`,
      ...(who.name === undefined ? [] : [`Name: ${who.name}`]),
      ...(who.company === undefined ? [] : [`Company: ${who.company}`]),
      ...(who.fleetSize === undefined ? [] : [`Vehicles: ${who.fleetSize}`]),
      '',
      'They were told they would hear from you, usually within one working day.',
      portalAddress === undefined
        ? 'Open the Testers page in the portal to start a trial for them.'
        : `Start a trial for them: ${portalAddress.replace(/\/+$/, '')}/admin/testers`,
    ].join('\n'),
  };
}

export const REGISTRANT_SUBJECT = 'Thanks for getting in touch with WagonWise';

/** To the person who registered: that it arrived, what happens next, and how to be left alone. */
export function registrantReply(who: RegistrationDetails): string {
  const greeting = who.name === undefined ? 'Hello,' : `Hello ${who.name},`;
  const firm = who.company === undefined ? 'your firm' : who.company;
  return [
    greeting,
    '',
    `Thank you for telling us about ${firm}. We will email you, usually within one working day, to show you the WagonWise dashboard with example data, or to set up your firm if you would rather try it yourself. There is no charge and no obligation.`,
    '',
    'In the meantime, the driver app is free and out now on iPhone and Android.',
    '',
    'If you did not ask for this, ignore this email. If you would rather we did not write to you again, reply to say so, or use "Remove my email" at the bottom of https://wagon-wise.co.uk/for-hauliers/ and we will not.',
    '',
    'WagonWise',
    'WagonWise Ltd, registered in England and Wales, company number 17530209.',
  ].join('\n');
}
