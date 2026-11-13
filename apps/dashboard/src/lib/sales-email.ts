import type { Pitch, ProspectDto } from '@wagonwise/contracts/sales';

/**
 * Drafts of the emails WagonWise sends to hauliers, filled in from what the sales notebook already holds about a firm. It only
 * writes text: nothing is sent from here, and the owner reads, edits and sends each one from their own mail. The wording is the
 * owner's "Outreach messages" page, with the rules from `docs/sales-playbook.md` (who you are, how you found them, a way to say no).
 */

export const DRAFT_KINDS = ['cold', 'listening', 'week', 'month', 'demo'] as const;
export type DraftKind = (typeof DRAFT_KINDS)[number];

export const DRAFT_LABELS: Record<DraftKind, string> = {
  cold: 'First email (selling, once the stores are live)',
  listening: 'Listening invitation (no pitch)',
  week: 'Follow-up after about a week',
  month: 'Last follow-up after about a month',
  demo: 'After a demo',
};

export const PROBLEMS = ['checks', 'dates', 'chasing', 'profit'] as const;
export type Problem = (typeof PROBLEMS)[number];

export const PROBLEM_LABELS: Record<Problem, string> = {
  checks: 'Walk-round checks',
  dates: 'MOT and inspection dates',
  chasing: 'Chasing drivers for job updates',
  profit: 'What each job makes',
};

export const FOUND_OPTIONS = [
  'on your website',
  'on the public register of operator licence holders',
  'on LinkedIn',
  'through a mutual contact',
] as const;
export type Found = (typeof FOUND_OPTIONS)[number];

export const FOUND_LABELS: Record<Found, string> = {
  'on your website': 'On their website',
  'on the public register of operator licence holders': 'On the public operator licence register',
  'on LinkedIn': 'On LinkedIn',
  'through a mutual contact': 'Through a mutual contact',
};

const PAGE = 'https://wagon-wise.co.uk/for-hauliers/';

const PROBLEM_TEXT: Record<
  Problem,
  { topic: string; short: string; question: string; benefit: string }
> = {
  checks: {
    topic: 'walk-round checks',
    short: 'walk-round checks',
    question: 'Do your drivers still do their walk-round checks on paper?',
    benefit: 'the check is done on the driver’s phone and any defect goes straight to the office.',
  },
  dates: {
    topic: 'MOT and inspection dates',
    short: 'MOT and inspection dates',
    question: 'How do you keep track of MOT, inspection and service dates at the moment?',
    benefit:
      'the dates for every vehicle sit in one place, with a reminder by email when one is due.',
  },
  chasing: {
    topic: 'job updates',
    short: 'where each job has got to',
    question: 'How do you find out where a job has got to, and whether a delivery has been done?',
    benefit: 'you see each job live and get the proof-of-delivery photo on the same screen.',
  },
  profit: {
    topic: 'what each job makes',
    short: 'what each job makes',
    question: 'Do you know what a typical job makes once fuel and wages are taken off?',
    benefit:
      'price, wages, fuel and running costs sit on every job, so you can see which work is worth having.',
  },
};

/** The problem to lead with when the firm's last logged pitch was `pitch`; walk-round checks when there is none. */
export function problemFor(pitch: Pitch | undefined): Problem {
  switch (pitch) {
    case 'maintenance':
      return 'dates';
    case 'proof_of_delivery':
    case 'jobs':
      return 'chasing';
    case 'fuel_costs':
      return 'profit';
    default:
      return 'checks';
  }
}

/** The first word of the contact person's name, if there is one. */
export function firstNameOf(contactPerson: string | undefined): string | undefined {
  const first = contactPerson?.trim().split(/\s+/)[0];
  return first === undefined || first === '' ? undefined : first;
}

/** Why no email should be written to this firm, or `undefined` if one may be. The same rules as the firm's contact hint. */
export function emailBlockedReason(firm: ProspectDto): string | undefined {
  if (firm.stage === 'do_not_contact')
    return 'They asked not to be contacted. Do not write to them.';
  if (firm.legalForm === 'sole_trader_or_partnership') {
    return 'A sole trader or partnership: phone only. Do not cold email.';
  }
  return undefined;
}

export interface DraftSettings {
  readonly kind: DraftKind;
  readonly problem: Problem;
  readonly found: Found;
  /** Both app stores are live, which changes how the app is described. */
  readonly storesLive: boolean;
  /** The owner's own number for the signature; left out when empty. */
  readonly phone: string;
}

export interface Draft {
  readonly subject: string;
  readonly body: string;
}

const availability = (live: boolean): string =>
  live
    ? 'The driver app is free on Google Play and the App Store.'
    : 'The driver app is in testing on Android now, and the Google Play and App Store versions are coming.';

const signature = (phone: string): string =>
  `Scott\nWagonWise Ltd${phone.trim() === '' ? '' : ` · ${phone.trim()}`}\nRegistered in England and Wales, company number 17530209. Registered office: 5 Portland Terrace, Hexham NE46 3DT.`;

const optOut = (found: Found): string =>
  `I found your details ${found}. If you would rather I did not get in touch again, just reply “no thanks” and I will not.`;

/** The email for a firm and a kind, filled in. Square brackets mark what only the owner knows (a day, what a demo covered). */
export function draftEmail(firm: ProspectDto, settings: DraftSettings): Draft {
  const first = firstNameOf(firm.contactPerson);
  const hi = `Hi ${first ?? 'there'},`;
  const p = PROBLEM_TEXT[settings.problem];
  const sign = signature(settings.phone);

  switch (settings.kind) {
    case 'listening':
      return {
        subject: `${first === undefined ? '' : `${first}, `}15 minutes of your time?`,
        body: [
          hi,
          'I am Scott. I run WagonWise, a small software company in Hexham, and I am building a fleet dashboard and a free driver app for UK haulage firms.',
          `I am trying to learn how firms like ${firm.name} handle ${p.short} and a few related things. I am not selling anything. A 15-minute phone call, whenever suits you, would help me a lot, and I will share what I learn from other firms.`,
          'If now is not a good time, no problem at all.',
          optOut(settings.found),
          sign,
        ].join('\n\n'),
      };
    case 'cold':
      return {
        subject: `${first === undefined ? 'A' : `${first}, a`} quick question about ${p.topic}`,
        body: [
          hi,
          `I am Scott. I run WagonWise in Hexham: a fleet dashboard and a free driver app for UK haulage firms. ${availability(settings.storesLive)}`,
          p.question,
          `If that is a headache, I can show you in 15 minutes how WagonWise handles it: ${p.benefit} There is nothing to fit in the lorry, and I will use example data, so it costs you nothing but the time. Founding firms also get their first three months free.`,
          `You can see what it does here: ${PAGE}`,
          optOut(settings.found),
          sign,
        ].join('\n\n'),
      };
    case 'week':
      return {
        subject: `Re: a quick question about ${p.topic}`,
        body: [
          `${hi} a quick nudge in case my note about ${p.topic} got buried. If it is not a problem for you, no worries and I will leave you alone. If it is, the 15-minute demo offer stands.`,
          'Scott',
        ].join('\n\n'),
      };
    case 'month':
      return {
        subject: `Re: a quick question about ${p.topic}`,
        body: [
          `${hi} last note from me. ${availability(settings.storesLive)} If ${p.topic} is ever on your list, this is where to look: ${PAGE} I will not write again unless you reply.`,
          'Scott',
        ].join('\n\n'),
      };
    case 'demo':
      return {
        subject: `Thanks${first === undefined ? '' : `, ${first}`}: what we covered and next steps`,
        body: [
          hi,
          'Thanks for your time today. We covered [what you showed, one line each].',
          'The terms for founding firms: three free months while we set it up around how you work, then £10 per vehicle per month for your first year, then the standard £15. The driver app is free. I will put this in writing before you start.',
          availability(settings.storesLive),
          'A good first step is two or three vehicles. Shall we set up a call on [date] to add them and your drivers?',
          'Scott\nWagonWise Ltd',
        ].join('\n\n'),
      };
  }
}

/** A link that opens the owner's own mail app with the draft ready to read and send. Nothing is sent by following it. */
export function mailtoLink(to: string, draft: Draft): string {
  return `mailto:${encodeURIComponent(to.trim()).replace(/%40/g, '@')}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`;
}
