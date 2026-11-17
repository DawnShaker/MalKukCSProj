const API_URL = "/api";

async function request(endpoint, options = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("API недоступне. Перевірте запуск сервера або налаштування Netlify.");
  }
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Помилка запиту до сервера");
  }
  return data;
}

export const agencyApi = {
  // Нерухомість
  getProperties: () => request("/properties"),
  searchProperties: (filter) =>
    request("/properties/search", { method: "POST", body: JSON.stringify(filter) }),
  createProperty: (dto) =>
    request("/properties", { method: "POST", body: JSON.stringify(dto) }),
  changePropertyStatus: (id, newStatus, comment) =>
    request(`/properties/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ newStatus: Number(newStatus), comment }),
    }),
  deleteProperty: (id) => request(`/properties/${id}`, { method: "DELETE" }),

  // Клієнти та пошуки
  getClients: () => request("/clients"),
  createClient: (dto) =>
    request("/clients", { method: "POST", body: JSON.stringify(dto) }),
  deleteClient: (id) => request(`/clients/${id}`, { method: "DELETE" }),
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
    request(`/deals/${id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" }),

  // Аналітика
  getAnalytics: (startDate = "", endDate = "") => {
    const params = new URLSearchParams();
    if (startDate) params.append("startDate", startDate);
    if (endDate) params.append("endDate", endDate);
    return request(`/analytics?${params.toString()}`);
  },

  createClientRequest: (clientId, requestDto) =>
    request(`/clients/${clientId}/requests`, { method: "POST", body: JSON.stringify(requestDto) }),

  updateProperty: (id, propertyDto) =>
    request(`/properties/${id}`, { method: "PUT", body: JSON.stringify(propertyDto) }),
};
