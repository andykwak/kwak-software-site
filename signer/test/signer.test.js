// Tests for the licence signer. Run with `npm test` (Node 20 or later; no packages needed).
// Keys are checked against the shared test vectors in pecan's docs/LICENCE-KEYS.md.

import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { handleEvent, products, appsBought } from "../src/index.js";
import { signKey, verifyKey, cleanBuyerName, wrapKey } from "../src/licence.js";
import { verifyPaddleSignature } from "../src/paddle.js";
import { composeEmail, languageFor } from "../src/email.js";

// The published, test-only key pair from the format document. Keys signed with it are worthless.
const TEST_PUBLIC =
  "MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEk8mM/WsMR66P4M+XLmMwtDwdDXmbcnmZL07XvdsbTV9HEZyFGHg5ZgXckpU8U/gC5Gj+hw8rmopAGrZFHTv3aQ==";
const TEST_PRIVATE =
  "MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg/QjsubxEo67VTpqV+fVxpl/ptcEmOxwKI9O4vPPJp06hRANCAASTyYz9awxHro/gz5cuYzC0PB0NeZtyeZkvTte92xtNX0cRnIUYeDlmBdySlTxT+ALkaP6HDyuaikAatkUdO/dp";
const PECAN_VECTOR =
  "KWAK1.eyJ2IjoxLCJhcHAiOiJwZWNhbiIsIm5hbWUiOiJUZXN0IEJ1eWVyIiwib3JkZXIiOiJ0ZXN0LTAwMDEiLCJpc3N1ZWQiOiIyMDI2LTExLTIxIiwibWFqb3IiOjF9.kCl_R7_kUU0WJN6i9jY63dqktHDn9emRBp5-ZWbiM_s2htA4I486RoKN72t_DT0PQESJcUgJC2PmyOZy9d8kjg";
const ELISE_VECTOR =
  "KWAK1.eyJ2IjoxLCJhcHAiOiJwZWNhbiIsIm5hbWUiOiLDiWxpc2UgQ8O0dMOpIiwib3JkZXIiOiJ0ZXN0LTAwMDIiLCJpc3N1ZWQiOiIyMDI2LTExLTIxIiwibWFqb3IiOjF9.n44so-DNMbGTYkDcawDBfv8PMCXy-178_mUczCWrjarxAlSTie9SCkq-RW8DT9dQp7YW77nwbF5mmNdD-yRC-w";
const OTHER_VECTORS = {
  rekarver:
    "KWAK1.eyJ2IjoxLCJhcHAiOiJyZWthcnZlciIsIm5hbWUiOiJUZXN0IEJ1eWVyIiwib3JkZXIiOiJ0ZXN0LTAwMDEiLCJpc3N1ZWQiOiIyMDI2LTExLTIxIiwibWFqb3IiOjF9",
  purrsor:
    "KWAK1.eyJ2IjoxLCJhcHAiOiJwdXJyc29yIiwibmFtZSI6IlRlc3QgQnV5ZXIiLCJvcmRlciI6InRlc3QtMDAwMSIsImlzc3VlZCI6IjIwMjYtMTEtMjEiLCJtYWpvciI6MX0",
  phono:
    "KWAK1.eyJ2IjoxLCJhcHAiOiJwaG9ubyIsIm5hbWUiOiJUZXN0IEJ1eWVyIiwib3JkZXIiOiJ0ZXN0LTAwMDEiLCJpc3N1ZWQiOiIyMDI2LTExLTIxIiwibWFqb3IiOjF9",
  mailmove:
    "KWAK1.eyJ2IjoxLCJhcHAiOiJtYWlsbW92ZSIsIm5hbWUiOiJUZXN0IEJ1eWVyIiwib3JkZXIiOiJ0ZXN0LTAwMDEiLCJpc3N1ZWQiOiIyMDI2LTExLTIxIiwibWFqb3IiOjF9",
};
const WEBHOOK_SECRET = "pdl_ntfset_test_secret";

const signedPart = (key) => key.split(".").slice(0, 2).join(".");

// --- keys ---

test("a key made here has exactly the payload of the shared test vector", async () => {
  const key = await signKey(
    { app: "pecan", name: "Test Buyer", order: "test-0001", issued: "2026-11-21", major: 1 },
    TEST_PRIVATE,
  );
  assert.equal(signedPart(key), signedPart(PECAN_VECTOR));
  assert.ok(await verifyKey(key, TEST_PUBLIC));
});

test("every app's payload matches its vector", async () => {
  for (const [app, vector] of Object.entries(OTHER_VECTORS)) {
    const key = await signKey({ app, name: "Test Buyer", order: "test-0001", issued: "2026-11-21" }, TEST_PRIVATE);
    assert.equal(signedPart(key), vector, app);
  }
});

test("a non-ASCII name is written as plain UTF-8, as in the vector", async () => {
  const key = await signKey({ app: "pecan", name: "Élise Côté", order: "test-0002", issued: "2026-11-21" }, TEST_PRIVATE);
  assert.equal(signedPart(key), signedPart(ELISE_VECTOR));
});

test("the published vectors verify, and a changed one doesn't", async () => {
  assert.equal((await verifyKey(PECAN_VECTOR, TEST_PUBLIC)).name, "Test Buyer");
  assert.equal((await verifyKey(ELISE_VECTOR, TEST_PUBLIC)).name, "Élise Côté");
  const changed = PECAN_VECTOR.replace("eyJ2", "eyJ3");
  assert.equal(await verifyKey(changed, TEST_PUBLIC), null);
  assert.equal(await verifyKey("KWAK1.abc", TEST_PUBLIC), null);
  assert.equal(await verifyKey("", TEST_PUBLIC), null);
});

test("a key wrapped for email still verifies", async () => {
  assert.ok(await verifyKey(wrapKey(PECAN_VECTOR, 20), TEST_PUBLIC));
});

test("a key from another key pair doesn't verify against the test public key", async () => {
  const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", other.privateKey)).toString("base64");
  const key = await signKey({ app: "pecan", name: "X", order: "o", issued: "2026-11-21" }, pkcs8);
  assert.equal(await verifyKey(key, TEST_PUBLIC), null);
});

test("names are cleaned and kept short", () => {
  assert.equal(cleanBuyerName("  Jo \n\t Tremblay​ "), "Jo Tremblay");
  assert.equal(cleanBuyerName(null), "");
  assert.equal(Array.from(cleanBuyerName("é".repeat(500))).length, 100);
  assert.equal(cleanBuyerName("🐱".repeat(150)), "🐱".repeat(100)); // never half a character
});

test("bad input to signKey is refused with a plain message", async () => {
  await assert.rejects(signKey({ app: "word", name: "a", order: "o" }, TEST_PRIVATE), /Unknown app/);
  await assert.rejects(signKey({ app: "pecan", name: " ", order: "o" }, TEST_PRIVATE), /name/);
  await assert.rejects(signKey({ app: "pecan", name: "a", order: "" }, TEST_PRIVATE), /order/);
  await assert.rejects(signKey({ app: "pecan", name: "a", order: "o" }, "bm90IGEga2V5"), /PKCS#8/);
});

// --- Paddle webhook signature ---

async function paddleHeader(body, ts = Math.floor(Date.now() / 1000), secret = WEBHOOK_SECRET) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const mac = Buffer.from(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}:${body}`))).toString("hex");
  return `ts=${ts};h1=${mac}`;
}

test("a correctly signed webhook passes", async () => {
  const body = '{"event_type":"transaction.completed"}';
  assert.ok(await verifyPaddleSignature(await paddleHeader(body), body, WEBHOOK_SECRET));
});

test("while a secret is rotated, either h1 may match", async () => {
  const body = "{}";
  const good = await paddleHeader(body);
  const ts = good.split(";")[0];
  assert.ok(await verifyPaddleSignature(`${ts};h1=${"0".repeat(64)};${good.split(";")[1]}`, body, WEBHOOK_SECRET));
});

test("a changed body, wrong secret, old timestamp or junk header fails", async () => {
  const body = '{"a":1}';
  const header = await paddleHeader(body);
  assert.equal(await verifyPaddleSignature(header, '{"a":2}', WEBHOOK_SECRET), false);
  assert.equal(await verifyPaddleSignature(header, body, "another secret"), false);
  const old = await paddleHeader(body, Math.floor(Date.now() / 1000) - 3600);
  assert.equal(await verifyPaddleSignature(old, body, WEBHOOK_SECRET), false);
  for (const junk of [null, "", "ts=;h1=", "h1=abc", "ts=1;h1=", "garbage"])
    assert.equal(await verifyPaddleSignature(junk, body, WEBHOOK_SECRET), false, String(junk));
  assert.equal(await verifyPaddleSignature(header, body, ""), false);
});

// --- the whole webhook ---

const env = {
  KWAK_LICENSE_PRIVATE_KEY: TEST_PRIVATE,
  KWAK_PUBLIC_KEY: TEST_PUBLIC,
  PADDLE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  PADDLE_API_KEY: "pdl_test_api",
  RESEND_API_KEY: "re_test",
  PADDLE_ENV: "sandbox",
  EMAIL_FROM: "Kwak Software <licences@kwaksoftware.ca>",
  SUPPORT_EMAIL: "support@kwaksoftware.ca",
  PRODUCTS: JSON.stringify({
    pro_pecan: { app: "pecan", download: "https://kwaksoftware.ca/pecan/" },
    pro_rekarver: { app: "rekarver", major: 1 },
    pro_purrsor: "purrsor",
  }),
};

function transaction(items = ["pro_pecan"], extra = {}) {
  return {
    event_type: "transaction.completed",
    data: {
      id: "txn_01test",
      status: "completed",
      customer_id: "ctm_01test",
      items: items.map((p) => ({ price: { id: "pri_x", product_id: p }, quantity: 1 })),
      ...extra,
    },
  };
}

/** A stand-in for Paddle's and Resend's APIs that records what was asked. */
function fakeApis({ customer = { name: "Jo Tremblay", email: "jo@example.com", locale: "en" }, resend = 200 } = {}) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).startsWith("https://sandbox-api.paddle.com/customers/"))
      return customer ? Response.json({ data: { id: "ctm_01test", ...customer } }) : new Response("no", { status: 404 });
    if (String(url) === "https://api.resend.com/emails")
      return typeof resend === "number" ? new Response("{}", { status: resend }) : resend();
    return new Response("unexpected", { status: 500 });
  };
  return { calls, fetchImpl, sent: () => JSON.parse(calls.find((c) => c.url.includes("resend")).init.body) };
}

test("a completed sale sends one email with a valid key and its file", async () => {
  const apis = fakeApis();
  const outcome = await handleEvent(transaction(), env, apis.fetchImpl, new Date("2026-11-21T12:00:00Z"));
  assert.equal(outcome, "Sent pecan for txn_01test");

  const paddle = apis.calls[0];
  assert.equal(paddle.url, "https://sandbox-api.paddle.com/customers/ctm_01test");
  assert.equal(paddle.init.headers.Authorization, "Bearer pdl_test_api");

  const resend = apis.calls[1];
  assert.equal(resend.init.headers.Authorization, "Bearer re_test");
  assert.equal(resend.init.headers["Idempotency-Key"], "licence-txn_01test");
  const email = apis.sent();
  assert.deepEqual(email.to, ["jo@example.com"]);
  assert.equal(email.reply_to, "support@kwaksoftware.ca");
  assert.equal(email.subject, "Your Pecan licence key");
  assert.match(email.text, /^Hi Jo Tremblay,/);
  assert.match(email.text, /Help > Enter licence key/);
  assert.match(email.text, /Download Pecan: https:\/\/kwaksoftware.ca\/pecan\//);

  assert.equal(email.attachments.length, 1);
  assert.equal(email.attachments[0].filename, "pecan.kwaklicense");
  const key = Buffer.from(email.attachments[0].content, "base64").toString("ascii");
  const payload = await verifyKey(key, TEST_PUBLIC);
  assert.deepEqual(payload, {
    v: 1,
    app: "pecan",
    name: "Jo Tremblay",
    order: "txn_01test",
    issued: "2026-11-21",
    major: 1,
  });
  // The wrapped copy in the text is the same key.
  assert.ok(email.text.replace(/\s+/g, "").includes(key));
});

test("two apps in one order get two keys in one email", async () => {
  const apis = fakeApis();
  await handleEvent(transaction(["pro_rekarver", "pro_purrsor", "pro_rekarver"]), env, apis.fetchImpl);
  const email = apis.sent();
  assert.deepEqual(
    email.attachments.map((a) => a.filename),
    ["rekarver.kwaklicense", "purrsor.kwaklicense"],
  );
  assert.equal(email.subject, "Your ReKarver and Purrsor licence keys");
});

test("a French-speaking buyer gets the email in French", async () => {
  const apis = fakeApis({ customer: { name: "Élise Côté", email: "e@example.ca", locale: "fr-CA" } });
  await handleEvent(transaction(), env, apis.fetchImpl);
  const email = apis.sent();
  assert.equal(email.subject, "Votre clé de licence Pecan");
  assert.match(email.text, /^Bonjour Élise Côté,/);
  assert.match(email.text, /Aide > Entrer une clé de licence/);
});

test("without a name at checkout, the key is licensed to the email address", async () => {
  const apis = fakeApis({ customer: { name: null, email: "jo@example.com", locale: "en" } });
  await handleEvent(transaction(), env, apis.fetchImpl);
  const email = apis.sent();
  assert.match(email.text, /^Hi,/);
  const key = Buffer.from(email.attachments[0].content, "base64").toString("ascii");
  assert.equal((await verifyKey(key, TEST_PUBLIC)).name, "jo@example.com");
});

test("other events, unfinished transactions and other products send nothing", async () => {
  const apis = fakeApis();
  assert.match(await handleEvent({ event_type: "transaction.created", data: {} }, env, apis.fetchImpl), /Ignored/);
  assert.match(await handleEvent(transaction(["pro_pecan"], { status: "billed" }), env, apis.fetchImpl), /Ignored/);
  assert.match(await handleEvent(transaction(["pro_tshirt"]), env, apis.fetchImpl), /Nothing to license/);
  assert.equal(apis.calls.length, 0);
});

test("a retry after the email already went counts as done", async () => {
  const apis = fakeApis({
    resend: () => new Response('{"name":"invalid_idempotent_request"}', { status: 409 }),
  });
  assert.equal(await handleEvent(transaction(), env, apis.fetchImpl), "Already sent txn_01test");
});

test("when Paddle or Resend fail, the webhook fails so Paddle retries", async () => {
  await assert.rejects(handleEvent(transaction(), env, fakeApis({ customer: null }).fetchImpl), /Paddle said 404/);
  await assert.rejects(handleEvent(transaction(), env, fakeApis({ resend: 500 }).fetchImpl), /Resend said 500/);
});

test("a private key that doesn't match the apps' public key never reaches a buyer", async () => {
  const other = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", other.privateKey)).toString("base64");
  const apis = fakeApis();
  await assert.rejects(
    handleEvent(transaction(), { ...env, KWAK_LICENSE_PRIVATE_KEY: pkcs8 }, apis.fetchImpl),
    /doesn't match/,
  );
  assert.equal(
    apis.calls.some((c) => c.url.includes("resend")),
    false,
  );
});

test("PRODUCTS is read in both forms and a wrong app is caught", () => {
  const map = products(env);
  assert.deepEqual(map.pro_purrsor, { app: "purrsor", major: 1, download: undefined });
  assert.equal(map.pro_pecan.download, "https://kwaksoftware.ca/pecan/");
  assert.throws(() => products({ PRODUCTS: '{"pro_x":"word"}' }), /unknown app/);
  assert.throws(() => products({ PRODUCTS: "{" }), /valid JSON/);
  assert.deepEqual(appsBought({ items: [null, {}, { price: null }] }, map), []);
});

test("the Worker answers only signed POSTs to /paddle", async () => {
  const body = JSON.stringify({ event_type: "transaction.created", data: {} });
  const post = async (path, headers) =>
    worker.fetch(new Request(`https://signer.example${path}`, { method: "POST", body, headers }), env);

  assert.equal((await worker.fetch(new Request("https://signer.example/"), env)).status, 404);
  assert.equal((await worker.fetch(new Request("https://signer.example/paddle"), env)).status, 405);
  assert.equal((await post("/paddle", {})).status, 401);
  assert.equal((await post("/paddle", { "Paddle-Signature": await paddleHeader(body, undefined, "wrong") })).status, 401);
  const ok = await post("/paddle", { "Paddle-Signature": await paddleHeader(body) });
  assert.equal(ok.status, 200);
  assert.match(await ok.text(), /Ignored transaction.created/);
});

test("a failure inside answers 500 without personal details", async () => {
  const body = JSON.stringify(transaction());
  const errors = [];
  const original = console.error;
  console.error = (m) => errors.push(m);
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("down", { status: 503 });
  try {
    const res = await worker.fetch(
      new Request("https://signer.example/paddle", {
        method: "POST",
        body,
        headers: { "Paddle-Signature": await paddleHeader(body) },
      }),
      env,
    );
    assert.equal(res.status, 500);
  } finally {
    globalThis.fetch = realFetch;
    console.error = original;
  }
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^Order txn_01test: Paddle said 503/);
});

test("email language follows the Paddle locale", () => {
  assert.equal(languageFor("fr"), "fr");
  assert.equal(languageFor("FR-ca"), "fr");
  assert.equal(languageFor("en"), "en");
  assert.equal(languageFor(undefined), "en");
});

test("every app has instructions in both languages", () => {
  for (const app of ["pecan", "rekarver", "purrsor", "phono", "mailmove"]) {
    for (const locale of ["en", "fr"]) {
      const email = composeEmail({ name: "A", order: "o", keys: [{ app, key: "KWAK1.x.y" }], locale, supportEmail: "s" });
      assert.ok(email.text.length > 100, `${app} ${locale}`);
    }
  }
});
