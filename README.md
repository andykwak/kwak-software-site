# Kwak Software website

A static page (`index.html`, French in `fr/`) with the apps and a contact form, plus the privacy
policy at `privacy/` (French at `fr/confidentialite/`).
No build step: edit the HTML and push.

## Product pages

Each app has its own page: `rekarver/`, `rekarver-documents/`, `pecan/`, `purrsor/` and `phonoout/`, with French copies under
`fr/` at the same paths. They share `assets/product.css`. The home pages keep a short card for each app
that links to its page. Each page opens with a banner in the app's icon colours, after ReKarver's splash screen; the colours, icon and line drawing for each app are in one place in the page generator's `LOOK` table (copied into each page). App icons live in `assets/apps/`. Names and branding for the apps still in development aren't final: if a name
changes, rename its folders and update the links on both home pages.

## Selling

ReKarver and Pecan show their prices (CAD) and a "Buying" section with system requirements, but no Buy
or Download buttons until Paddle checkout and the signed downloads work. The terms of sale and refunds
are at `terms/` (French at `fr/conditions/`), and every page's header and footer link to them and to the privacy policy.
The terms name the seller's legal name (Andrew Kwak, operating as Kwak Software), which Paddle's review asks for;
keep it the same as the name on the Paddle account. Paddle only handles software, so the site doesn't offer contract work.
The privacy policy's "Buying on this website" section names Paddle, Cloudflare (makes the licence key)
and Resend (emails it); each app's privacy page links to it. Keep prices the same on the home cards,
the product pages and the terms.

## Fonts

Public Sans and IBM Plex are served from `assets/fonts/` (latin and latin-ext subsets, SIL OFL),
not Google Fonts, so visitors' browsers never contact Google. The privacy policy says so; keep it that way.

## Contact form

The form posts to FormSubmit (https://formsubmit.co), which emails each message to
support@kwaksoftware.ca. The very first message sends a one-time "confirm your email"
link to that inbox; click it and every message after that is delivered.

## Hosting on GitHub Pages (free)

1. Push this repo to GitHub.
2. Settings > General: make the repository **public** (GitHub Pages is free only for public repos).
3. Settings > Pages > Source: **Deploy from a branch**, branch `main`, folder `/ (root)`.
4. The site appears at `https://<user>.github.io/<repo>/`.

### Custom domain (optional)

1. Buy the domain (Cloudflare Registrar sells at cost, about $10/yr for `.com`).
2. Settings > Pages > Custom domain: enter it, e.g. `kwaksoftware.com`. GitHub adds a `CNAME` file.
3. At the registrar's DNS, add `A` records for `@` pointing to 185.199.108.153, 185.199.109.153,
   185.199.110.153 and 185.199.111.153, and a `CNAME` for `www` pointing to `<user>.github.io`.
4. Once the certificate is issued, tick **Enforce HTTPS**. Paddle's review requires HTTPS, and without this tick plain
   `http://` addresses load without redirecting.

`sitemap.xml` lists every page and `robots.txt` points to it. Add a page's URL to the sitemap when you add a page.

The site-wide privacy policy is at https://kwaksoftware.ca/privacy/ (French: /fr/confidentialite/). It
covers the website, contact, the Microsoft Store and your rights, and links to each app's own privacy
page: `<app>/privacy/` (French: `fr/<app>/confidentialite/`), which says what that app does with
information, from its code. All privacy pages share `assets/privacy.css`. ReKarver's app links to
https://kwaksoftware.ca/privacy, so that URL must keep working; an app's Store listing can point at its
own page. Keep both languages, the app pages and the home pages' short privacy summary in sync with what
the apps actually do, and change the effective date when a page's substance changes.

## Licence signer

`signer/` is a Cloudflare Worker, deployed separately, that Paddle calls after each sale: it signs
the buyer's licence key and emails it. It isn't part of the website (`_config.yml` keeps it off
GitHub Pages). Setup and running it: [signer/README.md](signer/README.md).
