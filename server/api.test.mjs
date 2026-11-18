import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHandler } from "./http.mjs";
import { createSupabaseStore, emptyState, normalizeState } from "./store.mjs";
import { createLocalStore } from "./local-store.mjs";
import deployedHandler from "../netlify/functions/api.mjs";
import { client, memoryStore, manager } from "./test-support.mjs";

const propertyDto = {
  type: "Квартира",
  address: "вул. Соборності, 14",
  district: "Центр",
  landmark: "парк",
  area: 50,
  rooms: 2,
  yearBuilt: 2020,
  price: 50000,
  status: 1,
};
async function setupDeal(api, status = 1) {
  const {
    data: { property },
  } = await api("/properties", "POST", { ...propertyDto, status });
  const { data: customer } = await api("/clients", "POST", {
    name: "Клієнт",
    contactInfo: "contact",
    type: 1,
  });
  const { data: agent } = await api("/agents", "POST", {
    name: "Рієлтор",
    experienceYears: 5,
  });
  const dto = {
    propertyId: property.id,
    clientId: customer.id,
    agentId: agent.id,
    price: 50000,
    dealType: status === 2 ? 2 : 1,
    commission: 5,
  };
  return { property, customer, agent, dto };
}

test("C# data loads without changing IDs, histories or baseline financial results", async () => {
  const source = JSON.parse(
    await readFile(
      new URL("../RealEstateAgency/agency_data.json", import.meta.url),
      "utf8",
    ),
  );
  const state = normalizeState(source);
  const api = client(memoryStore(state));
  const properties = (await api("/properties")).data;
  assert.equal(properties.length, 12);
  assert.equal(properties[0].id, source.Properties[0].Id);
  assert.equal(
    properties[0].statusHistory.length,
    source.Properties[0].StatusHistory.length,
  );
  const { data } = await api("/analytics");
  assert.equal(data.dealsCount, 2);
  assert.equal(data.totalSales, 485000);
  assert.equal(data.totalProfit, 26000);
  // Legacy role 2 remains unchanged; new owners use the distinct value 3.
  assert.equal(data.ownersCount, 0);
  assert.equal(data.tenantsCount, 1);
});

test("property edits persist histories, combined filters include address", async () => {
  const api = client();
  const {
    data: { property },
  } = await api("/properties", "POST", propertyDto);
  assert.equal(
    (
      await api("/properties/search", "POST", {
        address: "СОБОРНОСТІ",
        minArea: 40,
        maxPrice: 55000,
      })
    ).data.length,
    1,
  );
  assert.equal(
    (await api("/properties/search", "POST", { address: "Набережна" })).data
      .length,
    0,
  );
  assert.equal(
    (
      await api(`/properties/${property.id}`, "PUT", {
        ...propertyDto,
        price: 60000,
        status: 3,
      })
    ).status,
    200,
  );
  const saved = (await api("/properties")).data[0];
  assert.equal(saved.price, 60000);
  assert.equal(saved.priceHistory.at(-1).oldPrice, 50000);
  assert.equal(saved.statusHistory.at(-1).newStatus, 3);
  assert.equal((await api(`/properties/${property.id}`, "DELETE")).status, 200);
  assert.deepEqual((await api("/properties")).data, []);
});

test("validation and failed writes leave persistent data untouched", async () => {
  const api = client();
  for (const invalid of [
    { area: 0 },
    { rooms: 1.5 },
    { price: -1 },
    { yearBuilt: 1600 },
    { status: 99 },
  ]) {
    assert.equal(
      (await api("/properties", "POST", { ...propertyDto, ...invalid })).status,
      400,
    );
  }
  assert.equal(
    (await api("/properties/search", "POST", { minPrice: 100, maxPrice: 10 }))
      .status,
    400,
  );
  assert.equal((await api("/analytics?startDate=2026-02-30")).status, 400);
  assert.deepEqual((await api("/properties")).data, []);
  const {
    data: { property },
  } = await api("/properties", "POST", { ...propertyDto, status: 4 });
  assert.equal(
    (
      await api(`/properties/${property.id}`, "PUT", {
        ...propertyDto,
        price: 10,
      })
    ).status,
    400,
  );
  assert.equal((await api("/properties")).data[0].price, 50000);
});

test("deals update status and commission atomically, protect related records, cancel correctly", async () => {
  for (const status of [1, 2]) {
    const api = client();
    const { property, customer, agent, dto } = await setupDeal(api, status);
    const { data: deal, status: created } = await api("/deals", "POST", dto);
    assert.equal(created, 200);
    assert.equal((await api("/properties")).data[0].status, 4);
    assert.equal((await api("/analytics")).data.totalProfit, 2500);
    assert.equal((await api("/deals", "POST", dto)).status, 400);
    for (const [resource, id] of [
      ["properties", property.id],
      ["clients", customer.id],
      ["agents", agent.id],
    ]) {
      assert.equal((await api(`/${resource}/${id}`, "DELETE")).status, 400);
    }
    assert.equal(
      (
        await api(
          `/deals/${deal.id}?reason=${encodeURIComponent("За згодою + сторін")}`,
          "DELETE",
        )
      ).status,
      200,
    );
    const saved = (await api("/properties")).data[0];
    assert.equal(saved.status, status);
    assert.match(saved.statusHistory.at(-1).comment, /За згодою \+ сторін/);
    assert.deepEqual((await api("/deals")).data, []);
    assert.equal((await api("/analytics")).data.totalProfit, 0);
  }
});

test("failed deal commission does not sell the property or create a deal", async () => {
  const api = client();
  const { dto } = await setupDeal(api);
  assert.equal(
    (await api("/deals", "POST", { ...dto, commission: 101 })).status,
    400,
  );
  assert.equal((await api("/properties")).data[0].status, 1);
  assert.deepEqual((await api("/deals")).data, []);
});

test("saved searches retain the last ten and matching properties produce notifications", async () => {
  const api = client();
  const { data: customer } = await api("/clients", "POST", {
    name: "Покупець",
    contactInfo: "contact",
    type: 1,
  });
  for (let i = 0; i < 12; i++) {
    assert.equal(
      (
        await api(`/clients/${customer.id}/searches`, "POST", {
          title: `Пошук ${i}`,
          filter: { district: "центр" },
        })
      ).status,
      200,
    );
  }
  const searches = (await api(`/clients/${customer.id}/searches`)).data;
  assert.equal(searches.length, 10);
  assert.equal(searches[0].title, "Пошук 11");
  assert.equal(searches.at(-1).title, "Пошук 2");
  assert.equal(
    (await api("/properties", "POST", propertyDto)).data.notifications.length,
    1,
  );
  assert.equal(
    (await api(`/clients/${customer.id}/notifications`)).data.length,
    1,
  );
  assert.equal((await api(`/clients/${customer.id}/matches`)).data.length, 1);
});

test("client requests appear in the profile, match properties and are cleaned up on deletion", async () => {
  const api = client();
  const { data: owner } = await api("/clients", "POST", {
    name: "Власник",
    contactInfo: "contact",
    type: 3,
  });
  await api("/properties", "POST", propertyDto);
  const { status, data: request } = await api(
    `/clients/${owner.id}/requests`,
    "POST",
    { title: "Пошук квартири", filter: { rooms: 2 } },
  );
  assert.equal(status, 200);
  assert.equal((await api("/clients")).data[0].requests[0].id, request.id);
  assert.equal((await api(`/requests/${request.id}/matches`)).data.length, 1);
  assert.equal((await api("/analytics")).data.ownersCount, 1);
  assert.equal((await api("/analytics")).data.totalRequests, 1);
  await api(`/clients/${owner.id}`, "DELETE");
  assert.equal((await api("/analytics")).data.totalRequests, 0);
});

test("analytics date filters include the entire end day in Kyiv time", async () => {
  const state = emptyState();
  state.deals = [
    { date: "2026-03-01T21:00:00Z", totalCost: 100, commissionPercent: 10 },
    { date: "2026-03-01T23:00:00Z", totalCost: 200, commissionPercent: 10 },
  ];
  const { data } = await client(memoryStore(state))(
    "/analytics?startDate=2026-03-01&endDate=2026-03-01",
  );
  assert.equal(data.dealsCount, 1);
  assert.equal(data.totalSales, 100);
  assert.equal(data.priceDynamics[0].dealsCount, 1);
});

test("API errors are JSON, uncacheable and reject cross-origin requests", async () => {
  const api = client();
  const unknown = await api("/missing");
  assert.equal(unknown.status, 404);
  assert.equal(unknown.headers.get("cache-control"), "no-store");
  assert.match(unknown.headers.get("content-type"), /application\/json/);
  assert.equal(
    (
      await api("/properties", "GET", undefined, {
        Origin: "https://attacker.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await api("/properties", "GET", undefined, {
        "Sec-Fetch-Site": "cross-site",
      })
    ).status,
    403,
  );
  assert.equal((await api("/properties", "POST", null)).status, 400);
  assert.equal((await api("/properties/missing", "DELETE")).status, 404);
});

test("Netlify rewrite paths resolve identically to /api routes", async () => {
  const handle = createHandler(() => memoryStore(), {
    authenticate: async () => manager,
  });
  const response = await handle(
    new Request("https://crm.example/.netlify/functions/api/properties"),
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test("deployed function fails closed with missing database configuration", async () => {
  const names = [
    "SUPABASE_URL",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ];
  const previous = names.map((name) => process.env[name]);
  try {
    names.forEach((name) => delete process.env[name]);
    const response = await deployedHandler(
      new Request("https://crm.example/api/health"),
    );
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Supabase/);
  } finally {
    names.forEach((name, i) =>
      previous[i] === undefined
        ? delete process.env[name]
        : (process.env[name] = previous[i]),
    );
  }
});

function mockDatabase({ conflict = false, alwaysConflict = false } = {}) {
  let row = { data: emptyState(), version: 0 };
  const calls = [];
  return {
    calls,
    get row() {
      return structuredClone(row);
    },
    async fetch(url, options) {
      calls.push({ url: new URL(url), ...options });
      if (new URL(url).pathname.endsWith("/agency_read_snapshot"))
        return Response.json(structuredClone(row));
      if (conflict || alwaysConflict) {
        conflict = false;
        row.data.agents.push({
          id: "other-agent",
          name: "Concurrent user",
          experienceYears: 3,
        });
        row.version++;
        return Response.json(false);
      }
      const body = JSON.parse(options.body);
      if (row.version !== body.p_expected_version) return Response.json(false);
      row = { data: body.p_data, version: row.version + 1 };
      return Response.json(true);
    },
  };
}
const env = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SECRET_KEY: "sb_secret_fake_for_test",
};

test("Supabase conflict retries preserve the other writer and survive a cold start", async () => {
  const db = mockDatabase({ conflict: true });
  await createSupabaseStore(env, db.fetch).mutate((s) =>
    s.clients.push({ id: "client", name: "Client" }),
  );
  const state = await createSupabaseStore(env, db.fetch).read();
  assert.equal(state.clients.length, 1);
  assert.equal(state.agents.length, 1);
  assert.equal(db.row.version, 2);
  assert.equal(db.calls[0].headers.apikey, env.SUPABASE_SECRET_KEY);
  assert.equal(db.calls[0].headers.Authorization, undefined);
});

test("parallel Supabase writes do not lose records", async () => {
  const db = mockDatabase();
  await Promise.all(
    ["first", "second"].map((id) =>
      createSupabaseStore(env, db.fetch).mutate((s) => s.clients.push({ id })),
    ),
  );
  assert.deepEqual(db.row.data.clients.map((c) => c.id).toSorted(), [
    "first",
    "second",
  ]);
});

test("repeated conflicts return 409 instead of overwriting state", async () => {
  const db = mockDatabase({ alwaysConflict: true });
  await assert.rejects(
    createSupabaseStore(env, db.fetch).mutate((s) =>
      s.clients.push({ id: "lost" }),
    ),
    { status: 409 },
  );
  assert.equal(db.row.data.clients.length, 0);
});

test("Supabase secrets and upstream database error bodies stay out of client errors", async () => {
  const store = createSupabaseStore(
    env,
    async () => new Response("sensitive SQL and secret", { status: 401 }),
  );
  const response = await client(store)("/properties");
  assert.equal(response.status, 503);
  assert.doesNotMatch(
    JSON.stringify(response.data),
    /sensitive SQL|sb_secret_fake_for_test/,
  );
});

test("legacy service_role keys use JWT authorization; invalid and missing configuration is rejected", async () => {
  const db = mockDatabase();
  await createSupabaseStore(
    {
      SUPABASE_URL: env.SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: "eyJ.test.jwt",
    },
    db.fetch,
  ).read();
  assert.equal(db.calls[0].headers.Authorization, "Bearer eyJ.test.jwt");
  assert.throws(() => createSupabaseStore({}), { status: 503 });
  assert.throws(
    () =>
      createSupabaseStore({
        ...env,
        SUPABASE_URL: "http://project.supabase.co",
      }),
    { status: 503 },
  );
});

test("local writes persist across store instances and serialize concurrent modifications", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "agency-store-test-"));
  t.after(async () => {
    assert.ok(directory.startsWith(join(tmpdir(), "agency-store-test-")));
    await rm(directory, { recursive: true, force: true });
  });
  const file = join(directory, "data.json");
  const store = createLocalStore(file);
  await Promise.all(
    ["first", "second"].map((id) => store.mutate((s) => s.agents.push({ id }))),
  );
  await assert.rejects(
    store.mutate((s) => {
      s.agents.push({ id: "failed" });
      throw new Error("abort");
    }),
  );
  assert.equal((await createLocalStore(file).read()).agents.length, 2);
});
