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

/**
 * To the owner: who registered and where to start a trial for them. `portalAddress` is the portal's address, when known. `linkSent` is
 * whether the firm was emailed a link to start its own trial, in which case nothing is needed from the owner unless it waits.
 */
export function ownerAlert(
  who: RegistrationDetails,
  portalAddress: string | undefined,
  linkSent = false,
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
      ...(linkSent
        ? [
            'They have been emailed a link to start their own free trial. You need do nothing: you will get another line when they start it,',
            'or if they have to wait for you.',
          ]
        : [
            'They were told they would hear from you, usually within one working day.',
            portalAddress === undefined
              ? 'Open the Testers page in the portal to start a trial for them.'
              : `Start a trial for them: ${portalAddress.replace(/\/+$/, '')}/admin/testers`,
          ]),
    ].join('\n'),
  };
}

export const REGISTRANT_SUBJECT = 'Thanks for getting in touch with WagonWise';

/**
 * To the person who registered: that it arrived, what happens next, and how to be left alone. With a `link`, what happens next is theirs:
 * press it to confirm the address and start the free trial. Without one (no portal address is set), someone at WagonWise will write.
 */
export function registrantReply(who: RegistrationDetails, link?: string): string {
  const greeting = who.name === undefined ? 'Hello,' : `Hello ${who.name},`;
  const firm = who.company === undefined ? 'your firm' : who.company;
  const next =
    link === undefined
      ? `Thank you for telling us about ${firm}. We will email you, usually within one working day, to show you the WagonWise dashboard with example data, or to set up your firm if you would rather try it yourself. There is no charge and no obligation.`
      : [
          `Thank you for telling us about ${firm}. To start your free trial, open this link and press the button. It confirms this email address, and it works for two days:`,
          '',
          link,
          '',
          'We will then email you an invitation to choose your password. There is no charge during the trial and no obligation after it, and you do not need a card to start.',
        ].join('\n');
  return [
    greeting,
    '',
    next,
    '',
    'In the meantime, the driver app is free and out now on iPhone and Android.',
    '',
    'If you did not ask for this, ignore this email. If you would rather we did not write to you again, reply to say so, or use "Remove my email" at the bottom of https://wagon-wise.co.uk/for-hauliers/ and we will not.',
    '',
    'WagonWise',
    'WagonWise Ltd, registered in England and Wales, company number 17530209.',
  ].join('\n');
}

/** To the owner: a firm started its own trial. */
export function trialStartedAlert(input: {
  readonly email: string;
  readonly firm: string;
  readonly vehicles: number;
}): { readonly subject: string; readonly text: string } {
  return {
    subject: `Trial started: ${input.firm}`,
    text: [
      `${input.firm} confirmed ${input.email} and started its own free trial, with room for ${input.vehicles} vehicle${input.vehicles === 1 ? '' : 's'}.`,
      'An invitation to choose a password has been emailed to them. You need do nothing.',
    ].join('\n'),
  };
}

export type WaitingReason = 'daily_limit' | 'same_domain';

/** To the owner: a firm confirmed its email but was held for you to start by hand, and why. */
export function trialWaitingAlert(input: {
  readonly email: string;
  readonly firm: string;
  readonly reason: WaitingReason;
  readonly portalAddress: string | undefined;
}): { readonly subject: string; readonly text: string } {
  const why =
    input.reason === 'daily_limit'
      ? 'The limit on trials started without you for today has been reached.'
      : 'A firm from the same email domain already has a trial.';
  return {
    subject: `Trial waiting for you: ${input.firm}`,
    text: [
      `${input.firm} (${input.email}) confirmed its email address and pressed Start my trial, but was held for you. ${why}`,
      '',
      'It was told you will set it up shortly.',
      input.portalAddress === undefined
        ? 'Open the Testers page in the portal and press Start trial for them.'
        : `Start a trial for them: ${input.portalAddress.replace(/\/+$/, '')}/admin/testers`,
    ].join('\n'),
  };
}
