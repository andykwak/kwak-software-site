# Launch setup: your accounts

What you need to set up yourself before ReKarver and Pecan go on sale at CAD $9.99 each, aiming
for **Friday, November 27, 2026**. One section per platform. Tick the boxes as you go.

The commands for the licence signer are in [signer/README.md](../signer/README.md) (from PR #13,
which isn't merged yet; until it is, read it on that PR's branch). This page says what to do and
in what order, and links there for the commands rather than repeating them.

## Start these first: they take days

- [ ] **Paddle seller verification.** Paddle checks your business and your website before it lets
      you take real payments. This usually takes a few business days and can take longer if they
      ask questions.
- [ ] **Azure identity check.** Microsoft checks your ID before it gives you a signing
      certificate. Allow from one to several business days.

Both can run at the same time. Everything else below takes minutes to an hour.

## What to send back to Claude

| What | Where you get it |
| --- | --- |
| The **public** key (one line of text) | Pecan's `new-keys` command, step 1 under Cloudflare |
| Paddle **product ids** (`pro_…`) for Pecan and ReKarver, sandbox first, live later | Paddle → Catalog → Products |
| Paddle's answer on the fee for sales under $10 | Paddle support |
| Artifact Signing **account name** and **certificate profile name** | Azure, steps 5 and 6 below |
| The Worker's address (`https://kwak-licence-signer.….workers.dev`) | Printed by `wrangler deploy` |

Never send the **private** key, API keys or webhook secrets. They go only into your password
manager and into the Worker as secrets.

## Azure (Artifact Signing)

Your pay-as-you-go account already exists. This adds the signing account (about US$10 a month on
the Basic plan). Some menus may still say "Trusted Signing", Microsoft's old name for it.

- [ ] 1. **Register the service.** Subscriptions → your subscription → Resource providers, search
      **Microsoft.CodeSigning**, click **Register**.
- [ ] 2. **Create the account.** Search the top bar for **Artifact Signing**, click **Create**.
      New resource group (for example `kwak-signing`), region **Canada Central**, a name, plan
      **Basic**.
- [ ] 3. **Give yourself permission.** Open the new account → Access control (IAM) → Add role
      assignment → **Artifact Signing Identity Verifier**.
- [ ] 4. **Verify your identity.** In the account: Identity validation → New → **Individual**,
      then follow the ID check. ⏳ *Multi-day wait.*
- [ ] 5. Once approved: **Certificate profiles → Create → Public Trust**.
- [ ] 6. Send Claude the account name and the certificate profile name. Claude then sets up the
      app builds to sign with it.

## Resend (emailing keys to buyers)

Free plan: 3,000 emails a month, 100 a day. Details in
[signer/README.md, step 2](../signer/README.md#2-resend).

- [ ] 1. Sign up at https://resend.com.
- [ ] 2. **Domains → Add domain**: `kwaksoftware.ca`.
- [ ] 3. Add the DNS records Resend lists (on a `send` subdomain, plus one DKIM record) wherever
      the domain's DNS is managed. They don't touch your existing email.
- [ ] 4. Wait until the domain shows **Verified** (usually minutes, sometimes a few hours).
- [ ] 5. **API Keys → Create API key**, permission **Sending access**, domain `kwaksoftware.ca`.
      Save it in your password manager. It becomes the `RESEND_API_KEY` secret.
- [ ] 6. Make sure `support@kwaksoftware.ca` reaches you: buyers' replies go there.

## Paddle (selling)

Do everything in the **sandbox** (https://sandbox-vendors.paddle.com) first, then repeat it in
live once verification is through.

**Account**

- [ ] 1. Sign up for a live account and start seller verification. ⏳ *Multi-day wait.* Paddle
      looks at kwaksoftware.ca, so the product pages, prices, privacy policy, terms and refund
      policy should be up when they review it.
- [ ] 2. **Ask Paddle support what fee applies to sales under $10.** Their standard 5% + 50¢ is
      for prices of $10 and up, and both apps are $9.99. Send Claude the answer.
- [ ] 3. Sign up for a sandbox account (separate login, works straight away).

**In the sandbox**

- [ ] 4. **Catalog → Products → New product**: *Pecan*, one-time price **CAD 9.99**.
- [ ] 5. The same for *ReKarver*, **CAD 9.99**.
- [ ] 6. Send Claude both product ids (`pro_…`). They go into `PRODUCTS` in `signer/wrangler.toml`.
- [ ] 7. **Developer tools → Authentication → API keys → New API key** with **Customers: Read**
      only, nothing else. Save it. It becomes the `PADDLE_API_KEY` secret.
- [ ] 8. In checkout settings, ask for the buyer's name if Paddle offers it (otherwise keys say
      "Licensed to" their email address).
- [ ] 9. After the Worker is deployed (Cloudflare step 4): **Developer tools → Notifications →
      New destination**, URL `https://kwak-licence-signer.….workers.dev/paddle`, event
      **transaction.completed** only. Save it and keep its **secret key**: it becomes the
      `PADDLE_WEBHOOK_SECRET` secret.

## Cloudflare (the licence signer)

Free plan. Commands in [signer/README.md](../signer/README.md), steps 1, 4 and 5.

- [ ] 1. **Make the key pair**, once for every app, on your PC in the pecan repository:
      ```
      cd C:\code\pecan
      dotnet run --project tools/KwakLicense -- new-keys
      ```
      Save **both** lines in your password manager. The **private** key goes only there and into
      the Worker as a secret. Send Claude the **public** key: it goes into each app and into
      `KWAK_PUBLIC_KEY` in `wrangler.toml`.
- [ ] 2. Sign up at https://dash.cloudflare.com (free plan).
- [ ] 3. Wait until Claude has put your public key and the sandbox product ids into
      `wrangler.toml` and PR #13 is merged. Then pull `main`.
- [ ] 4. Deploy: `npx wrangler@4 login`, then `npx wrangler@4 deploy` in the `signer` folder.
      Note the address it prints and send it to Claude. Now do Paddle step 9.
- [ ] 5. Put in the four secrets with `npx wrangler@4 secret put …`, pasting each value when
      asked: `KWAK_LICENSE_PRIVATE_KEY`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_API_KEY`,
      `RESEND_API_KEY`.

## Test in the sandbox, then go live

**Sandbox test**

- [ ] 1. Buy Pecan and ReKarver in Paddle's sandbox checkout with test card
      4242 4242 4242 4242, any future date, any CVC, and your own email address.
- [ ] 2. The email with the key should arrive within a minute.
- [ ] 3. The key unlocks a direct build of each app.
- [ ] 4. If not: Paddle's notification log shows the Worker's answer, and Cloudflare →
      Workers → kwak-licence-signer → Logs shows errors. (Paddle's "simulate" button sends
      made-up customers and always fails; use a real sandbox checkout.)
- [ ] 5. Buy once with a French browser or language to check the French email.

**Go live** (once Paddle verification is approved)

- [ ] 1. In live Paddle, make the same two products at CAD 9.99, the same **Customers: Read** API
      key, and the same notification destination.
- [ ] 2. Send Claude the live product ids. Claude updates `PRODUCTS` and sets
      `PADDLE_ENV = "live"` in `wrangler.toml`.
- [ ] 3. Put in the live `PADDLE_WEBHOOK_SECRET` and `PADDLE_API_KEY` again with `secret put`,
      then `npx wrangler@4 deploy`.
- [ ] 4. Make one real purchase yourself and refund it, to check the whole path end to end.
