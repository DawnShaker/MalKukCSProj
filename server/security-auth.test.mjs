import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { SignJWT } from "jose";
import { createSecurityAuth } from "./security-auth.mjs";
import { createConfiguredAuth } from "./auth-provider.mjs";
import { createHandler } from "./http.mjs";
import { emptyState } from "./store.mjs";

const nameClaim = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";
const roleClaim =
  "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
const id = "12345678-1234-4234-8234-123456789012";
const secret = randomBytes(48).toString("base64url");
const env = {
  AUTH_PROVIDER: "security",
  SECURITY_AUTH_URL: "https://security.example.test",
  SECURITY_JWT_KEY: secret,
  SECURITY_JWT_ISSUER: "test-issuer",
  SECURITY_JWT_AUDIENCE: "test-audience",
  BOOTSTRAP_MANAGER_USERNAME: "owner",
};
async function token(overrides = {}, key = secret, algorithm = "HS256") {
  return new SignJWT({
    Id: id,
    [nameClaim]: "owner",
    [roleClaim]: "Client",
    iss: env.SECURITY_JWT_ISSUER,
    aud: env.SECURITY_JWT_AUDIENCE,
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...overrides,
  })
    .setProtectedHeader({ alg: algorithm })
    .sign(new TextEncoder().encode(key));
}
async function fixture(claims = {}, settings = env) {
  const calls = [],
    provisions = [];
  let profile;
  let issued = await token(claims);
  let upstreamStatus = 200;
  const store = {
    kind: "test",
    read: async () => emptyState(),
    profile: async (queried) => (queried === profile?.id ? profile : null),
    provision: async (user, role) => {
      provisions.push({ user, role });
      profile = {
        id: user.id,
        email: user.email,
        displayName: user.email,
        role,
        clientId: role === "client" ? id : null,
        agentId: null,
      };
      return profile;
    },
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url: url.toString(), ...options });
    if (upstreamStatus !== 200)
      return new Response("private upstream diagnostics", {
        status: upstreamStatus,
      });
    return Response.json({ token: issued, role: "Admin" }); // The unsigned role field is deliberately misleading.
  };
  const auth = createSecurityAuth(() => store, settings, fetchImpl);
  const handle = createHandler(() => store, { auth });
  return {
    auth,
    store,
    handle,
    calls,
    provisions,
    setToken: (value) => {
      issued = value;
    },
    setStatus: (value) => {
      upstreamStatus = value;
    },
    setRole: (value) => {
      profile.role = value;
    },
  };
}
function authenticated(access) {
  return new Request("https://crm.example.test/api/properties", {
    headers: { Cookie: `__Host-agency-access=${access}` },
  });
}
async function session(handle) {
  const response = await handle(
    new Request("https://crm.example.test/api/auth/session"),
  );
  const data = await response.json();
  return {
    data,
    cookie: response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  };
}
function post(path, csrf, body) {
  return new Request(`https://crm.example.test/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: csrf.cookie,
      "X-CSRF-Token": csrf.data.csrfToken,
    },
    body: JSON.stringify(body),
  });
}

test("Security contract logs in with username and keeps JWT only in a secure cookie", async () => {
  const f = await fixture();
  const csrf = await session(f.handle);
  assert.deepEqual(csrf.data.auth, {
    identifier: "username",
    signup: false,
    recovery: false,
    refresh: false,
  });
  const response = await f.handle(
    post("login", csrf, {
      username: "owner",
      password: "test-password",
      role: "manager",
    }),
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.user.role, "client"); // Neither form role nor response.role grants manager.
  assert.equal(data.token, undefined);
  assert.equal(data.session, undefined);
  assert.equal(data.access_token, undefined);
  const cookie = response.headers.getSetCookie();
  assert.match(cookie[0], /^__Host-agency-access=ey/);
  assert.match(cookie[0], /HttpOnly; SameSite=Lax; Max-Age=\d+; Secure/);
  assert.match(cookie[1], /^__Host-agency-refresh=;.*Max-Age=0/);
  assert.equal(f.calls[0].url, "https://security.example.test/api/Users/login");
  assert.deepEqual(JSON.parse(f.calls[0].body), {
    username: "owner",
    password: "test-password",
  });
  assert.equal(f.calls[0].redirect, "error");
  assert.ok(!JSON.stringify(data).includes(secret));
});

test("Security rejects expired, forged, wrong-algorithm and wrong-audience identities before provisioning", async () => {
  const f = await fixture();
  const invalid = [
    await token({ exp: Math.floor(Date.now() / 1000) - 1 }),
    await token({ aud: "another-app" }),
    await token({ iss: "another-issuer" }),
    await token({ exp: undefined }),
    await token({ Id: "invalid-id" }),
    await token({ [nameClaim]: "another-user" }),
    await token({}, randomBytes(48).toString("hex")),
    await token({}, secret, "HS384"),
    "eyJhbGciOiJub25lIn0.e30.",
  ];
  for (const value of invalid) {
    f.setToken(value);
    await assert.rejects(
      f.auth.login({ username: "owner", password: "password" }),
      { status: 401 },
    );
  }
  assert.equal(f.provisions.length, 0);
});

test("Security only bootstraps the configured signed Admin identity, with a namespaced stable ID", async () => {
  const f = await fixture({ [roleClaim]: "Admin" });
  const first = await f.auth.login({ username: "OWNER", password: "password" });
  assert.equal(first.user.role, "manager");
  assert.notEqual(first.user.id, id);
  assert.match(first.user.id, /^[0-9a-f-]{36}$/);
  const fresh = createSecurityAuth(() => f.store, env);
  assert.equal(
    (await fresh.authenticate(authenticated(first.session.access_token))).id,
    first.user.id,
  );
  f.setRole("client");
  assert.equal(
    (await fresh.authenticate(authenticated(first.session.access_token))).role,
    "client",
  );
  const unrelated = await fixture(
    { [roleClaim]: "Admin" },
    { ...env, BOOTSTRAP_MANAGER_USERNAME: "other-owner" },
  );
  assert.equal(
    (await unrelated.auth.login({ username: "owner", password: "password" }))
      .user.role,
    "client",
  );
});

test("Security expires an established cookie and never uses unsigned JWT payloads for authorization", async () => {
  const f = await fixture();
  await f.auth.login({ username: "owner", password: "password" });
  const expired = authenticated(
    await token({ exp: Math.floor(Date.now() / 1000) - 10 }),
  );
  await assert.rejects(f.auth.authenticate(expired), { status: 401 });
  assert.equal(await f.auth.authenticate(expired, true), null);
  const forged = authenticated(
    await token({ [roleClaim]: "Admin" }, randomBytes(48).toString("hex")),
  );
  assert.equal((await f.handle(forged)).status, 401);
  const missing = await fixture({}, { ...env, SECURITY_JWT_KEY: "" });
  await assert.rejects(missing.auth.authenticate(forged, true), {
    status: 503,
  });
});

test("Security disables unsupported public signup, recovery and refresh while logout clears cookies", async () => {
  const f = await fixture();
  const csrf = await session(f.handle);
  for (const action of ["signup", "recover", "reset"])
    assert.equal((await f.handle(post(action, csrf, {}))).status, 405);
  assert.equal((await f.handle(post("refresh", csrf, {}))).status, 401);
  const logout = await f.handle(post("logout", csrf, {}));
  assert.equal(logout.status, 200);
  assert.equal(logout.headers.getSetCookie().length, 3);
  assert.equal(f.calls.length, 0);
  const stale = await f.handle(
    new Request("https://crm.example.test/api/auth/session", {
      headers: { Cookie: "__Host-agency-refresh=old-supabase-session" },
    }),
  );
  assert.equal((await stale.json()).needsRefresh, false);
});

test("Security fails closed on bad configuration and hides upstream diagnostics", async () => {
  for (const extra of [
    { SECURITY_AUTH_URL: "http://remote.example.test" },
    { SECURITY_AUTH_URL: "https://user:password@example.test" },
    { SECURITY_AUTH_URL: "https://example.test/path" },
    { SECURITY_JWT_KEY: "short" },
    { SECURITY_JWT_ISSUER: "" },
    { SECURITY_JWT_AUDIENCE: "" },
    { SECURITY_AUTH_URL: "http://localhost:5252", NODE_ENV: "production" },
  ]) {
    const f = await fixture({}, { ...env, ...extra });
    await assert.rejects(
      f.auth.login({ username: "owner", password: "password" }),
      { status: 503 },
    );
    assert.equal(f.calls.length, 0);
  }
  const f = await fixture();
  const csrf = await session(f.handle);
  for (const [upstream, expected] of [
    [404, 401],
    [400, 401],
    [500, 503],
    [429, 429],
  ]) {
    f.setStatus(upstream);
    const response = await f.handle(
      post("login", csrf, { username: "owner", password: "password" }),
    );
    assert.equal(response.status, expected);
    assert.ok(
      !(await response.text()).includes("private upstream diagnostics"),
    );
  }
  const badProvider = createConfiguredAuth(() => f.store, {
    AUTH_PROVIDER: "typo",
  });
  await assert.rejects(badProvider.authenticate(authenticated("anything")), {
    status: 503,
  });
});
