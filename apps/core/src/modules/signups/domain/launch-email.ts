/**
 * The email sent to everyone on the tester list when the app is out in the stores: thanks for signing up, and where to get it.
 * Sent as HTML with a plain-text twin (the twin is what a mail app that blocks images or HTML shows, and it keeps spam filters
 * happy). The HTML is table-based with inline styles because that is what mail apps, Outlook above all, draw reliably.
 */
export const LAUNCH_SUBJECT = 'WagonWise is out now on iPhone and Android';

/** Shown beside the subject in an inbox list, then hidden in the message itself. */
const PREVIEW_LINE = 'Thank you for signing up. The free HGV navigation app is ready to install.';

/** The brand, as on the landing page (`sites/landing/index.html`). */
const NAVY = '#0b1220';
const BLUE = '#1a73e8';
const BLUE_SOFT = '#e5eefc';
const SKY = '#7fb2ff';
const GREEN = '#34d399';
const BG = '#f3f6fb';
const TEXT = '#0f1a2e';
const MUTED = '#55617a';
const LINE = '#d9e1ee';

const LOGO_URL = 'https://wagon-wise.co.uk/img/icon-192.png';
const SITE_URL = 'https://wagon-wise.co.uk';
const SUPPORT_EMAIL = 'support@wagon-wise.co.uk';
const ADDRESS = 'WagonWise Ltd, 5 Portland Terrace, Hexham, NE46 3DT';

const FEATURES: readonly { readonly title: string; readonly text: string }[] = [
  {
    title: 'Routes that fit your vehicle',
    text: 'Tell it your height, width and weight once. It plans around low bridges and restrictions.',
  },
  {
    title: 'Hazards before you reach them',
    text: 'Warnings from other drivers, and speed cameras, ahead of you on the route.',
  },
  {
    title: 'Safe parking, at a glance',
    text: 'HGV parking near you on the map, with a Take me there button.',
  },
];

export interface LaunchEmailInput {
  readonly name: string | undefined;
  /** The App Store page, as an https address. */
  readonly appStoreLink: string;
  /** The Google Play page, as an https address. */
  readonly playStoreLink: string;
}

const greetingFor = (name: string | undefined): string =>
  name === undefined ? 'Hello,' : `Hello ${name},`;

/** Text put inside HTML: the five characters that can break out of it. A name or a link is typed by someone, so never trusted. */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function launchEmailText(input: LaunchEmailInput): string {
  return [
    greetingFor(input.name),
    '',
    'Thank you for signing up to test WagonWise. It is out now, free, on iPhone and Android.',
    '',
    'Get it here:',
    `  iPhone (App Store):   ${input.appStoreLink}`,
    `  Android (Google Play): ${input.playStoreLink}`,
    '',
    'Open it and sign in with this email address. It sends you a short code to type in.',
    '',
    'What it does:',
    ...FEATURES.map((f) => `- ${f.title}. ${f.text}`),
    '',
    'WagonWise is a planning aid. It does not replace your own judgement, road signs or the law.',
    '',
    'If anything is wrong, confusing or missing, just reply to this email and tell me. It is read by a person and it makes the app better.',
    '',
    'Thank you for helping,',
    'WagonWise',
    '',
    `You are getting this because you asked, on ${SITE_URL}, to hear about WagonWise. This is the last email about testing. To be taken off the list, reply to this email, remove yourself on the website, or write to ${SUPPORT_EMAIL}.`,
    ADDRESS,
  ].join('\n');
}

/** A button as a table cell with a background colour, which is the one form every mail app, Outlook included, draws as a button. */
function button(label: string, small: string, href: string, background: string): string {
  const url = escapeHtml(href);
  return `
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 12px 0;">
          <tr>
            <td align="center" bgcolor="${background}" style="border-radius:14px;background:${background};">
              <a href="${url}" target="_blank" style="display:block;padding:14px 20px;font-family:Arial,Helvetica,sans-serif;text-decoration:none;color:#ffffff;">
                <span style="display:block;font-size:12px;line-height:14px;color:#cfd8ea;">${escapeHtml(small)}</span>
                <span style="display:block;font-size:20px;line-height:26px;font-weight:700;color:#ffffff;">${escapeHtml(label)}</span>
              </a>
            </td>
          </tr>
        </table>`;
}

function feature(f: { readonly title: string; readonly text: string }): string {
  return `
          <tr>
            <td width="28" valign="top" style="padding:0 0 16px 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="22" height="22" align="center" bgcolor="${GREEN}" style="border-radius:11px;background:${GREEN};font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:22px;font-weight:700;color:${NAVY};">&#10003;</td>
              </tr></table>
            </td>
            <td valign="top" style="padding:0 0 16px 0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:23px;color:${TEXT};">
              <strong>${escapeHtml(f.title)}</strong><br />
              <span style="color:${MUTED};">${escapeHtml(f.text)}</span>
            </td>
          </tr>`;
}

export function launchEmailHtml(input: LaunchEmailInput): string {
  const greeting = escapeHtml(greetingFor(input.name));
  return `<!doctype html>
<html lang="en-GB">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${escapeHtml(LAUNCH_SUBJECT)}</title>
  </head>
  <body style="margin:0;padding:0;background:${BG};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${BG};">${escapeHtml(PREVIEW_LINE)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${BG}" style="background:${BG};">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;">

            <tr>
              <td bgcolor="${NAVY}" style="background:${NAVY};border-radius:20px 20px 0 0;padding:28px 28px 32px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
                  <td valign="middle" style="padding-right:12px;"><img src="${LOGO_URL}" width="44" height="44" alt="" style="display:block;border:0;border-radius:11px;" /></td>
                  <td valign="middle" style="font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:700;color:#ffffff;">WagonWise</td>
                </tr></table>
                <p style="margin:26px 0 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${SKY};">Out now</p>
                <h1 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:38px;font-weight:800;color:#ffffff;">Navigation made for HGV drivers is ready to install</h1>
              </td>
            </tr>

            <tr>
              <td bgcolor="#ffffff" style="background:#ffffff;padding:32px 28px 8px 28px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:26px;color:${TEXT};">
                <p style="margin:0 0 14px 0;">${greeting}</p>
                <p style="margin:0 0 24px 0;">Thank you for signing up to test WagonWise. It is out now, <strong>free</strong>, on iPhone and Android.</p>
${button('Download on the App Store', 'iPhone', input.appStoreLink, NAVY)}${button('Get it on Google Play', 'Android', input.playStoreLink, BLUE)}
                <p style="margin:12px 0 0 0;font-size:15px;line-height:22px;color:${MUTED};">Open the app and sign in with this email address. It sends you a short code to type in.</p>
              </td>
            </tr>

            <tr>
              <td bgcolor="#ffffff" style="background:#ffffff;padding:24px 28px 8px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top:1px solid ${LINE};"><tr><td style="padding-top:24px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${BLUE};">What it does</td></tr></table>
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;">${FEATURES.map(feature).join('')}
                </table>
              </td>
            </tr>

            <tr>
              <td bgcolor="#ffffff" style="background:#ffffff;padding:0 28px 32px 28px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr>
                  <td bgcolor="${BLUE_SOFT}" style="background:${BLUE_SOFT};border-radius:14px;padding:16px 18px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:23px;color:${TEXT};">
                    <strong>Tell me what you think.</strong> If anything is wrong, confusing or missing, just reply to this email. It is read by a person, and it makes the app better for every driver.
                  </td>
                </tr></table>
                <p style="margin:22px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:26px;color:${TEXT};">Thank you for helping,<br /><strong>WagonWise</strong></p>
                <p style="margin:18px 0 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:19px;color:${MUTED};">WagonWise is a planning aid. It does not replace your own judgement, road signs or the law.</p>
              </td>
            </tr>

            <tr>
              <td bgcolor="${NAVY}" style="background:${NAVY};border-radius:0 0 20px 20px;padding:22px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;color:#a9b8d3;">
                You are getting this because you asked, on <a href="${SITE_URL}" style="color:${SKY};text-decoration:underline;">wagon-wise.co.uk</a>, to hear about WagonWise. This is the last email about testing. To be taken off the list, reply to this email or remove yourself on the website, or write to <a href="mailto:${SUPPORT_EMAIL}" style="color:${SKY};text-decoration:underline;">${SUPPORT_EMAIL}</a>.<br />
                ${escapeHtml(ADDRESS)}
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}
