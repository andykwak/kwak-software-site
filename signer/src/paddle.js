// What the signer needs from Paddle Billing: checking that a webhook really came from Paddle, and
// looking up the buyer's name and email (a transaction only carries the customer's id).

/** How old a webhook may be, in seconds. Paddle sends at once; a retry is signed afresh. */
export const MAX_AGE_SECONDS = 300;

/**
 * Checks the Paddle-Signature header ("ts=1700000000;h1=<hex>", with more than one h1 while a
 * secret is being rotated) against the raw body. Returns true or false; never throws.
 * See https://developer.paddle.com/webhooks/signature-verification
 */
export async function verifyPaddleSignature(header, rawBody, secret, nowSeconds = Date.now() / 1000) {
  if (!header || !secret) return false;
  let ts = null;
  const h1 = [];
  for (const part of String(header).split(";")) {
    const [k, v] = part.split("=", 2).map((s) => s?.trim());
    if (k === "ts") ts = v;
    else if (k === "h1" && v) h1.push(v.toLowerCase());
  }
  if (!ts || !/^\d+$/.test(ts) || h1.length === 0) return false;
  if (Math.abs(nowSeconds - Number(ts)) > MAX_AGE_SECONDS) return false;

  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`)));
  const expected = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return h1.some((candidate) => sameText(candidate, expected));
}

/** Compares two strings in time that doesn't depend on where they differ. */
function sameText(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The Paddle API for this environment: "sandbox" for testing, anything else is live. */
export function apiBase(env) {
  return env.PADDLE_ENV === "sandbox" ? "https://sandbox-api.paddle.com" : "https://api.paddle.com";
}

/**
 * Looks up a customer: { name, email, locale }. Needs an API key with permission to read
 * customers. Throws with a plain message when Paddle can't be reached or refuses, so the webhook
 * fails and Paddle tries again later.
 */
export async function getCustomer(customerId, env, fetchImpl = fetch) {
  if (!/^ctm_[a-z0-9]+$/i.test(customerId ?? "")) throw new Error("The transaction has no customer id.");
  const response = await fetchImpl(`${apiBase(env)}/customers/${customerId}`, {
    headers: { Authorization: `Bearer ${env.PADDLE_API_KEY}`, Accept: "application/json" },
  });
  if (!response.ok) throw new Error(`Paddle said ${response.status} when asked for customer ${customerId}.`);
  const { data } = await response.json();
  if (!data?.email) throw new Error(`Customer ${customerId} has no email address.`);
  return { name: data.name ?? "", email: data.email, locale: data.locale ?? "en" };
}
