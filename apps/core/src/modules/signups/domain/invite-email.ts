/** The one standard email a tester is sent from the portal's Testers page. Plain text, like every other email here. */
export const INVITE_SUBJECT = 'Your WagonWise test invite';

export function inviteEmail(input: {
  readonly name: string | undefined;
  readonly email: string;
  readonly inviteCode: string;
  readonly optInLink: string;
}): string {
  const greeting = input.name === undefined ? 'Hello,' : `Hello ${input.name},`;
  return [
    greeting,
    '',
    'Thank you for signing up to test WagonWise, the free navigation app for HGV drivers. You are invited.',
    '',
    'To get the app (about two minutes):',
    '',
    '1. On your Android phone, open this link while signed in to the Google account you use on that phone, and tap "Become a tester":',
    `   ${input.optInLink}`,
    '2. Then install WagonWise from the Google Play page it takes you to. It can take a few minutes to appear the first time.',
    `3. Open the app and sign in with this email address (${input.email}). It sends you a short code to type in.`,
    `4. The first time, put this invite code in the "Invite code" box: ${input.inviteCode}`,
    '',
    'It is yours alone and works once.',
    '',
    'A few things worth knowing:',
    '- WagonWise is a planning aid. It does not replace your own judgement, road signs or the law.',
    '- Please keep it installed for the next two weeks or so, and use it on real trips when you can. Google needs that of testers before the app can go public, and your use makes it better.',
    '- If anything is wrong, confusing or missing, just reply to this email and tell me.',
    '',
    'Your email address is used only to invite you and to sign you in. The app shows its privacy notice the first time you open it.',
    '',
    'Thank you for helping,',
    'WagonWise',
  ].join('\n');
}
