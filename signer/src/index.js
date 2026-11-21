// The Kwak Software licence signer: a Cloudflare Worker that Paddle calls when a sale completes.
//
// For each paid transaction it signs a KWAK1 licence key for every app bought and emails the keys
// to the buyer. It keeps nothing: no database, no logs of names or email addresses. Paddle stays the
// record of every sale, and a key can always be made again from it (pecan's kwak-license sign).
//
// Settings (see README.md):
//   secrets  KWAK_LICENSE_PRIVATE_KEY, PADDLE_WEBHOOK_SECRET, PADDLE_API_KEY, RESEND_API_KEY
//   vars     KWAK_PUBLIC_KEY, PRODUCTS, PADDLE_ENV, EMAIL_FROM, SUPPORT_EMAIL

import { APPS, cleanBuyerName, signKey, verifyKey } from "./licence.js";
import { verifyPaddleSignature, getCustomer } from "./paddle.js";
import { composeEmail, sendEmail } from "./email.js";

/** Largest webhook body read. Paddle's are a few kilobytes. */
const MAX_BODY = 256 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/paddle") return text(404, "Not found");
    if (request.method !== "POST") return text(405, "Use POST");

    const body = await readBody(request);
    if (body === null) return text(413, "Too large");
    if (!(await verifyPaddleSignature(request.headers.get("Paddle-Signature"), body, env.PADDLE_WEBHOOK_SECRET)))
      return text(401, "Bad signature");

    let event;
    try {
      event = JSON.parse(body);
    } catch {
      return text(400, "Not JSON");
    }

    try {
      const outcome = await handleEvent(event, env);
      return text(200, outcome);
    } catch (error) {
      // Paddle retries a failed webhook several times over the next few days, so a passing problem
      // (Resend or Paddle briefly down) fixes itself. The message has ids only, never personal data.
      console.error(`Order ${event?.data?.id ?? "?"}: ${error.message}`);
      return text(500, "Not done; Paddle will retry");
    }
  },
};

/** Handles one verified Paddle event and says what happened, for Paddle's delivery log. */
export async function handleEvent(event, env, fetchImpl = fetch, now = new Date()) {
  if (event?.event_type !== "transaction.completed") return `Ignored ${event?.event_type ?? "unknown event"}`;
  const txn = event.data ?? {};
  if (txn.status !== "completed") return `Ignored a ${txn.status} transaction`;

  const items = appsBought(txn, products(env));
  if (items.length === 0) return "Nothing to license in this transaction";

  const customer = await getCustomer(txn.customer_id, env, fetchImpl);
  const realName = cleanBuyerName(customer.name);
  // Paddle's checkout may not ask for a name. The key then says "Licensed to <email>" instead.
  const keyName = realName || cleanBuyerName(customer.email);

  const keys = [];
  for (const item of items) {
    const key = await signKey(
      { app: item.app, name: keyName, order: txn.id, issued: now, major: item.major },
      env.KWAK_LICENSE_PRIVATE_KEY,
    );
    // A key that the apps would refuse must never reach a buyer: check it with the public key
    // the apps have built in. This catches a private key secret that doesn't match.
    if (!(await verifyKey(key, env.KWAK_PUBLIC_KEY)))
      throw new Error("A key failed its own check: KWAK_LICENSE_PRIVATE_KEY doesn't match KWAK_PUBLIC_KEY.");
    keys.push({ app: item.app, key, download: item.download });
  }

  const email = composeEmail({
    name: realName,
    order: txn.id,
    keys,
    locale: customer.locale,
    supportEmail: env.SUPPORT_EMAIL,
  });
  const sent = await sendEmail({ to: customer.email, order: txn.id, email }, env, fetchImpl);
  return sent === "sent" ? `Sent ${keys.map((k) => k.app).join(", ")} for ${txn.id}` : `Already sent ${txn.id}`;
}

/**
 * PRODUCTS maps Paddle product ids to apps:
 *   {"pro_01abc": {"app": "pecan", "major": 1, "download": "https://kwaksoftware.ca/pecan/"}}
 * "major" (default 1) and "download" are optional; a plain "pecan" works as well.
 */
export function products(env) {
  let map;
  try {
    map = typeof env.PRODUCTS === "string" ? JSON.parse(env.PRODUCTS) : (env.PRODUCTS ?? {});
  } catch {
    throw new Error("PRODUCTS isn't valid JSON.");
  }
  const out = {};
  for (const [id, value] of Object.entries(map)) {
    const entry = typeof value === "string" ? { app: value } : value;
    if (!APPS.includes(entry?.app)) throw new Error(`PRODUCTS has an unknown app for ${id}.`);
    out[id] = { app: entry.app, major: entry.major ?? 1, download: entry.download };
  }
  return out;
}

/** The apps a transaction paid for, once each, in the order bought. Other products are skipped. */
export function appsBought(txn, productMap) {
  const seen = new Set();
  const out = [];
  for (const item of txn.items ?? []) {
    const product = productMap[item?.price?.product_id];
    if (!product || seen.has(product.app)) continue;
    seen.add(product.app);
    out.push(product);
  }
  return out;
}

async function readBody(request) {
  const declared = Number(request.headers.get("Content-Length") ?? 0);
  if (declared > MAX_BODY) return null;
  const body = await request.text();
  return body.length > MAX_BODY ? null : body;
}

function text(status, message) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
