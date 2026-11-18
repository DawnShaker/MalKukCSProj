// Loopback development only. Netlify's function never imports this module.
import { randomUUID } from "node:crypto";
import { HttpError } from "./errors.mjs";
import { cookies, cookieName } from "./session.mjs";

export async function createDemoAuth(base) {
  await base.mutate((state) => {
    if (state._profiles) return;
    state._profiles = [
      {
        id: randomUUID(),
        email: "manager@example.test",
        displayName: "Демо менеджер",
        role: "manager",
        agentId: null,
        clientId: null,
      },
      {
        id: randomUUID(),
        email: "agent@example.test",
        displayName: "Демо агент",
        role: "agent",
        agentId: state.agents[0]?.id,
        clientId: null,
      },
      {
        id: randomUUID(),
        email: "client@example.test",
        displayName: "Демо клієнт",
        role: "client",
        clientId: state.clients[0]?.id,
        agentId: null,
      },
    ];
  });
  const store = {
    ...base,
    profile: async (id) =>
      (await base.read())._profiles.find((row) => row.id === id) || null,
    profiles: async () => (await base.read())._profiles,
    assignRole: async (actor, id, dto) =>
      base.mutate((state) => {
        if (
          state._profiles.find((row) => row.id === actor.id)?.role !== "manager"
        )
          throw new HttpError(403, "Потрібна роль менеджера.");
        const profile = state._profiles.find((row) => row.id === id);
        if (!profile) throw new HttpError(404, "Користувача не знайдено.");
        if (
          profile.role === "manager" &&
          dto.role !== "manager" &&
          state._profiles.filter((row) => row.role === "manager").length === 1
        )
          throw new HttpError(409, "Неможливо прибрати останнього менеджера.");
        const agentId = dto.role === "agent" ? dto.agentId : null;
        const clientId = dto.role === "client" ? dto.clientId : null;
        if (
          (agentId && !state.agents.some((row) => row.id === agentId)) ||
          (clientId && !state.clients.some((row) => row.id === clientId)) ||
          (dto.role === "agent" && !agentId) ||
          (dto.role === "client" && !clientId)
        )
          throw new HttpError(400, "Оберіть пов’язаний запис.");
        if (
          state._profiles.some(
            (row) =>
              row.id !== id &&
              ((agentId && row.agentId === agentId) ||
                (clientId && row.clientId === clientId)),
          )
        )
          throw new HttpError(
            409,
            "Запис уже пов’язаний з іншим користувачем.",
          );
        Object.assign(profile, { role: dto.role, agentId, clientId });
        return profile;
      }),
  };
  const sessions = new Map();
  function session(user) {
    const access = randomUUID();
    const refresh = randomUUID();
    sessions.set(access, user.id);
    sessions.set(refresh, user.id);
    return {
      user,
      session: {
        access_token: access,
        refresh_token: refresh,
        expires_in: 3600,
      },
    };
  }
  const unavailable = () => {
    throw new HttpError(
      400,
      "У локальному демо використайте готові тестові облікові записи.",
    );
  };
  return {
    store,
    auth: {
      capabilities: {
        identifier: "email",
        signup: false,
        recovery: false,
        refresh: true,
      },
      async authenticate(request, optional = false) {
        const id = sessions.get(
          cookies(request)[cookieName(request, "access")],
        );
        const profile = id ? await store.profile(id) : null;
        if (!profile && !optional)
          throw new HttpError(401, "Увійдіть до облікового запису.");
        return profile;
      },
      async login(dto) {
        const user = (await store.profiles()).find(
          (row) => row.email === dto.email,
        );
        if (!user || dto.password !== "local-demo-only")
          throw new HttpError(401, "Неправильний email або пароль.");
        return session(user);
      },
      async refresh(request) {
        const token = cookies(request)[cookieName(request, "refresh")];
        const user = await store.profile(sessions.get(token));
        if (!user) throw new HttpError(401, "Увійдіть повторно.");
        sessions.delete(token);
        return session(user);
      },
      async logout(request) {
        for (const key of ["access", "refresh"])
          sessions.delete(cookies(request)[cookieName(request, key)]);
      },
      signup: unavailable,
      recover: unavailable,
      reset: unavailable,
    },
  };
}
