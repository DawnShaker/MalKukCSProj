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
export function getSession() {
  sessionRequest ??= fetch("/api/auth/session", {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  })
    .then(responseData)
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
  login: (dto) =>
    request(
      "/auth/login",
      { method: "POST", body: JSON.stringify(dto) },
      false,
    ),
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
