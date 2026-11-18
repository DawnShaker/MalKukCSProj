import { createHash } from "node:crypto";
import { emptyState, normalizeState } from "./store.mjs";

const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function stableId(value) {
  const hex = createHash("md5").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function adaptLegacyData(value) {
  const state = normalizeState(structuredClone(value));
  const requests = new Map(state.requests.map((row) => [row.id, row]));
  for (const client of state.clients) {
    for (const request of client.requests)
      requests.set(request.id, { ...request, clientId: client.id });
  }
  state.requests = [...requests.values()];
  const byAgent = (id) => [
    ...new Set(
      state.deals
        .filter((row) => row.clientId === id)
        .map((row) => row.agentId),
    ),
  ];
  for (const client of state.clients) {
    const agents = byAgent(client.id);
    client.agentId ??= agents.length === 1 ? agents[0] : null;
    client.requests = state.requests.filter(
      (row) => row.clientId === client.id,
    );
    client.savedSearches.forEach((row, index) => {
      row.id ||= stableId(`${client.id}:savedSearches:${index}`);
      row.clientId = client.id;
      row.filter ??= {};
    });
  }
  for (const property of state.properties) {
    property.agentId ??=
      state.deals.find((row) => row.propertyId === property.id)?.agentId ??
      null;
    for (const key of ["statusHistory", "priceHistory"])
      property[key].forEach((row, index) => {
        row.id ||= stableId(`${property.id}:${key}:${index}`);
        row.propertyId = property.id;
        row.position = index;
      });
  }
  for (const row of state.requests) {
    row.filter ??= {};
    row.isActive ??= true;
  }
  for (const [name, rows] of Object.entries(state)) {
    if (!Object.hasOwn(emptyState(), name)) continue;
    const ids = new Set();
    for (const row of rows) {
      if (!guid.test(row.id) || ids.has(row.id))
        throw new Error(`Invalid or duplicate identifier in ${name}`);
      ids.add(row.id);
    }
  }
  // Import only CRM collections, never authentication data or local demo credentials.
  return Object.fromEntries(
    Object.keys(emptyState()).map((name) => [name, state[name]]),
  );
}

export function mergeImport(state, imported) {
  const report = { added: {}, keptExisting: {}, conflicts: [] };
  for (const name of Object.keys(emptyState())) {
    const ids = new Set(state[name].map((row) => row.id));
    const propertyDeals =
      name === "deals"
        ? new Set(state.deals.map((row) => row.propertyId))
        : null;
    report.added[name] = 0;
    report.keptExisting[name] = 0;
    for (const item of imported[name]) {
      if (ids.has(item.id)) {
        report.keptExisting[name]++;
        continue;
      }
      if (propertyDeals?.has(item.propertyId)) {
        report.conflicts.push({ collection: name, id: item.id });
        continue;
      }
      state[name].push(structuredClone(item));
      ids.add(item.id);
      propertyDeals?.add(item.propertyId);
      report.added[name]++;
    }
  }
  return report;
}
