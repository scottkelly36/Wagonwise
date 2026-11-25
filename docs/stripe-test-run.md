# Stripe: first test-mode run

For the owner, once the Stripe account exists. **Test mode only**: nothing here moves real money. The adapter is
`apps/core/src/modules/payments/infrastructure/stripe-payment-provider.ts`; how it fits is in `docs/modules.md`, "Payments".

## 1. In the Stripe dashboard (test mode on)

- **Payment methods** (Settings, Payment methods): turn on **Cards** and **Bacs Direct Debit**. Bacs may need Stripe to approve it first. The
  hosted page offers whatever is on here, so switch off anything else.
- **API keys** (Developers): copy the **Secret key** (`sk_test_...`). Not the publishable one (`pk_`): core refuses it.
- **Webhook** (Developers, Webhooks, add endpoint): address `https://api.wagon-wise.co.uk/webhooks/payments` (the driver server, like the Resend
  one in `docs/deployment-guide.md`). Send these events: `checkout.session.completed`, `payment_intent.succeeded`,
  `payment_intent.payment_failed`. Copy its **Signing secret** (`whsec_...`). A test-mode endpoint only receives test-mode events, so
  it can point at the live site while the keys are test keys.
- To try it on your own machine, use the Stripe CLI instead of a public address: `stripe listen --forward-to localhost:<driver-bff port>/webhooks/payments`
  prints a `whsec_...` to use for that session.

## 2. In `apps/core/.env` (never commit, never paste in chat)

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
DASHBOARD_URL=http://localhost:5173
```

Both Stripe values or neither (core refuses to start with one). `DASHBOARD_URL` is where Stripe sends the firm back to. Restart core, and
restart the two BFFs (they cache core's signing key). On the live site the two Stripe values go in the DigitalOcean `core` app settings
(as secrets), not in a file.

## 3. The run

1. Sign in to the portal as a firm's billing person. Plan page: **Add payment details**. On Stripe's page use a test card `4242 4242 4242 4242`
   (any future date, any CVC) or, for Direct Debit, sort code `108800`, account `00012345`. You come back to the plan page, and
   the webhook marks the details on file.
2. As WagonWise staff, issue an invoice for that firm and press **Collect payment**. A card pays at once; Direct Debit shows "waiting"
   and settles after about three minutes in test mode (account `90012345`), days in real life.
3. Check: the invoice is marked paid, the firm's account history shows the move, and a firm that was paused or overdue is active again.
4. Failures to try: card `4000 0000 0000 0341` (attaches, then declines when charged), Direct Debit account `22222227` (insufficient funds).
   Each should close the attempt as failed and email the owner.

## What was and was not checked

Checked by tests with a stand-in for Stripe: the requests the adapter sends, the signature check (wrong secret, altered body, old and
future timestamps), and how each message is read. **Not checked against Stripe itself** until this run: that is what this is for. If a
step fails, the error in core's log carries Stripe's code, never the key.
