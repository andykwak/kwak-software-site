# Operations guide

How Kwak Software's direct sales run: every service involved, what lives where, which secrets
exist, and what to do when something has to be redeployed, rotated or blocked. Written for Andy
(and for anyone helping him later) so nothing depends on memory.

**This file names secrets but never holds their values.** Values live in two places only: Andy's
password manager, and the service that uses them (Cloudflare's encrypted Worker secrets). This
repository is public, so never paste a value here, in an issue or in a commit.

Last checked against the repositories: 2026-11-26. Open items are listed at the end.

## How a sale flows

```
Buyer ─▶ Paddle checkout (kwaksoftware.ca buy button)
             │  transaction.completed, signed with the webhook secret
             ▼
         Cloudflare Worker "kwak-licence-signer"  ──▶  Paddle API (buyer's name, email, language)
             │  signs a KWAK1 key with the private key, checks it with the public key
             ▼
         Resend ──▶ email from licences@kwaksoftware.ca (reply-to support@) with the key
             ▼
         Buyer installs the signed download, pastes the key; the app checks it offline
```

No service keeps a copy of the key except the email itself. Paddle is the record of every sale,
so any key can be made again from Paddle's order.

## Services at a glance

| Service | What it does | Account / name | Cost |
| --- | --- | --- | --- |
| Paddle | Checkout, tax, merchant of record | Sole proprietor Andrew Kwak, trading as Kwak Software | 5% + 50¢ per sale |
| Cloudflare Workers | Licence signer | Worker `kwak-licence-signer` on `kwaksoftware.workers.dev` | Free plan |
| Resend | Emails keys to buyers | Domain `kwaksoftware.ca` | Free (3,000/month, 100/day) |
| Azure Artifact Signing | Signs direct-download installers | Individual identity "Andrew Kwak" | About US$10/month |
| Microsoft Partner Center | Store listings (later) | Publisher display name "Kwak Software" | One-time fee, paid |
| CanSpace | Domain registration and DNS for kwaksoftware.ca | | Yearly renewal |
| GitHub Pages | Hosts the website | Repo `andykwak/kwak-software-site`, branch `main` | Free |
| GitHub Actions | Builds, tests, signed releases | Self-hosted runners on Andy's PC | Free |
| FormSubmit | Website contact form → support@ | | Free |
| Zoho Mail | The support@kwaksoftware.ca inbox, where buyers' replies and the contact form land | | Zoho's plan |

## Secrets inventory (names only)

| Secret | Used by | Stored in | Where it comes from | Expires |
| --- | --- | --- | --- | --- |
| `KWAK_LICENSE_PRIVATE_KEY` | Worker (signs keys); `kwak-license sign` on Andy's PC | Worker secret; password manager | `kwak-license new-keys` (pecan repo) | Never |
| `PADDLE_WEBHOOK_SECRET` | Worker (checks Paddle-Signature) | Worker secret; password manager | Paddle → Developer tools → Notifications → the destination | Never, until rotated |
| `PADDLE_API_KEY` | Worker (looks up the buyer) | Worker secret; password manager | Paddle → Developer tools → Authentication. Permission **Customers: Read** only | Sandbox key `kwak-licence-signer-2` expires **2027-02-23** |
| `RESEND_API_KEY` | Worker (sends email) | Worker secret; password manager | Resend → API Keys. **Sending access**, domain kwaksoftware.ca only | Never, until rotated |
| Account logins (Paddle live, Paddle sandbox, Cloudflare, Resend, Azure, Partner Center, CanSpace, Zoho Mail, GitHub) | Andy | Password manager, ideally with two-factor sign-in on each | | |

Sandbox and live Paddle each have their own webhook secret and API key. Only one set is in the
Worker at a time.

**Not secrets** (fine in the repositories): the licence **public** key, Paddle product and price
ids, `AZURE_TENANT_ID` and `AZURE_CLIENT_ID` (GitHub repository *variables*), the Worker's address.

Azure signing has **no stored secret at all**: GitHub vouches for the release job (OpenID
Connect) and Azure trusts that one job through a federated credential.

---

## Paddle

**What it does.** Runs the checkout, charges the card, handles sales tax and refunds as merchant
of record, and tells the signer about each completed sale.

**Accounts.** Live: https://vendors.paddle.com. Sandbox (fake money, separate login):
https://sandbox-vendors.paddle.com. Seller verification was approved 2026-11-24: sole proprietor,
legal name Andrew Kwak, trading name Kwak Software, domain kwaksoftware.ca, terms and refunds at
https://kwaksoftware.ca/terms/, privacy at /privacy/. Keep the name in the site's terms the same
as the name on the Paddle account.

**Products** (one-time CA$9.99, max quantity 1, tax category Standard digital goods):

| App | Sandbox product | Sandbox price | Live product | Live price |
| --- | --- | --- | --- | --- |
| Pecan | `pro_01m8843a2bcd4s23ahqrxk9j70` | `pri_01m8845v9371nkx45w365ef5fh` | not made yet | not made yet |
| ReKarver | `pro_01m88442r21dcqkytdxy6sftss` | `pri_01m8846y7cm7pceg1yr10tgrzt` | not made yet | not made yet |
| Purrsor ($4.99), Phono, MailMove ($9.99 each) | not made yet | | | |

Product ids go into `PRODUCTS` in `signer/wrangler.toml`; a product missing there gets no key.

**Settings to repeat in live.** Checkout recovery emails off, marketing opt-in off (no marketing
email, ever), statement descriptor `KWAKSOFT`, default payment link `https://kwaksoftware.ca/`
(Paddle refuses transactions without one). Paddle has no option to ask for the buyer's name, so
keys say "Licensed to" the buyer's email address.

**Webhook.** Developer tools → Notifications: one destination, URL
`https://kwak-licence-signer.kwaksoftware.workers.dev/paddle`, event **transaction.completed**
only. Sandbox destination: `ntfset_01m887k7b85y2hsxtj3tfznt4q`. Its log shows the Worker's answer
for each sale ("Sent pecan for txn_…"); failed deliveries are retried by Paddle for several days,
and a logged one can be replayed from the log.

**Buy buttons.** Sandbox has a hosted checkout for testing. Live hosted checkouts need Paddle's
approval, so the live buy buttons will use Paddle.js on the product pages.

**Refunds and chargebacks.** Done in Paddle. Then add the transaction id to every affected app's
withdrawn orders list (see "Blocking keys" below) so the key stops working at the next update.

**Rotate the API key.** Make a new key (Customers: Read only), `secret put PADDLE_API_KEY` (see
Cloudflare below), check a sale goes through, then revoke the old key in Paddle. Do this before an
expiry date; when the key expires the Worker can't look up buyers and sales get no email until it
is replaced (Paddle keeps retrying, so nothing is lost if it's fixed within a few days).

**Rotate the webhook secret.** Paddle shows one secret per destination. The simplest safe way:
make a second destination with the same URL and event, `secret put PADDLE_WEBHOOK_SECRET` with the
new one, then delete the old destination. Sales in between fail the signature check and are
retried, so they arrive once the new secret is in.

## Cloudflare Worker: the licence signer

**What it does.** Receives Paddle's `transaction.completed`, refuses anything without a valid
Paddle signature, looks up the buyer, signs one KWAK1 key per app bought, checks each key against
the public key (so a wrong secret can't send keys that don't work), and emails them through Resend
in English or French. Keeps no data; logs order ids only, never names or emails.

**Where it lives.** Code: `signer/` in this repository (`src/index.js`, `licence.js`, `paddle.js`,
`email.js`), tests `npm test`. Settings that aren't secret: `signer/wrangler.toml`
(`PADDLE_ENV`, `EMAIL_FROM`, `SUPPORT_EMAIL`, `KWAK_PUBLIC_KEY`, `PRODUCTS`). Deployed address:
https://kwak-licence-signer.kwaksoftware.workers.dev/paddle. Logs: Cloudflare dashboard →
Workers → kwak-licence-signer → Logs. `_config.yml` keeps `signer/` off GitHub Pages.

**Redeploy** (after changing `wrangler.toml` or the code, from an up-to-date `main`):

```
cd C:\code\kwak-software-site
git pull
cd signer
npm test
npx wrangler@4 deploy
```

`npx wrangler@4 login` first if wrangler asks. Deploying keeps the secrets.

**Set or rotate a secret.** Takes effect within seconds, no redeploy needed:

```
cd C:\code\kwak-software-site\signer
npx wrangler@4 secret put PADDLE_API_KEY
```

(paste the value when asked; the same for the other three). `npx wrangler@4 secret list` shows
which names are set, never the values.

**Roll back.** Cloudflare dashboard → the Worker → Deployments → pick the previous one, or
`npx wrangler@4 rollback`.

**Go live** (one change, once live Paddle is set up): live product ids in `PRODUCTS`,
`PADDLE_ENV = "live"`, merge, then `secret put` the live `PADDLE_WEBHOOK_SECRET` and
`PADDLE_API_KEY`, then `npx wrangler@4 deploy`. Make one real purchase and refund it.

## The licence key pair

**What it is.** One ECDSA P-256 key pair signs keys for every app (format:
`/mnt/project-files/licensing/key-format.md`, copy in pecan `docs/LICENCE-KEYS.md`). The public
key is built into each app and into `KWAK_PUBLIC_KEY`; the private key is only in the Worker and
Andy's password manager. Current public key starts `MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEaf/A`.

**Tool.** `tools/KwakLicense` in the pecan repository:

```
cd C:\code\pecan
dotnet run --project tools/KwakLicense -- sign --app pecan --name "Buyer Name" --order txn_…
dotnet run --project tools/KwakLicense -- check <key>
```

`sign` reads the private key from the `KWAK_LICENSE_PRIVATE_KEY` environment variable; set it in
that terminal window only and close the window afterwards. App ids: `pecan`, `rekarver`,
`purrsor`, `phono`, `mailmove`.

**A buyer lost their key.** Find the order in Paddle, then `sign` with the same name (or email)
and transaction id. Any number of keys for one order is fine.

**Where each app keeps its lists:**

| App | Public keys, withdrawn orders, blocked keys | Branch |
| --- | --- | --- |
| Pecan | `src/Pecan.App/Services/Licensing.cs`: `PublicKeys`, `WithdrawnOrders`, `BlockedKeys` | `main` |
| ReKarver | `gui/Recarve.Core/Licence.cs`: `PublicKeys`, `Withdrawn`, `Blocked` | `release/rekarver-1.0` (and `main`) |
| MailMove | `src/MailConvert.App/AppLicensing.cs` | konverter PR #10, not merged |
| Purrsor | `src/Licensing/License.cs` | cat-toy PRs #7 and #8, not merged |
| Phono | | Phono PRs #42 and #43, not merged |

**Rotating the key pair** (planned, not because of a leak). Old keys keep working this way:

1. `kwak-license new-keys`; save both halves in the password manager.
2. Add the new public key to every app's `PublicKeys` list, **keeping the old one**, and release
   every app.
3. Once most people have updated, put the new private key in the Worker
   (`secret put KWAK_LICENSE_PRIVATE_KEY`) and the new public key in `KWAK_PUBLIC_KEY`, and
   redeploy.

**If the private key leaks** (anyone with it can make keys for every app): make a new pair, put
it in the Worker at once, and release every app with **only** the new public key. Every key sold
before then stops working at that update, so re-send each buyer a new key from Paddle's records
(transaction id, name or email) with `sign`. This is why the private key goes nowhere but the
Worker and the password manager.

## Blocking keys

Apps check keys offline, so blocking takes effect with each app's **next release**.

- **A key posted online (forum, crack).** `kwak-license check <key>` prints its key id (16 hex
  characters). Add the id to that app's blocked keys list, release, and send the buyer a
  replacement made with `sign … --reissue 1` (it gets a new id; use 2, 3… for later ones). Only
  the shared key stops working.
- **A refund or chargeback.** Add the Paddle transaction id to the app's withdrawn orders list.
  Every key for that order stops working, replacements included.

Keep a private note of what was blocked and why (date, app, key id or order); the lists in the
code hold only the ids.

## Resend

**What it does.** Sends the licence emails, from `Kwak Software <licences@kwaksoftware.ca>`,
replies to `support@kwaksoftware.ca`. Chosen because Cloudflare's own email can only reach
verified addresses. It sees each buyer's name, email and key while sending and keeps a short log;
the privacy policy names it.

**Setup.** Domain kwaksoftware.ca verified (2026-11-24). DNS records at CanSpace:
`resend._domainkey` (TXT, DKIM), `send` records (CNAME to Resend's `*.forge.rmta.net`), and
`_dmarc` (TXT). Removing any of these makes keys land in spam or bounce.

**Limits.** 100 emails a day, 3,000 a month on the free plan. Above that, Resend Pro is about
US$20 a month. The Worker uses the order id as the idempotency key, so Paddle's retries within
24 hours don't send twice.

**Rotate the API key.** Resend → API Keys → create (Sending access, kwaksoftware.ca) →
`secret put RESEND_API_KEY` → test a sandbox purchase → delete the old key.

**Check delivery.** Resend → Emails shows each send and whether it bounced.

## Domain, DNS and the website

**Registrar and DNS: CanSpace** (kwaksoftware.ca). DNS records that matter:

| Record | Points to | For |
| --- | --- | --- |
| `@` A × 4 | 185.199.108.153, .109.153, .110.153, .111.153 | GitHub Pages |
| `www` CNAME | `andykwak.github.io` | GitHub Pages |
| Resend records (above) | Resend | Licence email |
| MX, SPF (TXT) and DKIM records from Zoho | Zoho Mail | support@ and other kwaksoftware.ca mailboxes |

SPF is a single TXT record on `@`. Resend sends from the `send` subdomain with its own records, so it doesn't need adding to Zoho's SPF. If another service ever sends as @kwaksoftware.ca, it goes into that one record; a second SPF record breaks both.

Keep the domain on auto-renew: if it lapses, the website, the support address and the licence
emails all stop at once.

**Website.** GitHub Pages from `main`, folder `/` of this repository; `CNAME` holds
`kwaksoftware.ca`. A merge to `main` is live within a minute or two. **Enforce HTTPS** must stay
ticked (Settings → Pages); Paddle's review requires HTTPS. Pages renews the certificate itself.

**Contact form.** Posts to FormSubmit, which emails support@kwaksoftware.ca. If the inbox address
ever changes, FormSubmit sends a new one-time confirmation link to click.

## Azure Artifact Signing

**What it does.** Signs the direct-download installers so Windows shows a known publisher instead
of "Windows protected your PC". Identity validated 2026-11-25 as an **individual, "Andrew Kwak"**,
so direct downloads show "Andrew Kwak" as publisher. Store packages show "Kwak Software" because
the Store signs them. Showing "Kwak Software" on direct downloads would need organization
validation.

**What lives where.**

- Azure: one Artifact Signing account (Basic plan) and one **Public Trust** certificate profile,
  used by both apps. The certificate itself is short-lived and renewed by Microsoft; nothing to
  rotate.
- Entra ID: one app registration (suggested name `kwak-release-signing`) with a federated
  credential per repository (`andykwak/pecan` and `andykwak/recarve`, entity **Environment**,
  name `release`), and the role **Artifact Signing Certificate Profile Signer** on the account.
- GitHub, in each repository: the `release` environment, and the repository variables
  `AZURE_TENANT_ID` and `AZURE_CLIENT_ID`.
- In each repository, `packaging/signing.json`: `Endpoint` (the account's regional address),
  `CodeSigningAccountName`, `CertificateProfileName`. Both files are still empty.

**How a release is signed.**

- **Pecan:** tag `v1.2.3` (must match `Directory.Build.props`) → the `release` job in
  `.github/workflows/ci.yml` signs Pecan's programs and both `.msi` files (English, French) and
  puts them on a **draft** GitHub release. A push to `release/pecan-<version>` does the same but
  leaves the files on the runner.
- **ReKarver:** tag `rekarver-v1.0.0` (must match `Cargo.toml`) → signed MSIX
  (`tools/package-msix.ps1 -Direct -Release`) on a draft GitHub release. A push to
  `release/rekarver-1.0` uploads it as the run artifact `rekarver-release`.
- Every other build is unsigned. Only Kwak Software's own binaries and the installers are signed,
  to stay within the plan's monthly signatures.

**Adding another app** (Purrsor, Phono, MailMove): add a federated credential for its repository
(environment `release`), the two repository variables, its own `signing.json`, and a release job
like Pecan's.

**If signing stops working:** check the subscription is paid, the identity validation hasn't
lapsed, and the app registration still has the role. To sign by hand on the PC instead,
`az login` as someone with that role and run the build script with `-Sign` (Pecan:
`packaging/make-msi.ps1 -Sign`).

## GitHub Releases and downloads

Release jobs make **draft** releases; nothing is public until Andy opens the draft, checks it and
clicks Publish. Each installer's version has the CI run number as its fourth part, so builds
install over each other.

| App | Tag | Files |
| --- | --- | --- |
| Pecan | `v1.0.0` | `Pecan-1.0.0.msi`, `Pecan-1.0.0-fr.msi` |
| ReKarver | `rekarver-v1.0.0` | `ReKarver-1.0.0.<build>.msix` |

A new certificate starts with little SmartScreen reputation, so the first downloads may still
show a warning until enough people have run them.

## Self-hosted runners

CI for Pecan, ReKarver and MailMove runs on Andy's Windows PC (labels `self-hosted, Windows`,
ReKarver and MailMove also `X64`). Pecan's runner is at `C:\actions-runner-pecan`. The PC must be
on and the runner service running for builds and releases; GitHub-hosted runners are used only
when the ReKarver repository variable `HOSTED_RUNNERS` is `true`.

- The runners' account can't read Andy's personal folders (by design).
- Release jobs leave a short-lived Azure sign-in token in the runner's temp folder and delete it
  at the end of the job.
- On a **public** repository, a pull request from a fork can run code on the PC. In each
  repository: Settings → Actions → General, set fork pull request workflows to need approval for all outside contributors.
- Updating a runner: GitHub updates it itself; if it goes offline, restart the
  "GitHub Actions Runner" service in Windows Services.

## Microsoft Store (Partner Center)

**What it does.** Will list Pecan and ReKarver in the Store a week or two after direct sales
start. Partner Center account validated 2026-11-25, publisher display name **Kwak Software**.

- The Store signs Store packages and handles payment and licences; Store builds never ask for a
  key (`-p:PecanEdition=Store`, `-p:ReKarverEdition=Store`). No secrets in the repositories.
- Package identity goes in `packaging/identity.json` in each repository (Name, Publisher `CN=…`,
  PublisherDisplayName, StoreId). Both still have test or empty values.
- Pecan: "Trial never expires" in Partner Center; the app counts 14 days itself. Steps:
  pecan `docs/STORE.md`. ReKarver: no trial. Steps: https://claude.ai/artifact/3vwfCS3apnxZz3DeaTZXgB.
- Price: Canada exactly CA$9.99, other markets from the nearest tier.

---

## Regular checks

- **Each month:** a sandbox or real test purchase still gets an email; Resend usage is under the
  free limit; the Azure bill is about US$10.
- **Before 2027-02-23:** replace the sandbox Paddle API key, and check the expiry of the live one.
- **Each app release:** copy any new withdrawn orders and blocked key ids into it.
- **Yearly:** domain renewal at CanSpace; Partner Center account renewal if one is charged.

## Open items

- [ ] **Paddle live:** make the live products (Pecan, ReKarver), the Customers: Read API key and
      the notification destination; repeat the checkout settings; then the signer go-live above.
- [ ] **Live buy buttons** on the product pages with Paddle.js.
- [ ] **Azure signing:** certificate profile, app registration, federated credentials, repository
      variables; then fill `packaging/signing.json` in pecan and recarve. Note: Artifact Signing
      has no Canada Central region, so the endpoint is another region's address (for example
      `https://eus.codesigning.azure.net` for East US).
- [ ] **Partner Center:** reserve names, copy the identity into both `identity.json` files,
      pricing, age ratings, screenshots.
- [ ] **Purrsor, Phono, MailMove:** licensing PRs (cat-toy #7/#8, Phono #42/#43, konverter #10)
      to merge, production public key in each, Paddle products, `PRODUCTS` entries.
- [ ] Consider a required reviewer on each repository's `release` environment, so a signed
      release can't run without Andy's click.
