import { HttpError } from "./errors.mjs";

export const emptyState = () => ({
  properties: [],
  clients: [],
  agents: [],
  deals: [],
  requests: [],
  searchHistory: [],
});

// The original C# JSON uses PascalCase. API and database records use camelCase.
export function normalizeState(value) {
  function camelCase(item) {
    if (Array.isArray(item)) return item.map(camelCase);
    if (item && typeof item === "object") {
      return Object.fromEntries(
        Object.entries(item).map(([key, child]) => [
          key.charAt(0).toLowerCase() + key.slice(1),
          camelCase(child),
        ]),
      );
    }
    return item;
  }
  const state = { ...emptyState(), ...camelCase(value) };
  for (const name of Object.keys(emptyState())) {
    if (!Array.isArray(state[name]))
      throw new Error(`Invalid agency data: ${name}`);
  }
  for (const property of state.properties) {
    property.statusHistory ??= [];
    property.priceHistory ??= [];
  }
  for (const client of state.clients) {
    client.savedSearches ??= [];
    client.notifications ??= [];
    client.requests ??= [];
  }
  return state;
}

export function createSupabaseTransport(env = process.env, fetchImpl = fetch) {
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !secret) {
    throw new HttpError(
      503,
      "Не налаштовано Supabase: задайте SUPABASE_URL та серверний секретний ключ.",
    );
  }
  let base;
  try {
    base = new URL(env.SUPABASE_URL);
    if (
      base.protocol !== "https:" ||
      base.username ||
      base.password ||
      base.pathname !== "/"
    )
      throw new Error();
  } catch {
    throw new HttpError(503, "Некоректне значення SUPABASE_URL.");
  }
  const headers = { apikey: secret, "Content-Type": "application/json" };
  // New sb_secret_ keys belong only in apikey, not in a JWT Authorization header.
  if (!secret.startsWith("sb_secret_"))
    headers.Authorization = `Bearer ${secret}`;

  return async function query(resource, method = "GET", params = {}, body) {
    const url = new URL(`/rest/v1/${resource}`, base);
    url.search = new URLSearchParams(params).toString();
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        headers: { ...headers, Prefer: "return=representation" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (cause) {
      throw new HttpError(
        503,
        "Не вдалося з’єднатися з базою даних. Спробуйте пізніше.",
        { cause },
      );
    }
    if (!response.ok) {
      const problem = await response.json().catch(() => ({}));
      if (problem.code === "23503" || problem.code === "23505")
        throw new HttpError(
          409,
          "Запис пов’язаний з іншими даними або вже існує.",
        );
      if (problem.code === "42501")
        throw new HttpError(403, "Недостатньо прав для цієї операції.");
      if (problem.code === "P0001")
        throw new HttpError(
          409,
          "Операція порушує правила даних. Перевірте зв’язки та наявність менеджера.",
        );
      // Do not forward upstream bodies: they can contain internal database details.
      throw new HttpError(
        503,
        "Помилка Supabase. Перевірте серверний ключ і виконання SQL-міграції.",
      );
    }
    return response.status === 204 ? null : response.json();
  };
}

export function createSupabaseStore(env = process.env, fetchImpl = fetch) {
  const query = createSupabaseTransport(env, fetchImpl);

  async function snapshot() {
    const row = await query("rpc/agency_read_snapshot", "POST", {}, {});
    if (!row || !Number.isSafeInteger(row.version) || row.version < 0) {
      throw new HttpError(
        503,
        "Дані агентства не ініціалізовано. Виконайте SQL-міграцію Supabase.",
      );
    }
    return { state: normalizeState(row.data), version: row.version };
  }

  return {
    kind: "supabase",
    async read() {
      return (await snapshot()).state;
    },
    async mutate(operation) {
      for (let attempt = 0; attempt < 5; attempt++) {
        const { state, version } = await snapshot();
        // Operations have no external side effects and may be replayed after a conflict.
        const result = operation(state);
        const updated = await query(
          "rpc/agency_save_snapshot",
          "POST",
          {},
          {
            p_data: state,
            p_expected_version: version,
          },
        );
        if (updated === true) return result;
      }
      throw new HttpError(
        409,
        "Дані одночасно змінюються іншим користувачем. Повторіть дію.",
      );
    },
    async profile(id) {
      const rows = await query("user_profiles", "GET", {
        id: `eq.${id}`,
        select: "*",
      });
      return rows[0] ?? null;
    },
    async profiles() {
      return query("user_profiles", "GET", {
        select: "*",
        order: "createdAt.asc",
      });
    },
    async provision(user, role = "client") {
      return query(
        "rpc/agency_provision_profile",
        "POST",
        {},
        {
          p_id: user.id,
          p_email: user.email,
          p_name: String(user.user_metadata?.name || user.email).slice(0, 200),
          p_role: role,
        },
      );
    },
    async assignRole(actor, id, dto) {
      return query(
        "rpc/agency_assign_role",
        "POST",
        {},
        {
          p_actor_id: actor.id,
          p_id: id,
          p_role: dto.role,
          p_agent_id: dto.agentId || null,
          p_client_id: dto.clientId || null,
        },
      );
    },
  };
}
