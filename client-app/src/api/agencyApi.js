import { request } from "./http";

// Пустой пункт select означает отсутствие связи, а не строковый идентификатор.
const withAgent = (dto) => ({ ...dto, agentId: dto.agentId || null });

export const agencyApi = {
  // Нерухомість
  getProperties: () => request("/properties"),
  searchProperties: (filter) =>
    request("/properties/search", {
      method: "POST",
      body: JSON.stringify(filter),
    }),
  createProperty: (dto) =>
    request("/properties", { method: "POST", body: JSON.stringify(withAgent(dto)) }),
  changePropertyStatus: (id, newStatus, comment) =>
    request(`/properties/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ newStatus: Number(newStatus), comment }),
    }),
  deleteProperty: (id) => request(`/properties/${id}`, { method: "DELETE" }),

  // Клієнти та пошуки
  getClients: () => request("/clients"),
  createClient: (dto) =>
    request("/clients", { method: "POST", body: JSON.stringify(withAgent(dto)) }),
  deleteClient: (id) => request(`/clients/${id}`, { method: "DELETE" }),
  updateClient: (id, dto) =>
    request(`/clients/${id}`, { method: "PUT", body: JSON.stringify(withAgent(dto)) }),
  getClientHistory: (id) => request(`/clients/${id}/history`),
  getRequestMatches: (id) => request(`/requests/${id}/matches`),
  getUsers: () => request("/users"),
  updateUserRole: (id, dto) =>
    request(`/users/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ ...dto, agentId: dto.agentId || null, clientId: dto.clientId || null }),
    }),
  saveClientSearch: (clientId, title, filter) =>
    request(`/clients/${clientId}/searches`, {
      method: "POST",
      body: JSON.stringify({ title, filter }),
    }),

  // Рієлтори та угоди
  getAgents: () => request("/agents"),
  createAgent: (dto) =>
    request("/agents", { method: "POST", body: JSON.stringify(dto) }),
  deleteAgent: (id) => request(`/agents/${id}`, { method: "DELETE" }),
  getDeals: () => request("/deals"),
  createDeal: (dto) =>
    request("/deals", { method: "POST", body: JSON.stringify(dto) }),
  cancelDeal: (id, reason) =>
    request(`/deals/${id}?reason=${encodeURIComponent(reason)}`, {
      method: "DELETE",
    }),

  // Аналітика
  getAnalytics: (startDate = "", endDate = "") => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    return request(`/analytics?${params.toString()}`);
  },

  createClientRequest: (clientId, requestDto) =>
    request(`/clients/${clientId}/requests`, {
      method: "POST",
      body: JSON.stringify(requestDto),
    }),

  updateProperty: (id, propertyDto) =>
    request(`/properties/${id}`, {
      method: "PUT",
      body: JSON.stringify(withAgent(propertyDto)),
    }),
};
