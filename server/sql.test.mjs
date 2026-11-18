import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { adaptLegacyData, mergeImport } from "./import.mjs";

const migration = await readFile(
  new URL(
    "../supabase/migrations/202611180001_relational_accounts.sql",
    import.meta.url,
  ),
  "utf8",
);
const legacy = JSON.parse(
  await readFile(
    new URL("../RealEstateAgency/agency_data.json", import.meta.url),
    "utf8",
  ),
);
async function database(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  await db.exec(migration);
  return db;
}
async function snapshot(db) {
  return (await db.query("select agency_read_snapshot() as snapshot")).rows[0]
    .snapshot;
}
async function save(db, state, version) {
  return (
    await db.query("select agency_save_snapshot($1,$2::jsonb) as saved", [
      version,
      JSON.stringify(state),
    ])
  ).rows[0].saved;
}

test("PostgreSQL migration imports the file into relational rows and round-trips histories", async (t) => {
  const db = await database(t);
  const state = adaptLegacyData(legacy);
  assert.equal(await save(db, state, 0), true);
  const loaded = await snapshot(db);
  assert.equal(loaded.version, 1);
  assert.equal(loaded.data.properties.length, 12);
  assert.equal(loaded.data.clients.length, 3);
  assert.equal(loaded.data.deals.length, 2);
  assert.equal(
    (
      await db.query(
        "select count(*)::int as count from property_status_history",
      )
    ).rows[0].count,
    state.properties.reduce((n, p) => n + p.statusHistory.length, 0),
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int as count from property_price_history",
      )
    ).rows[0].count,
    state.properties.reduce((n, p) => n + p.priceHistory.length, 0),
  );
  const first = loaded.data.properties.find(
    (p) => p.id === state.properties[0].id,
  );
  assert.equal(
    first.priceHistory[0].oldPrice,
    state.properties[0].priceHistory[0].oldPrice,
  );
  assert.equal(
    loaded.data.clients.find((c) => c.id === state.clients[0].id).notifications
      .length,
    state.clients[0].notifications.length,
  );
  await db.exec(migration);
  assert.equal((await snapshot(db)).version, 1);
});

test("PostgreSQL transactions reject lost updates and roll back broken foreign keys", async (t) => {
  const db = await database(t);
  const state = adaptLegacyData(legacy);
  await save(db, state, 0);
  assert.equal(await save(db, state, 0), false);
  const before = await snapshot(db);
  const broken = structuredClone(before.data);
  broken.deals[0].clientId = "00000000-0000-0000-0000-000000000000";
  await assert.rejects(
    save(db, broken, before.version),
    (error) => error.code === "23503",
  );
  const after = await snapshot(db);
  assert.deepEqual(after, before);
});

test("legacy cloud JSON is copied once while the original backup is retained", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls; create table agency_state(id text primary key, data jsonb, version bigint);",
  );
  const state = adaptLegacyData(legacy);
  await db.query("insert into agency_state values ($1,$2::jsonb,7)", [
    "main",
    JSON.stringify(state),
  ]);
  await db.exec(migration);
  assert.equal((await snapshot(db)).data.properties.length, 12);
  assert.equal(
    (await db.query("select version from agency_state")).rows[0].version,
    7,
  );
  await db.exec(migration);
  assert.equal((await snapshot(db)).version, 1);
});

test("database profiles cannot lose the last manager and public roles cannot use admin RPCs", async (t) => {
  const db = await database(t);
  const manager = "11111111-1111-4111-8111-111111111111";
  const client = "22222222-2222-4222-8222-222222222222";
  await db.query("select agency_provision_profile($1,$2,$3,$4)", [
    manager,
    "manager@example.test",
    "Manager",
    "manager",
  ]);
  await db.query("select agency_provision_profile($1,$2,$3,$4)", [
    client,
    "client@example.test",
    "Client",
    "client",
  ]);
  const clientId = (
    await db.query('select "clientId" from user_profiles where id=$1', [client])
  ).rows[0].clientId;
  await assert.rejects(
    db.query("select agency_assign_role($1,$2,$3,null,$4)", [
      manager,
      manager,
      "client",
      clientId,
    ]),
  );
  await assert.rejects(
    db.query("select agency_assign_role($1,$2,$3,null,null)", [
      client,
      client,
      "manager",
    ]),
    (error) => error.code === "42501",
  );
  const permission = (
    await db.query(
      "select has_function_privilege('anon','public.agency_save_snapshot(bigint,jsonb)','execute') as allowed",
    )
  ).rows[0].allowed;
  assert.equal(permission, false);
  await db.exec("set role authenticated;");
  await assert.rejects(
    db.query("select * from properties"),
    (error) => error.code === "42501",
  );
  await db.exec("reset role;");
});

test("import is repeatable and preserves edits and cloud records", () => {
  const imported = adaptLegacyData(legacy);
  const state = structuredClone(imported);
  state.properties[0].price = 12345;
  const first = mergeImport(state, imported);
  assert.equal(first.added.properties, 0);
  assert.equal(state.properties[0].price, 12345);
  assert.equal(state.properties.length, 12);
  assert.deepEqual(mergeImport(state, imported), first);
});

test("the one-file SQL setup imports the entire fixture and is safe to repeat", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(
    "create role anon; create role authenticated; create role service_role bypassrls;",
  );
  const setup = await readFile(
    new URL("../supabase/setup.sql", import.meta.url),
    "utf8",
  );
  await db.exec(setup);
  const before = await snapshot(db);
  assert.equal(before.data.properties.length, 12);
  assert.equal(before.data.clients.length, 3);
  assert.equal(before.data.agents.length, 3);
  assert.equal(before.data.deals.length, 2);
  await db.exec(setup);
  assert.deepEqual(await snapshot(db), before);
});
