# Licence signer

A small Cloudflare Worker that Paddle calls when a sale completes. It signs a licence key for each
app bought (Pecan, ReKarver, Purrsor, Phono) and emails it to the buyer, as text and as a
`.kwaklicense` file. Nothing else.

- **No data kept.** No database, no accounts. Paddle is the record of every sale, and a key can
  always be made again from it with `kwak-license sign` (in the pecan repository). Errors are logged
  with the order number only, never a name or email address.
- **Keys match the apps exactly.** The format is pecan's `docs/LICENCE-KEYS.md`. The tests check
  that the keys made here have the same contents as the shared test vectors, and every key is
  checked against the apps' public key before it is emailed, so a mismatched secret can't send
  keys that don't work.
- **Paddle retries.** If Paddle or Resend can't be reached, the Worker answers with an error and
  Paddle tries again over the next few days. The order number is Resend's idempotency key, so a
  retry within 24 hours doesn't send a second email.

Files: `src/index.js` (the webhook), `src/licence.js` (making keys), `src/paddle.js` (Paddle's
webhook signature, looking up the buyer), `src/email.js` (the email in English or French, Resend).
Tests: `npm test` (Node 20 or later, nothing to install).

## How a sale goes

1. The buyer pays at Paddle's checkout.
2. Paddle sends `transaction.completed` to `https://<worker>/paddle`, signed with the
   notification's secret. Anything not signed by Paddle is refused.
3. The Worker asks Paddle's API for the buyer's name, email and language (a transaction only
   carries the customer's id).
4. For each app in the order it signs a key: the buyer's name (or their email if checkout didn't
   ask for a name), the Paddle transaction id as the order, today's date, major version 1.
5. It emails the keys through Resend, in French if the buyer's Paddle language is French.

## Why Resend for email

Cloudflare's own email sending from Workers only delivers to addresses you have verified, so it
can't reach buyers. Resend's free plan sends 3,000 emails a month (100 a day), from your own
address at kwaksoftware.ca, with attachments and a simple API. Postmark is excellent but starts at
about US$15 a month; Amazon SES is cheapest at volume but takes much more setting up. If sales ever
pass 100 a day, Resend's paid plan is US$20 a month.

Resend is a US company. It sees each buyer's name, email address and key while sending, and keeps
a log of sent emails for a short time. The privacy policy should name it, and Cloudflare, next to
Paddle.

## Setting it up

You need: the key pair, a free Cloudflare account, a free Resend account and your Paddle account.
Do it all with Paddle's **sandbox** first, then switch to live.

### 1. The key pair (once, for every app)

```
cd C:\code\pecan
dotnet run --project tools/KwakLicense -- new-keys
```

Save both lines in your password manager. The **public** key goes into each app (see each app's
licensing PR) and into `KWAK_PUBLIC_KEY` in `wrangler.toml`, replacing the test key there. The
**private** key goes only into the Worker as a secret (step 5) and your password manager.

### 2. Resend

1. Sign up at https://resend.com.
2. **Domains → Add domain**: `kwaksoftware.ca`. Add the DNS records it lists (TXT and MX records
   on a `send` subdomain, and a DKIM TXT record) wherever the domain's DNS is managed. They don't
   affect your existing email. Wait until the domain shows **Verified**.
3. **API Keys → Create API key**: permission **Sending access**, domain `kwaksoftware.ca`. Copy it.

The email comes from `licences@kwaksoftware.ca` and replies go to `support@kwaksoftware.ca`
(`EMAIL_FROM` and `SUPPORT_EMAIL` in `wrangler.toml`).

### 3. Paddle (sandbox first)

1. **Catalog → Products**: copy each app's product id (`pro_…`) into `PRODUCTS` in `wrangler.toml`.
2. **Developer tools → Authentication → API keys → New API key**: give it **Customers: Read**
   only. Copy it.
3. In **Checkout settings**, if Paddle offers it, ask for the buyer's name. Otherwise keys say
   "Licensed to" the buyer's email address.

### 4. Deploy the Worker

Sign up for Cloudflare's free plan at https://dash.cloudflare.com, then on your PC:

```
cd C:\code\kwak-software-site\signer
npx wrangler@4 login
npx wrangler@4 deploy
```

It prints the Worker's address, like `https://kwak-licence-signer.<you>.workers.dev`.

Back in Paddle: **Developer tools → Notifications → New destination**. URL:
`https://kwak-licence-signer.<you>.workers.dev/paddle`, event **transaction.completed** only. Save
it and copy its **secret key**.

### 5. The four secrets

Each command asks you to paste the value:

```
npx wrangler@4 secret put KWAK_LICENSE_PRIVATE_KEY
npx wrangler@4 secret put PADDLE_WEBHOOK_SECRET
npx wrangler@4 secret put PADDLE_API_KEY
npx wrangler@4 secret put RESEND_API_KEY
```

Secrets are stored encrypted by Cloudflare and never appear in this repository or the dashboard.

### 6. Try it

Buy each app in Paddle's sandbox checkout with a test card (4242 4242 4242 4242, any future date,
any CVC) and your own email address. The email should arrive within a minute, and its key should
unlock a direct build of the app. Paddle's notification log shows the Worker's answer for each
attempt ("Sent pecan for txn_…"), and Cloudflare's **Workers → kwak-licence-signer → Logs** shows
any errors. Paddle's "simulate" button sends made-up customers, so it ends in an error: use a real
sandbox checkout.

### 7. Go live

In live Paddle, make the same API key and notification destination, and copy the live product ids
into `PRODUCTS`. Then set `PADDLE_ENV = "live"` in `wrangler.toml`, put the live
`PADDLE_WEBHOOK_SECRET` and `PADDLE_API_KEY` with `secret put` again, and `npx wrangler@4 deploy`.

## Afterwards

- **A buyer lost their key:** search Paddle for their order, then
  `kwak-license sign --app pecan --name "…" --order txn_…` (private key in
  `KWAK_LICENSE_PRIVATE_KEY`).
- **A refund or chargeback:** add the order to the app's withdrawn orders list for the next release.
- **A key turns up online:** `kwak-license check … <key>` prints its key id. Add the id to each
  app's blocked keys list for the next release, and send the buyer a replacement made with
  `kwak-license sign … --reissue 1`. Only the shared key stops working.
