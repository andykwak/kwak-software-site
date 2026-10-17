# Kwak Software website

A single static page (`index.html`) with the apps, a contact form and the privacy policy.
No build step: edit the HTML and push.

## Contact form

The form posts to FormSubmit (https://formsubmit.co), which emails each message to
kwaksoftwareca@gmail.com. The very first message sends a one-time "confirm your email"
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

The privacy section is at `/#privacy`; use that URL for the Microsoft Store's privacy policy field.
