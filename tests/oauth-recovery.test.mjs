import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { google } from "googleapis";
import { createApp } from "../server/app.mjs";

function encrypted(tokens, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret).digest(),
    iv,
  );
  const body = Buffer.concat([
    cipher.update(JSON.stringify(tokens)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString("base64");
}
function decrypted(value, secret) {
  const bytes = Buffer.from(value, "base64");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    createHash("sha256").update(secret).digest(),
    bytes.subarray(0, 12),
  );
  decipher.setAuthTag(bytes.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([
      decipher.update(bytes.subarray(28)),
      decipher.final(),
    ]).toString(),
  );
}
const profile = {
  sub: "google-user",
  name: "PM de prueba",
  email: "pm@example.test",
  email_verified: true,
  hd: "example.test",
};
const freshTokens = {
  access_token: "fresh-test-access",
  id_token: "fresh-test-id",
  expiry_date: Date.now() + 3600000,
};
const newSecret = "new-stable-session-secret-for-test-fixture";
async function fixture(
  t,
  {
    oldSecret = newSecret,
    verifyError = false,
    identity = profile,
    refreshToken,
  } = {},
) {
  const dir = mkdtempSync(join(tmpdir(), "nexo-oauth-recovery-"));
  const { app, db } = createApp({
    NODE_ENV: "test",
    DEMO_MODE: "false",
    DATABASE_PATH: join(dir, "nexo.sqlite"),
    SESSION_SECRET: newSecret,
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_WORKSPACE_DOMAIN: "example.test",
    PM_EMAILS: "pm@example.test",
    APP_URL: "http://localhost:3000",
  });
  const originalCiphertext = encrypted(
    { access_token: "old-test-access", refresh_token: "previous-test-refresh" },
    oldSecret,
  );
  db.prepare(
    "INSERT INTO users(id,name,email,role,tokens) VALUES(?,?,?,?,?)",
  ).run(profile.sub, profile.name, profile.email, "admin", originalCiphertext);
  const proto = google.auth.OAuth2.prototype,
    originalGetToken = proto.getToken,
    originalVerify = proto.verifyIdToken;
  let verificationCount = 0;
  proto.getToken = async (code) => {
    assert.equal(code, "new-authorization-code");
    return {
      tokens: {
        ...freshTokens,
        ...(refreshToken ? { refresh_token: refreshToken } : {}),
      },
    };
  };
  proto.verifyIdToken = async (options) => {
    verificationCount++;
    assert.equal(options.idToken, freshTokens.id_token);
    assert.equal(options.audience, "test-client");
    if (verifyError) throw new Error("invalid-signature-test");
    return { getPayload: () => identity };
  };
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(async () => {
    proto.getToken = originalGetToken;
    proto.verifyIdToken = originalVerify;
    await new Promise((r) => server.close(r));
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  let cookie = "";
  const get = async (path) => {
    const response = await fetch(url + path, {
      headers: cookie ? { cookie } : {},
      redirect: "manual",
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie").split(";")[0];
    return response;
  };
  const begin = await get("/auth/google");
  assert.equal(begin.status, 302);
  const state = new URL(begin.headers.get("location")).searchParams.get(
    "state",
  );
  const response = await get(
    `/auth/google/callback?state=${state}&code=new-authorization-code`,
  );
  return {
    db,
    response,
    get,
    originalCiphertext,
    verificationCount: () => verificationCount,
  };
}

test("a verified Google login replaces unreadable old credentials after secret rotation", async (t) => {
  const f = await fixture(t, {
    oldSecret: "previous-stable-secret-before-rotation",
    refreshToken: "fresh-test-refresh",
  });
  assert.throws(() => decrypted(f.originalCiphertext, newSecret));
  assert.equal(f.response.headers.get("location"), "/");
  assert.equal(f.verificationCount(), 1);
  const stored = f.db
    .prepare("SELECT tokens FROM users WHERE id=?")
    .get(profile.sub).tokens;
  assert.notEqual(stored, f.originalCiphertext);
  assert.deepEqual(decrypted(stored, newSecret), {
    ...freshTokens,
    refresh_token: "fresh-test-refresh",
  });
  assert.equal(
    (await (await f.get("/api/session")).json()).user.email,
    profile.email,
  );
});
test("normal reauthorization preserves a readable refresh token when Google omits a replacement", async (t) => {
  const f = await fixture(t);
  assert.equal(f.response.headers.get("location"), "/");
  const stored = f.db
    .prepare("SELECT tokens FROM users WHERE id=?")
    .get(profile.sub).tokens;
  assert.deepEqual(decrypted(stored, newSecret), {
    ...freshTokens,
    refresh_token: "previous-test-refresh",
  });
});
test("unreadable stored credentials never bypass verification of the newly issued ID token", async (t) => {
  const f = await fixture(t, {
    oldSecret: "old-unreadable-secret",
    verifyError: true,
  });
  assert.equal(f.response.headers.get("location"), "/?auth_error=google");
  assert.equal(f.verificationCount(), 1);
  assert.equal(
    f.db.prepare("SELECT tokens FROM users WHERE id=?").get(profile.sub).tokens,
    f.originalCiphertext,
  );
  assert.equal((await (await f.get("/api/session")).json()).user, null);
});
test("an otherwise verified external-domain account is rejected before recovering stored credentials", async (t) => {
  const f = await fixture(t, {
    oldSecret: "old-unreadable-secret",
    identity: { ...profile, email: "pm@external.test", hd: "external.test" },
  });
  assert.equal(f.response.headers.get("location"), "/?auth_error=domain");
  assert.equal(
    f.db.prepare("SELECT tokens FROM users WHERE id=?").get(profile.sub).tokens,
    f.originalCiphertext,
  );
  assert.equal((await (await f.get("/api/session")).json()).user, null);
});
