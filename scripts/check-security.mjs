import { readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { setTimeout } from "node:timers/promises";
import { createSecurityAuth } from "../server/security-auth.mjs";
import { createHandler } from "../server/http.mjs";
import { adaptLegacyData } from "../server/import.mjs";

// This integration check sends generated local/CI credentials only to loopback.
// It never connects to the production Supabase project.
const config = JSON.parse(
  await readFile(
    new URL("../.local/security-config.json", import.meta.url),
    "utf8",
  ),
);
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    const response = await fetch("http://127.0.0.1:5252/health", {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      ready = true;
      break;
    }
  } catch {
    /* Wait for the local container's migrations and bootstrap. */
  }
  await setTimeout(500);
}
assert.ok(ready, "Local Security did not become healthy");
const state = adaptLegacyData(
  JSON.parse(
    await readFile(
      new URL("../RealEstateAgency/agency_data.json", import.meta.url),
      "utf8",
    ),
  ),
);
const profiles = new Map();
const store = {
  kind: "isolated-check",
  read: async () => structuredClone(state),
  profile: async (id) => profiles.get(id),
  provision: async (user, role) => {
    const value = {
      id: user.id,
      email: user.email,
      displayName: user.email,
      role,
      agentId: null,
      clientId: null,
    };
    profiles.set(user.id, value);
    return value;
  },
};
const auth = createSecurityAuth(() => store, {
  SECURITY_AUTH_URL: "http://127.0.0.1:5252",
  SECURITY_JWT_KEY: config.Jwt__Key,
  SECURITY_JWT_ISSUER: config.Jwt__Issuer,
  SECURITY_JWT_AUDIENCE: config.Jwt__Audience,
  BOOTSTRAP_MANAGER_USERNAME: config.BootstrapAdmin__Username,
});
const handle = createHandler(() => store, { auth });
const initial = await handle(
  new Request("http://127.0.0.1:8890/api/auth/session"),
);
const csrf = await initial.json();
let cookie = initial.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");
const login = await handle(
  new Request("http://127.0.0.1:8890/api/auth/login", {
    method: "POST",
    headers: {
      Cookie: cookie,
      "X-CSRF-Token": csrf.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: config.BootstrapAdmin__Username,
      password: config.BootstrapAdmin__Password,
    }),
  }),
);
const result = await login.json();
assert.equal(login.status, 200, "Actual Security login failed");
assert.equal(result.user.role, "manager");
assert.equal(result.access_token, undefined);
cookie +=
  "; " +
  login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
const properties = await handle(
  new Request("http://127.0.0.1:8890/api/properties", {
    headers: { Cookie: cookie },
  }),
);
assert.equal(properties.status, 200);
assert.equal((await properties.json()).length, 12);
const previousPath = new URL(
  "../.local/security-check-result.json",
  import.meta.url,
);
if (process.argv.includes("--expect-same-user")) {
  const previous = JSON.parse(await readFile(previousPath, "utf8"));
  assert.equal(
    result.user.id,
    previous.userId,
    "The account changed after a server restart",
  );
}
await writeFile(
  previousPath,
  JSON.stringify({ userId: result.user.id }),
  "utf8",
);
console.log(
  "PASS: real Security login, verified JWT, manager profile and authenticated catalog; production database untouched.",
);
