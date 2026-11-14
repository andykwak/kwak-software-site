# Kwak Software website

A static page (`index.html`, French in `fr/`) with the apps and a contact form, plus the privacy
policy at `privacy/` (French at `fr/confidentialite/`).
No build step: edit the HTML and push.

## Product pages

Each app has its own page: `rekarver/`, `pecan/`, `cat-toy/` and `phono/`, with French copies under
`fr/` at the same paths. They share `assets/product.css`. The home pages keep a short card for each app
that links to its page. Names and branding for the apps still in development aren't final: if a name
changes, rename its folders and update the links on both home pages.

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
4. Once the certificate is issued, tick **Enforce HTTPS**.

The privacy policy is at https://kwaksoftware.ca/privacy/ (French: /fr/confidentialite/); apps and the
Microsoft Store's privacy policy field link there. Keep both languages and the home pages' short
privacy summary in sync with what the apps actually do.
