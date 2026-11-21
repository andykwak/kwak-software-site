// Kwak Software licence keys, format 1 (KWAK1). The format is written down in pecan's
// docs/LICENCE-KEYS.md; this file must make exactly the keys pecan's tools/KwakLicense makes.
//
//   KWAK1.<payload>.<signature>
//   payload    base64url (no padding) of compact UTF-8 JSON: v, app, name, order, issued, major
//   signature  base64url of an ECDSA P-256 / SHA-256 signature, r then s (64 bytes), over the
//              ASCII bytes of "KWAK1.<payload>"
//
// WebCrypto gives that signature form directly, so no extra code is needed to convert it.

export const PREFIX = "KWAK1.";
export const APPS = ["pecan", "rekarver", "purrsor", "phono"];

/** Longest buyer name put into a key. Real names are far shorter; this keeps keys a sane length. */
const MAX_NAME = 100;

/**
 * Makes a key. `privateKey` is the base64 DER PKCS#8 P-256 private key (the Worker secret).
 * `issued` is a Date or a "YYYY-MM-DD" string.
 */
export async function signKey({ app, name, order, issued, major = 1 }, privateKey) {
  if (!APPS.includes(app)) throw new Error(`Unknown app "${app}".`);
  if (!order) throw new Error("A key needs an order number.");
  const cleanName = cleanBuyerName(name);
  if (!cleanName) throw new Error("A key needs the buyer's name.");
  if (!Number.isInteger(major) || major < 1) throw new Error("major must be a whole number, 1 or more.");

  // Field order matches the signing tool, so a key made here and one made there for the same sale
  // differ only in the signature.
  const json = JSON.stringify({ v: 1, app, name: cleanName, order: String(order), issued: day(issued), major });
  const signed = PREFIX + toBase64Url(new TextEncoder().encode(json));
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, ascii(signed));
  return signed + "." + toBase64Url(new Uint8Array(signature));
}

/**
 * Checks a key against a base64 SubjectPublicKeyInfo public key and returns its payload, or null.
 * Used by the tests and by a start-up self-check (the secret really is the private half of the
 * public key the apps have).
 */
export async function verifyKey(text, publicKey) {
  const key = String(text ?? "").replace(/\s+/g, "");
  const parts = key.split(".");
  if (parts.length !== 3 || parts[0] + "." !== PREFIX) return null;
  let signature;
  let payload;
  try {
    signature = fromBase64Url(parts[2]);
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(fromBase64Url(parts[1])));
  } catch {
    return null;
  }
  if (signature.length !== 64) return null;
  const pub = await crypto.subtle.importKey("spki", fromBase64(publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, [
    "verify",
  ]);
  const ok = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, signature, ascii(PREFIX + parts[1]));
  return ok ? payload : null;
}

/**
 * The name as it goes into "Licensed to …": control characters removed, runs of spaces made one,
 * trimmed, at most MAX_NAME characters (never cutting a character in half).
 */
export function cleanBuyerName(name) {
  const plain = String(name ?? "")
    .replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Array.from(plain).slice(0, MAX_NAME).join("").trim();
}

/** The key cut into lines of 60 characters, for an email (the apps ignore the line breaks). */
export function wrapKey(key, width = 60) {
  const lines = [];
  for (let i = 0; i < key.length; i += width) lines.push(key.slice(i, i + width));
  return lines.join("\n");
}

function day(issued) {
  if (typeof issued === "string" && /^\d{4}-\d{2}-\d{2}$/.test(issued)) return issued;
  const date = issued instanceof Date ? issued : new Date();
  return date.toISOString().slice(0, 10); // UTC, like the signing tool
}

async function importPrivateKey(privateKey) {
  try {
    return await crypto.subtle.importKey(
      "pkcs8",
      fromBase64(privateKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  } catch {
    throw new Error("The private key secret isn't a base64 PKCS#8 P-256 key (from kwak-license new-keys).");
  }
}

function ascii(text) {
  return new TextEncoder().encode(text); // the signed text is plain ASCII, so UTF-8 is the same bytes
}

export function toBase64Url(bytes) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error("not base64url");
  return fromBase64(text.replace(/-/g, "+").replace(/_/g, "/"));
}

function fromBase64(text) {
  const clean = String(text).replace(/\s+/g, "");
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
