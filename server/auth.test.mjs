import test from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "./http.mjs";
import { createSupabaseAuth } from "./auth.mjs";
import { emptyState } from "./store.mjs";

const baseUser = {
  id: "33333333-3333-4333-8333-333333333333",
  email: "client@example.test",
  email_confirmed_at: "2026-11-18T12:00:00Z",
  user_metadata: { name: "Client", role: "manager" },
};
function fixture(user = baseUser, bootstrap = "") {
  const calls = [];
  const provisions = [];
  let profile = {
    id: user.id,
    email: user.email,
    displayName: "Client",
    role: "client",
    clientId: "44444444-4444-4444-8444-444444444444",
    agentId: null,
  };
  const store = {
    kind: "test",
    read: async () => emptyState(),
    profile: async () => profile,
    provision: async (user, role) => {
      provisions.push({ user, role });
      profile = { ...profile, role };
      return profile;
    },
  };
  const fetchImpl = async (url, options) => {
    const parsed = new URL(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({
      path: parsed.pathname,
      query: parsed.search,
      headers: options.headers,
      body,
    });
    if (parsed.pathname.endsWith("/token"))
      return Response.json({
        access_token: "valid-access",
        refresh_token: "valid-refresh",
        expires_in: 3600,
        user,
      });
    if (parsed.pathname.endsWith("/user")) {
      if (options.headers.Authorization !== "Bearer valid-access")
        return Response.json({ error: "invalid token" }, { status: 401 });
      return Response.json(user);
    }
    if (parsed.pathname.endsWith("/signup")) return Response.json({ user });
    if (parsed.pathname.endsWith("/logout"))
      return new Response(null, { status: 204 });
    return Response.json({});
  };
  const auth = createSupabaseAuth(
    () => store,
    {
      SUPABASE_URL: "https://project.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fake_for_test",
      BOOTSTRAP_MANAGER_EMAIL: bootstrap,
    },
    fetchImpl,
  );
  return {
    auth,
    calls,
    provisions,
    store,
    handle: createHandler(() => store, { auth }),
  };
}
async function session(handle) {
  const response = await handle(
    new Request("https://crm.example/api/auth/session"),
  );
  const data = await response.json();
  return {
    response,
    data,
    cookie: response.headers
      .getSetCookie()
      .map((item) => item.split(";")[0])
      .join("; "),
  };
}
function post(path, data, csrf) {
  return new Request(`https://crm.example/api/auth/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: csrf.cookie,
      "X-CSRF-Token": csrf.data.csrfToken,
    },
    body: JSON.stringify(data),
  });
}

test("password login sets secure HttpOnly cookies and never exposes session tokens in JSON", async () => {
  const f = fixture();
  const csrf = await session(f.handle);
  const response = await f.handle(
    post(
      "login",
      { email: baseUser.email, password: "example-password" },
      csrf,
    ),
  );
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.user.role, "client");
  assert.doesNotMatch(
    JSON.stringify(data),
    /valid-access|valid-refresh|sb_secret/,
  );
  assert.equal(response.headers.getSetCookie().length, 2);
  for (const cookie of response.headers.getSetCookie()) {
    assert.match(cookie, /^__Host-agency-/);
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /Secure/);
    assert.match(cookie, /SameSite=Lax/);
    assert.doesNotMatch(cookie, /Domain=/);
  }
  assert.equal(f.provisions[0].role, "client");
});

test("verified bootstrap email provisions manager, unverified email cannot bootstrap", async () => {
  const owner = { ...baseUser, email: "owner@example.test" };
  const f = fixture(owner, "owner@example.test");
  const response = await f.handle(
    post(
      "login",
      { email: owner.email, password: "example-password" },
      await session(f.handle),
    ),
  );
  assert.equal(response.status, 200);
  assert.equal((await response.json()).user.role, "manager");
  const pending = fixture(
    { ...owner, email_confirmed_at: null },
    "owner@example.test",
  );
  assert.equal(
    (
      await pending.handle(
        post(
          "login",
          { email: owner.email, password: "example-password" },
          await session(pending.handle),
        ),
      )
    ).status,
    403,
  );
  assert.equal(pending.provisions.length, 0);
});

test("public registration discards requested roles and does not create a privileged profile", async () => {
  const f = fixture();
  const response = await f.handle(
    post(
      "signup",
      {
        name: "New Client",
        email: "new@example.test",
        password: "example-password",
        role: "manager",
        app_metadata: { role: "manager" },
        agentId: "forged",
      },
      await session(f.handle),
    ),
  );
  assert.equal(response.status, 200);
  const call = f.calls.find((item) => item.path.endsWith("/signup"));
  assert.deepEqual(call.body.data, { name: "New Client" });
  assert.equal(call.body.role, undefined);
  assert.equal(call.body.app_metadata, undefined);
  assert.equal(f.provisions.length, 0);
});

test("every authenticated request validates upstream identity and uses database roles", async () => {
  const f = fixture();
  const actor = await f.auth.authenticate(
    new Request("https://crm.example/api/clients", {
      headers: { Cookie: "__Host-agency-access=valid-access" },
    }),
  );
  assert.equal(actor.role, "client");
  assert.equal(f.calls[0].headers.Authorization, "Bearer valid-access");
  await assert.rejects(
    f.auth.authenticate(
      new Request("https://crm.example/api/clients", {
        headers: { Cookie: "__Host-agency-access=forged-token" },
      }),
    ),
    { status: 401 },
  );
  assert.equal(
    await f.auth.authenticate(
      new Request("https://crm.example/api/clients"),
      true,
    ),
    null,
  );
});

test("refresh rotates session cookies; logout clears tokens and client storage", async () => {
  const f = fixture();
  const csrf = await session(f.handle);
  const request = post(
    "refresh",
    {},
    { ...csrf, cookie: csrf.cookie + "; __Host-agency-refresh=valid-refresh" },
  );
  const refresh = await f.handle(request);
  assert.equal(refresh.status, 200);
  assert.match(refresh.headers.getSetCookie().join(";"), /valid-refresh/);
  const logout = await f.handle(
    post(
      "logout",
      {},
      { ...csrf, cookie: csrf.cookie + "; __Host-agency-access=valid-access" },
    ),
  );
  assert.equal(logout.status, 200);
  assert.equal(logout.headers.getSetCookie().length, 3);
  assert.ok(
    logout.headers.getSetCookie().every((value) => value.includes("Max-Age=0")),
  );
  assert.equal(
    logout.headers.get("clear-site-data"),
    '"cookies", "storage", "cache"',
  );
});

test("login requires CSRF even without an existing session and passwords are validated", async () => {
  const f = fixture();
  const forged = new Request("https://crm.example/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: baseUser.email,
      password: "example-password",
    }),
  });
  assert.equal((await f.handle(forged)).status, 403);
  assert.equal(f.calls.length, 0);
  const csrf = await session(f.handle);
  assert.equal(
    (
      await f.handle(
        post("login", { email: baseUser.email, password: "" }, csrf),
      )
    ).status,
    400,
  );
  assert.equal(f.calls.length, 0);
});
