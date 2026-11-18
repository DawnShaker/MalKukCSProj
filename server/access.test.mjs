import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { adaptLegacyData } from "./import.mjs";
import { client, memoryStore, manager } from "./test-support.mjs";
import { createHandler } from "./http.mjs";
const source = adaptLegacyData(
  JSON.parse(
    await readFile(
      new URL("../RealEstateAgency/agency_data.json", import.meta.url),
      "utf8",
    ),
  ),
);

test("agents only see their assigned records and cannot mutate another agent’s property", async () => {
  const state = structuredClone(source);
  state.properties[2].agentId = state.agents[1].id;
  const store = memoryStore(state);
  const actor = {
    id: randomUUID(),
    role: "agent",
    agentId: state.agents[0].id,
  };
  const api = client(store, actor);
  const properties = await api("/properties");
  assert.ok(properties.data.length > 0);
  assert.ok(properties.data.every((row) => row.agentId === actor.agentId));
  assert.equal(
    (await api(`/properties/${state.properties[2].id}`, "DELETE")).status,
    404,
  );
  assert.equal((await api("/analytics")).status, 403);
  assert.equal((await api("/reports")).status, 403);
  assert.equal((await api("/users")).status, 403);
  assert.equal(
    (await api("/agents", "POST", { name: "Escalation", experienceYears: 1 }))
      .status,
    403,
  );
  const body = {
    type: "Офіс",
    address: "Test",
    district: "Test",
    landmark: "Test",
    area: 40,
    rooms: 1,
    yearBuilt: 2020,
    price: 40000,
    status: 1,
    agentId: state.agents[1].id,
  };
  assert.equal((await api("/properties", "POST", body)).status, 403);
  delete body.agentId;
  const added = await api("/properties", "POST", body);
  assert.equal(added.status, 200);
  assert.equal(added.data.property.agentId, actor.agentId);
});

test("clients cannot enumerate other clients, edit property or grant themselves manager access", async () => {
  const store = memoryStore(source);
  const actor = {
    id: randomUUID(),
    role: "client",
    clientId: source.clients[0].id,
  };
  const api = client(store, actor);
  assert.deepEqual(
    (await api("/clients")).data.map((c) => c.id),
    [actor.clientId],
  );
  assert.ok(
    (await api("/properties")).data.every((p) => [1, 2].includes(p.status)),
  );
  assert.equal(
    (
      await api(`/clients/${source.clients[1].id}/searches`, "POST", {
        title: "stolen",
        filter: {},
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await api(`/properties/${source.properties[2].id}/status`, "PATCH", {
        newStatus: 4,
      })
    ).status,
    403,
  );
  assert.equal((await api("/deals")).status, 403);
  assert.equal((await api("/agents")).status, 403);
  assert.equal(
    (await api(`/users/${actor.id}`, "PATCH", { role: "manager" })).status,
    403,
  );
  assert.equal(
    (
      await api(`/clients/${actor.clientId}/requests`, "POST", {
        title: "My request",
        filter: { rooms: 1 },
      })
    ).status,
    200,
  );
  assert.equal(
    (await api("/properties/search", "POST", { district: "Центр" })).status,
    200,
  );
  const history = (await api(`/clients/${actor.clientId}/history`)).data;
  assert.equal(history.length, 1);
  assert.equal(history[0].clientId, actor.clientId);
  assert.equal(
    (await api(`/clients/${source.clients[1].id}/history`)).status,
    404,
  );
});

test("manager CSV report protects against spreadsheet formulas and applies dates", async () => {
  const state = structuredClone(source);
  const target = state.clients.find((c) => c.id === state.deals[0].clientId);
  target.name = '=HYPERLINK("https://example.test")';
  const api = client(memoryStore(state), manager);
  const report = await api("/reports?startDate=2026-11-01&endDate=2026-11-30");
  assert.equal(report.status, 200);
  assert.match(report.headers.get("content-type"), /text\/csv/);
  assert.match(report.data, /'=HYPERLINK/);
  assert.equal((await api("/reports?startDate=2026-02-30")).status, 400);
});

test("CSRF rejects forged, missing and non-ASCII values before mutating", async () => {
  const store = memoryStore();
  const handle = createHandler(() => store, {
    authenticate: async () => manager,
  });
  for (const [cookie, token] of [
    [null, null],
    ["a".repeat(64), "b".repeat(64)],
    ["é".repeat(64), "a".repeat(64)],
  ]) {
    const response = await handle(
      new Request("https://crm.example/api/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cookie ? { Cookie: `__Host-agency-csrf=${cookie}` } : {}),
          ...(token ? { "X-CSRF-Token": token } : {}),
        },
        body: JSON.stringify({ name: "Test", experienceYears: 1 }),
      }),
    );
    assert.equal(response.status, 403);
  }
  assert.equal((await store.read()).agents.length, 0);
});

test("default HTTP handler never authenticates an unconfigured production request", async () => {
  const handle = createHandler(() => memoryStore(source));
  assert.equal(
    (await handle(new Request("https://crm.example/api/clients"))).status,
    401,
  );
});

test("reassignment cannot make an agent's existing deal mutate someone else's property",async()=>{
  const state=structuredClone(source);
  const property=state.properties.find(row=>row.id===state.deals[0].propertyId);
  const api=client(memoryStore(state),manager);
  const response=await api(`/properties/${property.id}`,'PUT',{...property,agentId:state.agents[1].id});
  assert.equal(response.status,400);
  const retained=(await api('/properties')).data.find(row=>row.id===property.id);
  assert.equal(retained.agentId,property.agentId);
});
