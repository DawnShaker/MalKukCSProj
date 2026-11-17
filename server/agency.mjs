import { randomUUID } from 'node:crypto';
import { HttpError } from './errors.mjs';

const now = () => new Date().toISOString();
const fail = (message, status = 400) => { throw new HttpError(status, message); };
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim()) fail(`${label}: значення не може бути порожнім.`);
  if (value.length > 2000) fail(`${label}: значення занадто довге.`);
  return value.trim();
};
function number(value, label, min = 0, max = Number.MAX_SAFE_INTEGER / 100, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    fail(`${label}: некоректне числове значення.`);
  }
  return value;
}
function enumeration(value, allowed, label) {
  if (!allowed.includes(value)) fail(`${label}: некоректне значення.`);
  return value;
}
const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const sum = (items, select) => items.reduce((total, item) => total + select(item), 0);
const average = (values) => values.length ? sum(values, x => x) / values.length : 0;
const commission = deal => money(deal.totalCost * deal.commissionPercent / 100);
const dayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit',
});
function calendarDay(value) {
  const parts = Object.fromEntries(dayFormatter.formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function find(items, id, label) {
  if (typeof id !== 'string' || !id.trim()) fail(`Не вказано ID: ${label}.`);
  const matches = items.filter(item => item.id.toLowerCase().startsWith(id.toLowerCase()));
  if (!matches.length) fail(`${label} не знайдено.`, 404);
  if (matches.length > 1) fail('Неоднозначний ID. Вкажіть повний ідентифікатор.');
  return matches[0];
}

export function validateFilter(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Некоректний фільтр.');
  const filter = {};
  for (const key of ['type', 'address', 'district', 'landmark']) {
    if (value[key] != null && value[key] !== '') filter[key] = text(value[key], key);
  }
  for (const key of ['minPrice', 'maxPrice', 'minArea', 'maxArea', 'rooms', 'minYearBuilt', 'maxYearBuilt']) {
    if (value[key] != null) filter[key] = number(value[key], key, 0, undefined, ['rooms', 'minYearBuilt', 'maxYearBuilt'].includes(key));
  }
  if (value.status != null) filter.status = enumeration(value.status, [1, 2, 3, 4], 'Статус');
  for (const [min, max] of [['minPrice', 'maxPrice'], ['minArea', 'maxArea'], ['minYearBuilt', 'maxYearBuilt']]) {
    if (filter[min] != null && filter[max] != null && filter[min] > filter[max]) fail('Мінімум фільтра перевищує максимум.');
  }
  return filter;
}

export function matches(property, filter) {
  for (const key of ['type', 'address', 'district', 'landmark']) {
    if (filter[key]?.trim() && !property[key].toLowerCase().includes(filter[key].toLowerCase())) return false;
  }
  for (const [min, max, key] of [['minPrice', 'maxPrice', 'price'], ['minArea', 'maxArea', 'area'], ['minYearBuilt', 'maxYearBuilt', 'yearBuilt']]) {
    if (filter[min] != null && property[key] < filter[min]) return false;
    if (filter[max] != null && property[key] > filter[max]) return false;
  }
  return (filter.rooms == null || property.rooms === filter.rooms)
    && (filter.status == null || property.status === filter.status);
}

function propertyFields(dto) {
  const fields = {};
  for (const [key, label] of [['type', 'Тип'], ['address', 'Адреса'], ['district', 'Район'], ['landmark', 'Орієнтир']]) fields[key] = text(dto[key], label);
  fields.area = number(dto.area, 'Площа', Number.MIN_VALUE);
  fields.rooms = number(dto.rooms, 'Кількість кімнат', 1, 10000, true);
  fields.yearBuilt = number(dto.yearBuilt, 'Рік побудови', 1800, Number(calendarDay(now()).slice(0, 4)), true);
  fields.price = money(number(dto.price, 'Ціна', 0.01));
  fields.status = enumeration(dto.status, [1, 2, 3, 4], 'Статус');
  return fields;
}

function changeStatus(property, status, comment = 'Зміна статусу', allowFromSold = false) {
  enumeration(status, [1, 2, 3, 4], 'Статус');
  if (property.status === status) return;
  if (property.status === 4 && !allowFromSold) fail('Спочатку розірвіть угоду: об’єкт вже продано.');
  property.statusHistory.push({ changedAt: now(), oldStatus: property.status, newStatus: status, comment });
  property.status = status;
}

function withRequests(state, client) {
  // Earlier C# versions kept requests in two collections. Return each once.
  const requests = new Map((client.requests ?? []).map(item => [item.id, item]));
  for (const request of state.requests.filter(item => item.clientId === client.id)) requests.set(request.id, request);
  return { ...client, requests: [...requests.values()] };
}

function analytics(state, params) {
  const start = params.get('startDate') || null;
  const end = params.get('endDate') || null;
  for (const date of [start, end]) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) fail('Некоректна дата. Очікується YYYY-MM-DD.');
  }
  if (start && end && start > end) fail('Дата початку пізніша за дату завершення.');
  const deals = state.deals.filter(deal => (!start || calendarDay(deal.date) >= start) && (!end || calendarDay(deal.date) <= end));
  const soldSqm = state.deals.flatMap(deal => {
    const property = state.properties.find(p => p.id === deal.propertyId);
    return property?.area > 0 ? [deal.totalCost / property.area] : [];
  });
  const groups = Object.groupBy(state.deals, deal => calendarDay(deal.date).slice(0, 7));
  return {
    dealsCount: deals.length,
    totalSales: money(sum(deals, d => d.totalCost)),
    totalProfit: money(sum(deals, commission)),
    avgSqmCatalog: average(state.properties.filter(p => p.area > 0).map(p => p.price / p.area)),
    avgSqmDeals: average(soldSqm),
    agentsPerformance: state.agents.map(agent => {
      const agentDeals = state.deals.filter(d => d.agentId === agent.id);
      return { agent, dealsCount: agentDeals.length, totalSalesVolume: money(sum(agentDeals, d => d.totalCost)), totalCommissionProfit: money(sum(agentDeals, commission)) };
    }).toSorted((a, b) => b.totalCommissionProfit - a.totalCommissionProfit || b.dealsCount - a.dealsCount),
    mostActiveClients: state.clients.map(client => {
      const clientDeals = state.deals.filter(d => d.clientId === client.id);
      return { client: withRequests(state, client), dealsCount: clientDeals.length, totalSpent: money(sum(clientDeals, d => d.totalCost)), savedSearchesCount: client.savedSearches.length };
    }).toSorted((a, b) => b.dealsCount - a.dealsCount || b.totalSpent - a.totalSpent || b.savedSearchesCount - a.savedSearchesCount),
    priceDynamics: Object.entries(groups).toSorted(([a], [b]) => a.localeCompare(b)).map(([period, items]) => ({ period, averagePrice: average(items.map(d => d.totalCost)), dealsCount: items.length })),
    totalProperties: state.properties.length,
    forSaleCount: state.properties.filter(p => p.status === 1).length,
    forRentCount: state.properties.filter(p => p.status === 2).length,
    soldCount: state.properties.filter(p => p.status === 4).length,
    totalClients: state.clients.length,
    buyersCount: state.clients.filter(c => c.type === 1).length,
    tenantsCount: state.clients.filter(c => c.type === 2).length,
    ownersCount: state.clients.filter(c => c.type === 3).length,
    totalRequests: state.requests.length,
  };
}

// Select an operation before opening the database. Unknown routes never fall through to the SPA.
export function resolveOperation(method, path, dto, params) {
  const segments = path.split('/').filter(Boolean);
  const [, id] = segments;
  const route = `${method} ${segments.map((part, i) => i === 1 && part !== 'search' ? ':id' : part).join('/')}`;
  const read = execute => ({ mutates: false, execute });
  const write = execute => ({ mutates: true, execute });

  switch (route) {
    case 'GET properties': return read(s => s.properties);
    case 'POST properties/search': {
      const filter = validateFilter(dto);
      return read(s => s.properties.filter(p => matches(p, filter)));
    }
    case 'POST properties': return write(s => {
      const fields = propertyFields(dto);
      const timestamp = now();
      const property = {
        id: randomUUID(), ...fields,
        statusHistory: [{ changedAt: timestamp, oldStatus: fields.status, newStatus: fields.status, comment: 'Початковий статус при створенні об’єкта' }],
        priceHistory: [{ changedAt: timestamp, oldPrice: fields.price, newPrice: fields.price, comment: 'Початкова ціна при створенні об’єкта' }],
      };
      s.properties.push(property);
      const notifications = [];
      for (const client of s.clients) {
        const search = client.savedSearches.find(search => matches(property, search.filter));
        if (!search) continue;
        const message = `[${calendarDay(timestamp)}] Клієнту ${client.name} (${client.contactInfo}): новий об’єкт за пошуком «${search.title}» — ${property.type}, ${property.area} м², ${property.district}, $${property.price}`;
        client.notifications.unshift(message);
        notifications.push(message);
      }
      return { property, notifications };
    });
    case 'PUT properties/:id': return write(s => {
      const fields = propertyFields(dto);
      const property = find(s.properties, id, 'Об’єкт');
      changeStatus(property, fields.status, 'Статус змінено під час редагування');
      if (property.price !== fields.price) property.priceHistory.push({ changedAt: now(), oldPrice: property.price, newPrice: fields.price, comment: `Зміна ціни з $${property.price} на $${fields.price}` });
      Object.assign(property, fields);
      return {};
    });
    case 'PATCH properties/:id/status': return write(s => {
      const property = find(s.properties, id, 'Об’єкт');
      changeStatus(property, dto.newStatus, dto.comment == null ? 'Зміна статусу' : text(dto.comment, 'Коментар'));
      return {};
    });
    case 'DELETE properties/:id': return write(s => {
      const property = find(s.properties, id, 'Об’єкт');
      if (s.deals.some(d => d.propertyId === property.id)) fail('Неможливо видалити нерухомість, пов’язану з угодою.');
      s.properties = s.properties.filter(p => p !== property);
      return {};
    });
    case 'GET properties/:id/history': return read(s => find(s.properties, id, 'Об’єкт').statusHistory);
    case 'GET clients': return read(s => s.clients.map(c => withRequests(s, c)));
    case 'POST clients': return write(s => {
      const client = {
        id: randomUUID(), name: text(dto.name, 'Ім’я'), contactInfo: text(dto.contactInfo, 'Контакти'),
        type: enumeration(dto.type, [1, 2, 3], 'Роль клієнта'), requests: [], savedSearches: [], notifications: [],
      };
      s.clients.push(client);
      return client;
    });
    case 'DELETE clients/:id': return write(s => {
      const client = find(s.clients, id, 'Клієнт');
      if (s.deals.some(d => d.clientId === client.id)) fail('Неможливо видалити клієнта, пов’язаного з угодою.');
      s.clients = s.clients.filter(c => c !== client);
      s.requests = s.requests.filter(r => r.clientId !== client.id);
      return {};
    });
    case 'POST clients/:id/searches': return write(s => {
      const client = find(s.clients, id, 'Клієнт');
      client.savedSearches.unshift({ id: randomUUID(), createdAt: now(), title: dto.title == null || dto.title === '' ? 'Пошук без назви' : text(dto.title, 'Назва'), filter: validateFilter(dto.filter ?? {}) });
      client.savedSearches = client.savedSearches.slice(0, 10);
      return {};
    });
    case 'GET clients/:id/searches': return read(s => find(s.clients, id, 'Клієнт').savedSearches);
    case 'GET clients/:id/notifications': return read(s => find(s.clients, id, 'Клієнт').notifications);
    case 'POST clients/:id/requests': return write(s => {
      const client = find(s.clients, id, 'Клієнт');
      const request = { id: randomUUID(), clientId: client.id, title: text(dto.title, 'Назва'), filter: validateFilter(dto.filter ?? {}), createdAt: now(), isActive: true };
      s.requests.push(request);
      return request;
    });
    case 'GET clients/:id/requests': return read(s => withRequests(s, find(s.clients, id, 'Клієнт')).requests);
    case 'GET clients/:id/matches': return read(s => {
      const client = find(s.clients, id, 'Клієнт');
      return s.properties.filter(p => client.savedSearches.some(search => matches(p, search.filter)));
    });
    case 'GET requests/:id/matches': return read(s => {
      const request = find(s.requests, id, 'Запит');
      return s.properties.filter(p => matches(p, request.filter));
    });
    case 'GET agents': return read(s => s.agents);
    case 'POST agents': return write(s => {
      const agent = { id: randomUUID(), name: text(dto.name, 'Ім’я'), experienceYears: number(dto.experienceYears, 'Стаж', 0, 100, true) };
      s.agents.push(agent);
      return agent;
    });
    case 'DELETE agents/:id': return write(s => {
      const agent = find(s.agents, id, 'Рієлтор');
      if (s.deals.some(d => d.agentId === agent.id)) fail('Неможливо видалити рієлтора, пов’язаного з угодою.');
      s.agents = s.agents.filter(a => a !== agent);
      return {};
    });
    case 'GET deals': return read(s => s.deals);
    case 'POST deals': return write(s => {
      const property = find(s.properties, dto.propertyId, 'Об’єкт');
      const client = find(s.clients, dto.clientId, 'Клієнт');
      const agent = find(s.agents, dto.agentId, 'Рієлтор');
      if (property.status === 4) fail('Цей об’єкт вже продано.');
      if (s.deals.some(d => d.propertyId === property.id)) fail('Для цього об’єкта вже існує угода.');
      const deal = {
        id: randomUUID(), date: now(), propertyId: property.id, clientId: client.id, agentId: agent.id,
        totalCost: money(number(dto.price, 'Вартість угоди', 0.01)),
        type: enumeration(dto.dealType, [1, 2], 'Тип угоди'),
        commissionPercent: number(dto.commission, 'Комісія', 0, 100),
      };
      changeStatus(property, 4, `Укладено угоду [${deal.id.slice(0, 8)}]`);
      s.deals.push(deal);
      return deal;
    });
    case 'DELETE deals/:id': return write(s => {
      const deal = find(s.deals, id, 'Угода');
      const property = s.properties.find(p => p.id === deal.propertyId);
      const reason = params.get('reason') || 'За згодою сторін';
      if (property) changeStatus(property, deal.type === 1 ? 1 : 2, `Угода [${deal.id.slice(0, 8)}] розірвана: ${text(reason, 'Причина')}`, true);
      s.deals = s.deals.filter(d => d !== deal);
      return {};
    });
    case 'GET analytics': return read(s => analytics(s, params));
    default: fail('API-маршрут не знайдено.', 404);
  }
}
