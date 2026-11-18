import { createHash } from "node:crypto";
import { jwtVerify } from "jose";
import { HttpError } from "./errors.mjs";
import { cookieName, cookies } from "./session.mjs";

const nameClaim = "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name";
const roleClaim =
  "http://schemas.microsoft.com/ws/2008/06/identity/claims/role";
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Namespace external subjects so switching providers cannot reuse another
// provider's account UUID. Never link accounts merely because emails match.
function profileId(issuer, subject) {
  const bytes = createHash("sha256")
    .update(`Security\0${issuer}\0${subject}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 128; // UUID v8, application-defined namespace.
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createSecurityAuth(
  getStore,
  env = process.env,
  fetchImpl = fetch,
) {
  function configuration() {
    let base;
    try {
      base = new URL(env.SECURITY_AUTH_URL);
      const localHttp =
        env.NODE_ENV !== "production" &&
        base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
      if (
        (base.protocol !== "https:" && !localHttp) ||
        base.username ||
        base.password ||
        base.pathname !== "/" ||
        base.search ||
        base.hash
      )
        throw new Error();
    } catch {
      throw new HttpError(
        503,
        "Задайте адресу сервера облікових записів SECURITY_AUTH_URL.",
      );
    }
    const key = new TextEncoder().encode(env.SECURITY_JWT_KEY || "");
    if (
      key.length < 32 ||
      !env.SECURITY_JWT_ISSUER ||
      !env.SECURITY_JWT_AUDIENCE
    )
      throw new HttpError(
        503,
        "Не налаштовано серверну перевірку JWT авторизатора.",
      );
    return {
      base,
      key,
      issuer: env.SECURITY_JWT_ISSUER,
      audience: env.SECURITY_JWT_AUDIENCE,
    };
  }

  async function identity(token) {
    const config = configuration();
    if (typeof token !== "string" || token.length > 8192)
      throw new HttpError(401, "Увійдіть повторно.");
    try {
      const { payload } = await jwtVerify(token, config.key, {
        algorithms: ["HS256"],
        issuer: config.issuer,
        audience: config.audience,
        requiredClaims: ["exp", "Id", nameClaim],
      });
      if (
        !guid.test(payload.Id) ||
        typeof payload[nameClaim] !== "string" ||
        !payload[nameClaim].trim() ||
        payload[nameClaim].length > 256
      )
        throw new Error("Invalid identity");
      const roles = Array.isArray(payload[roleClaim])
        ? payload[roleClaim]
        : [payload[roleClaim]];
      return {
        id: profileId(config.issuer, payload.Id.toLowerCase()),
        username: payload[nameClaim],
        isAdmin: roles.includes("Admin"),
        expiresIn: Math.min(3600, Math.floor(payload.exp - Date.now() / 1000)),
      };
    } catch {
      throw new HttpError(
        401,
        "Сесія недійсна або завершилась. Увійдіть повторно.",
      );
    }
  }
  const unsupported = async () => {
    throw new HttpError(
      405,
      "Обліковими записами керує адміністратор. Зверніться до нього для створення або відновлення доступу.",
    );
  };
  return {
    capabilities: {
      identifier: "username",
      signup: false,
      recovery: false,
      refresh: false,
    },
    async login(dto) {
      const username =
        typeof dto.username === "string" ? dto.username.trim() : "";
      if (
        !username ||
        username.length > 256 ||
        typeof dto.password !== "string" ||
        !dto.password ||
        dto.password.length > 128
      )
        throw new HttpError(400, "Вкажіть логін і пароль.");
      const config = configuration();
      let response;
      try {
        response = await fetchImpl(new URL("/api/Users/login", config.base), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ username, password: dto.password }),
          redirect: "error",
          signal: AbortSignal.timeout(8000),
        });
      } catch {
        throw new HttpError(
          503,
          "Сервер облікових записів тимчасово недоступний.",
        );
      }
      if (!response.ok) {
        if (response.status === 429)
          throw new HttpError(429, "Забагато спроб. Спробуйте пізніше.");
        if ([400, 401, 403, 404].includes(response.status))
          throw new HttpError(401, "Перевірте логін і пароль.");
        throw new HttpError(
          503,
          "Сервер облікових записів тимчасово недоступний.",
        );
      }
      const result = await response.json().catch(() => null);
      const token = result?.token;
      const user = await identity(token);
      if (
        user.username.toLowerCase() !== username.toLowerCase() ||
        user.expiresIn < 1
      )
        throw new HttpError(401, "Сервер повернув недійсну сесію.");
      const bootstrap = (
        env.BOOTSTRAP_MANAGER_USERNAME ||
        env.BOOTSTRAP_MANAGER_EMAIL ||
        ""
      )
        .trim()
        .toLowerCase();
      const role =
        user.isAdmin && bootstrap && user.username.toLowerCase() === bootstrap
          ? "manager"
          : "client";
      const profile = await getStore().provision(
        {
          id: user.id,
          email: user.username,
          user_metadata: { name: user.username },
        },
        role,
      );
      return {
        user: profile,
        session: { access_token: token, expires_in: user.expiresIn },
      };
    },
    async authenticate(request, optional = false) {
      const token = cookies(request)[cookieName(request, "access")];
      if (!token) {
        if (optional) return null;
        throw new HttpError(401, "Увійдіть до свого облікового запису.");
      }
      try {
        const user = await identity(token);
        const profile = await getStore().profile(user.id);
        if (!profile || !["manager", "agent", "client"].includes(profile.role))
          throw new HttpError(401, "Увійдіть повторно.");
        return profile;
      } catch (error) {
        if (optional && error.status === 401) return null;
        throw error;
      }
    },
    signup: unsupported,
    recover: unsupported,
    reset: unsupported,
    async refresh() {
      throw new HttpError(401, "Сесія завершилась. Увійдіть повторно.");
    },
    async logout() {
      /* The upstream API has no logout/revocation endpoint. */
    },
  };
}
