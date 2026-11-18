import { HttpError } from "./errors.mjs";

const denied = () => {
  throw new HttpError(403, "Ця дія недоступна для вашої ролі.");
};
export function requireManager(actor) {
  if (actor.role !== "manager") denied();
}
export function scopeState(state, actor) {
  if (actor.role === "manager") return state;
  if (actor.role === "agent" && actor.agentId) {
    const clients = state.clients.filter(
      (row) => row.agentId === actor.agentId,
    );
    const ids = new Set(clients.map((row) => row.id));
    return {
      ...state,
      properties: state.properties.filter(
        (row) => row.agentId === actor.agentId,
      ),
      clients,
      agents: state.agents.filter((row) => row.id === actor.agentId),
      deals: state.deals.filter((row) => row.agentId === actor.agentId),
      requests: state.requests.filter((row) => ids.has(row.clientId)),
      searchHistory: state.searchHistory.filter((row) => ids.has(row.clientId)),
    };
  }
  if (actor.role === "client" && actor.clientId) {
    return {
      ...state,
      properties: state.properties.filter((row) => [1, 2].includes(row.status)),
      clients: state.clients.filter((row) => row.id === actor.clientId),
      agents: [],
      deals: [],
      requests: state.requests.filter((row) => row.clientId === actor.clientId),
      searchHistory: state.searchHistory.filter(
        (row) => row.clientId === actor.clientId,
      ),
    };
  }
  denied();
}

function own(items, id) {
  if (
    typeof id !== "string" ||
    items.filter((row) => row.id.toLowerCase().startsWith(id.toLowerCase()))
      .length !== 1
  ) {
    throw new HttpError(404, "Запис не знайдено.");
  }
}
export function authorize(state, actor, method, path, dto) {
  const [resource, id, action] = path.split("/").filter(Boolean);
  const view = scopeState(state, actor);
  if (actor.role === "manager") return;
  if (
    resource === "analytics" ||
    resource === "reports" ||
    resource === "users"
  )
    denied();
  if (actor.role === "client") {
    if (resource === "properties" && method === "GET" && !id) return;
    if (resource === "properties" && method === "POST" && id === "search")
      return;
    if (resource === "clients") {
      if (method === "GET" && !id) return;
      own(view.clients, id);
      if (
        method === "GET" &&
        [
          "requests",
          "searches",
          "notifications",
          "history",
          "matches",
        ].includes(action)
      )
        return;
      if (method === "POST" && ["requests", "searches"].includes(action))
        return;
    }
    if (resource === "requests" && method === "GET" && action === "matches") {
      own(view.requests, id);
      return;
    }
    denied();
  }
  if (resource === "agents") {
    if (method === "GET" && !id) return;
    denied();
  }
  if (["properties", "clients", "deals", "requests"].includes(resource)) {
    if (id && !(resource === "properties" && id === "search"))
      own(view[resource], id);
    if (method === "POST" && resource === "deals") {
      if (dto.agentId !== actor.agentId) denied();
      own(view.properties, dto.propertyId);
      own(view.clients, dto.clientId);
    }
    if (
      ["properties", "clients"].includes(resource) &&
      ["POST", "PUT"].includes(method) &&
      id !== "search"
    ) {
      if (dto.agentId && dto.agentId !== actor.agentId) denied();
      dto.agentId = actor.agentId;
    }
    return;
  }
  denied();
}
