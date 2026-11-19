let csrfToken = null;
let sessionRequest = null;
let refreshRequest = null;
let refreshSupported = true;

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
async function responseData(response) {
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(
      "Сервіс недоступний. Спробуйте пізніше.",
      response.status,
    );
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(
      data.error || "Не вдалося виконати запит.",
      response.status,
    );
  if (data.csrfToken) csrfToken = data.csrfToken;
  if (data.auth) refreshSupported = data.auth.refresh;
  return data;
}
// Only these read-only requests are repeated while the servers start after idle.
async function getAuthData(endpoint) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`/api/auth${endpoint}`, {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(Math.max(1, Math.min(8000, deadline - Date.now()))),
      });
      // The older local JavaScript API has no readiness endpoint.
      if (endpoint === "/ready" && response.status === 404) return;
      if (![502, 503, 504].includes(response.status)) {
        if (!response.ok || response.headers.get("content-type")?.includes("application/json")) {
          const data = await responseData(response);
          if (data.ready !== false) return data;
        }
      }
      if (!response.bodyUsed) await response.body?.cancel();
    } catch (error) {
      if (!(error instanceof TypeError) && !["TimeoutError", "AbortError"].includes(error.name))
        throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(2000, Math.max(0, deadline - Date.now()))));
  }
  throw new ApiError("Сервер входу поки недоступний. Спробуйте ще раз трохи пізніше.", 503);
}
export function getSession() {
  sessionRequest ??= getAuthData("/session")
    .finally(() => {
      sessionRequest = null;
    });
  return sessionRequest;
}
export async function request(endpoint, options = {}, retry = true) {
  const method = (options.method || "GET").toUpperCase();
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  if (mutation && !csrfToken) await getSession();
  const response = await fetch(`/api${endpoint}`, {
    ...options,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(mutation ? { "X-CSRF-Token": csrfToken } : {}),
      ...options.headers,
    },
  });
  if (response.status === 401 && retry && !endpoint.startsWith("/auth/")) {
    try {
      await refreshSession();
      return request(endpoint, options, false);
    } catch (error) {
      if ([401, 403].includes(error.status))
        window.dispatchEvent(new Event("agency:session-ended"));
      throw error;
    }
  }
  return responseData(response);
}
export function refreshSession() {
  if (!refreshSupported)
    return Promise.reject(
      new ApiError("Сесія завершилась. Увійдіть повторно.", 401),
    );
  refreshRequest ??= request(
    "/auth/refresh",
    { method: "POST", body: "{}" },
    false,
  )
    .then((data) => {
      window.dispatchEvent(
        new CustomEvent("agency:session-changed", { detail: data.user }),
      );
      return data;
    })
    .finally(() => {
      refreshRequest = null;
    });
  return refreshRequest;
}
export const authApi = {
  session: getSession,
  refresh: refreshSession,
  async login(dto) {
    await Promise.all([getAuthData("/ready"), getSession()]);
    return request(
      "/auth/login",
      { method: "POST", body: JSON.stringify(dto) },
      false,
    );
  },
  signup: (dto) =>
    request(
      "/auth/signup",
      { method: "POST", body: JSON.stringify(dto) },
      false,
    ),
  recover: (email) =>
    request(
      "/auth/recover",
      { method: "POST", body: JSON.stringify({ email }) },
      false,
    ),
  reset: (dto) =>
    request(
      "/auth/reset",
      { method: "POST", body: JSON.stringify(dto) },
      false,
    ),
  async logout() {
    await request("/auth/logout", { method: "POST", body: "{}" }, false);
    csrfToken = null;
  },
};
