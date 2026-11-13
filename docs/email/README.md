# Email template and signature

For the emails written by hand (hauliers, pilot firms, suppliers). The emails the app sends itself are built in
`apps/core` (the launch email is `apps/core/src/modules/signups/domain/launch-email.ts`); these two files only
share its look.

- `email-template.html`: the full layout. Header with the logo, the message, a signature and the company footer.
- `email-signature.html`: the signature on its own, for quick replies.

Both pull the logo from `https://wagon-wise.co.uk/img/icon-192.png`, so it shows without attaching anything.

## Set up once

WagonWise mail is on Zoho Mail, so these steps are for Zoho's website. Its menu names move now and then: if one is
not where this says, look for the nearest match.

1. Open the file in a text editor (Notepad will do) and replace the signature's `[brackets]` once, so they are saved
   for good: your name, role and phone number. Leave the message's own brackets; those change with every email.
2. Select all of it (Ctrl+A) and copy (Ctrl+C).

**Signature** (`email-signature.html`). Settings > Signatures > the + to add one. Give it a name, click **Insert
HTML** in the editor's toolbar, paste, and click OK. Then pick the address it goes with
(support@wagon-wise.co.uk) and save.

**Full layout** (`email-template.html`). Start a new email, click the **HTML** (`</>`) button in the toolbar, paste
and insert. Then open the arrow beside **Save draft** and choose **Template**, so next time it is one click on the
Insert template button. Send the first one to yourself and look at it on your phone before using it on anyone else.

If Insert HTML is not there, open the file in a browser instead (double-click it), select everything on the page,
copy, and paste it straight into the signature box or the new email.

## Writing with it

- Type over the bracketed lines. Delete the button if the email does not need one; to keep it, change its text and
  its link (click the button, then the link icon).
- Do not use the full layout and the signature together: the layout already has one.
- For a quick reply in a running conversation, plain text with the signature reads better than the full layout.
- The footer's company name, number and registered office are required on a limited company's business emails:
  leave them in. If any of them change, change them here and on the website (`sites/landing/index.html`).
- Cold emails: the rules in `docs/sales-playbook.md` still apply (who you may email, and a clear way to say no).
