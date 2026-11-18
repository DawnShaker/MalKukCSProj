import { createHandler } from "./http.mjs";
import { emptyState } from "./store.mjs";
import { HttpError } from "./errors.mjs";
export const manager = {
  id: "11111111-1111-4111-8111-111111111111",
  role: "manager",
};
export function memoryStore(initial = emptyState()) {
  let state = structuredClone(initial);
  return {
    kind: "memory",
    read: async () => structuredClone(state),
    async mutate(operation) {
      const next = structuredClone(state);
      const result = operation(next);
      state = next;
      return result;
    },
  };
}
export function client(store = memoryStore(), actor = manager) {
  const handle = createHandler(() => store, {
    authenticate: async (request, optional) => {
      if (!actor && !optional) throw new HttpError(401, "Login required");
      return actor;
    },
  });
  let csrf;
  const initialized = handle(
    new Request("http://localhost/api/auth/session"),
  ).then(async (response) => {
    const data = await response.json();
    csrf = {
      token: data.csrfToken,
      cookie: response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; "),
    };
  });
  return async (path, method = "GET", body, headers = {}) => {
    await initialized;
    const response = await handle(
      new Request(`http://localhost/api${path}`, {
        method,
        headers: {
          Cookie: csrf.cookie,
          "X-CSRF-Token": csrf.token,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
    );
    return {
      status: response.status,
      data: response.headers.get("content-type")?.includes("application/json")
        ? await response.json()
        : await response.text(),
      headers: response.headers,
    };
  };
}
