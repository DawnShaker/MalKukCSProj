import { HttpError } from "./errors.mjs";
import { cookieName, cookies } from "./session.mjs";

export function createSupabaseAuth(
  getStore,
  env = process.env,
  fetchImpl = fetch,
) {
  async function remote(path, method, body, token) {
    // Public Auth flows must not run with service-role privileges.
    const key = env.SUPABASE_PUBLISHABLE_KEY;
    if (!env.SUPABASE_URL || !key)
      throw new HttpError(503, "Сервіс облікових записів не налаштовано.");
    let response;
    try {
      response = await fetchImpl(
        new URL(`/auth/v1/${path}`, env.SUPABASE_URL),
        {
          method,
          headers: {
            apikey: key,
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(8000),
        },
      );
    } catch (cause) {
      throw new HttpError(
        503,
        "Сервіс облікових записів тимчасово недоступний.",
        { cause },
      );
    }
    if (!response.ok) {
      if (response.status === 429)
        throw new HttpError(
          429,
          "Забагато спроб. Зачекайте та спробуйте знову.",
        );
      throw new HttpError(
        401,
        "Не вдалося увійти. Перевірте email, пароль і підтвердження адреси.",
      );
    }
    return response.status === 204 ? {} : response.json();
  }
  function credentials(dto, signup = false) {
    if (
      typeof dto.email !== "string" ||
      dto.email.length > 254 ||
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dto.email)
    )
      throw new HttpError(400, "Вкажіть коректний email.");
    if (
      typeof dto.password !== "string" ||
      dto.password.length < (signup ? 8 : 1) ||
      dto.password.length > 128
    )
      throw new HttpError(
        400,
        signup
          ? "Пароль має містити від 8 до 128 символів."
          : "Вкажіть пароль.",
      );
    return { email: dto.email.trim().toLowerCase(), password: dto.password };
  }
  async function provision(session) {
    const user = await remote("user", "GET", undefined, session.access_token);
    if (!user.email_confirmed_at)
      throw new HttpError(403, "Підтвердьте email перед входом.");
    const owner = (env.BOOTSTRAP_MANAGER_EMAIL || "").trim().toLowerCase();
    const role =
      owner && user.email.toLowerCase() === owner ? "manager" : "client";
    const profile = await getStore().provision(user, role);
    return { session, user: profile };
  }
  return {
    capabilities: {
      identifier: "email",
      signup: true,
      recovery: true,
      refresh: true,
    },
    async authenticate(request, optional = false) {
      const token = cookies(request)[cookieName(request, "access")];
      if (!token) {
        if (optional) return null;
        throw new HttpError(401, "Увійдіть до свого облікового запису.");
      }
      try {
        // This remote call validates the token. User metadata never grants permissions.
        const user = await remote("user", "GET", undefined, token);
        if (!user.email_confirmed_at)
          throw new HttpError(401, "Підтвердьте email.");
        const profile = await getStore().profile(user.id);
        if (!profile || !["manager", "agent", "client"].includes(profile.role))
          throw new HttpError(
            401,
            "Обліковий запис ще не налаштовано. Увійдіть повторно.",
          );
        return profile;
      } catch (error) {
        if (optional && error.status === 401) return null;
        throw error;
      }
    },
    async login(dto) {
      return provision(
        await remote("token?grant_type=password", "POST", credentials(dto)),
      );
    },
    async signup(dto, origin) {
      const value = credentials(dto, true);
      if (
        typeof dto.name !== "string" ||
        !dto.name.trim() ||
        dto.name.length > 200
      )
        throw new HttpError(400, "Вкажіть своє ім’я.");
      // Do not accept role, agentId, clientId or app_metadata from public registration.
      await remote(`signup?redirect_to=${encodeURIComponent(origin)}`, "POST", {
        ...value,
        data: { name: dto.name.trim() },
      });
      return {
        message: "Обліковий запис створено. Підтвердьте email, потім увійдіть.",
      };
    },
    async refresh(request) {
      const token = cookies(request)[cookieName(request, "refresh")];
      if (!token) throw new HttpError(401, "Увійдіть повторно.");
      return provision(
        await remote("token?grant_type=refresh_token", "POST", {
          refresh_token: token,
        }),
      );
    },
    async logout(request) {
      const token = cookies(request)[cookieName(request, "access")];
      if (token) {
        try {
          await remote("logout", "POST", {}, token);
        } catch {
          /* Always clear this browser's cookies. */
        }
      }
    },
    async recover(dto, origin) {
      if (
        typeof dto.email !== "string" ||
        !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(dto.email)
      )
        throw new HttpError(400, "Вкажіть коректний email.");
      await remote(
        `recover?redirect_to=${encodeURIComponent(origin)}`,
        "POST",
        { email: dto.email.trim().toLowerCase() },
      );
      return {
        message: "Якщо обліковий запис існує, інструкції надіслано на email.",
      };
    },
    async reset(dto) {
      if (
        typeof dto.accessToken !== "string" ||
        typeof dto.password !== "string" ||
        dto.password.length < 8 ||
        dto.password.length > 128
      )
        throw new HttpError(400, "Вкажіть новий пароль від 8 до 128 символів.");
      await remote("user", "PUT", { password: dto.password }, dto.accessToken);
      return { message: "Пароль оновлено. Увійдіть з новим паролем." };
    },
  };
}
