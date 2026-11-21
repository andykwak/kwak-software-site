// The email that carries a licence key, and sending it through Resend (https://resend.com).

import { wrapKey } from "./licence.js";

/** What each app is called, and where its key goes, in English and French. */
export const APP_TEXT = {
  pecan: {
    title: "Pecan",
    en: "In Pecan, choose Help > Enter licence key…",
    fr: "Dans Pecan, choisissez Aide > Entrer une clé de licence…",
  },
  rekarver: {
    title: "ReKarver",
    en: "ReKarver asks for the key the first time it starts.",
    fr: "ReKarver demande la clé la première fois qu'il démarre.",
  },
  purrsor: {
    title: "Purrsor",
    en: "Purrsor asks for the key the first time it starts. You can also choose Enter a licence key… in its menu in the taskbar's notification area, or open the attached file.",
    fr: "Purrsor demande la clé la première fois qu'il démarre. Vous pouvez aussi choisir Entrer une clé de licence… dans son menu, dans la zone de notification de la barre des tâches, ou ouvrir le fichier joint.",
  },
  phono: {
    title: "Phono",
    en: "In Phono, open Settings > Licence.",
    fr: "Dans Phono, ouvrez Paramètres > Licence.",
  },
  mailmove: {
    title: "MailMove",
    en: "In MailMove, choose Help > Enter licence key…, or Enter licence key on the start screen.",
    fr: "Dans MailMove, choisissez Help > Enter licence key… (Aide > Entrer la clé de licence), ou Enter licence key sur l'écran de départ. MailMove est en anglais pour l'instant.",
  },
};

/** French for buyers whose Paddle locale is French; English for everyone else. */
export function languageFor(locale) {
  return String(locale ?? "").toLowerCase().startsWith("fr") ? "fr" : "en";
}

/**
 * The email for one order: { subject, text, attachments }. `keys` is a list of
 * { app, key, download } (a buyer may buy more than one app at once).
 */
export function composeEmail({ name, order, keys, locale, supportEmail }) {
  const lang = languageFor(locale);
  const titles = keys.map((k) => APP_TEXT[k.app].title).join(lang === "fr" ? " et " : " and ");
  const plural = keys.length > 1;
  const blocks = keys.map((k) => {
    const t = APP_TEXT[k.app];
    const lines = [`${t.title}`, "", wrapKey(k.key), "", t[lang]];
    if (k.download)
      lines.push(lang === "fr" ? `Télécharger ${t.title} : ${k.download}` : `Download ${t.title}: ${k.download}`);
    return lines.join("\n");
  });

  const text =
    lang === "fr"
      ? [
          name ? `Bonjour ${name},` : "Bonjour,",
          "",
          `Merci d'avoir acheté ${titles}. Voici ${plural ? "vos clés" : "votre clé"} de licence (commande ${order}).`,
          `Collez ${plural ? "chaque clé" : "la clé"} telle quelle, ou ouvrez le fichier .kwaklicense joint. Les sauts de ligne et les espaces ne posent pas de problème.`,
          "",
          ...blocks.flatMap((b) => [b, ""]),
          "La clé est vérifiée sur votre ordinateur : l'app ne se connecte jamais à Internet pour le faire.",
          "Gardez ce courriel : vous en aurez besoin si vous réinstallez l'app ou changez d'ordinateur.",
          "",
          `Une question ou un problème? Répondez à ce courriel ou écrivez à ${supportEmail}.`,
          "",
          "Kwak Software",
        ].join("\n")
      : [
          name ? `Hi ${name},` : "Hi,",
          "",
          `Thanks for buying ${titles}. Here ${plural ? "are your licence keys" : "is your licence key"} (order ${order}).`,
          `Paste ${plural ? "each key" : "the key"} as it is, or open the attached .kwaklicense file. Line breaks and spaces don't matter.`,
          "",
          ...blocks.flatMap((b) => [b, ""]),
          "The key is checked on your computer: the app never goes online to do it.",
          "Keep this email. You'll need it if you reinstall the app or move to another computer.",
          "",
          `Questions or problems? Reply to this email or write to ${supportEmail}.`,
          "",
          "Kwak Software",
        ].join("\n");

  const subject =
    lang === "fr"
      ? `${plural ? "Vos clés" : "Votre clé"} de licence ${titles}`
      : `Your ${titles} licence ${plural ? "keys" : "key"}`;

  const attachments = keys.map((k) => ({
    filename: `${k.app}.kwaklicense`,
    content: btoa(k.key), // the key is plain ASCII
  }));
  return { subject, text, attachments };
}

/**
 * Sends the email with Resend. The order number is the idempotency key, so when Paddle sends the
 * same webhook again (it retries after any error) the buyer still gets one email.
 * Returns "sent" or "already sent". Throws with a plain message on failure, so the webhook fails and Paddle tries again later.
 */
export async function sendEmail({ to, order, email }, env, fetchImpl = fetch) {
  const response = await fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `licence-${order}`,
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      reply_to: env.SUPPORT_EMAIL,
      subject: email.subject,
      text: email.text,
      attachments: email.attachments,
    }),
  });
  if (response.ok) return "sent";
  const detail = (await response.text().catch(() => "")).slice(0, 300);
  // Every attempt signs afresh (ECDSA signatures differ each time), so a retry's body differs from
  // the first one's. Resend then refuses the repeated idempotency key: the first email already went.
  if (response.status === 409 && detail.includes("invalid_idempotent_request")) return "already sent";
  throw new Error(`Resend said ${response.status} for order ${order}: ${detail}`);
}
