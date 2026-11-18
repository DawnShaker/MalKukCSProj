import { HttpError } from "./errors.mjs";
import { resolveOperation } from "./agency.mjs";
import { randomUUID } from "node:crypto";
import { authorize, requireManager, scopeState } from "./access.mjs";
import {
  checkCsrf,
  clearSession,
  ensureCsrf,
  setSession,
  cookies,
  cookieName,
} from "./session.mjs";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
  Vary: "Cookie, Origin, Sec-Fetch-Site",
};
const json = (data, status = 200) => Response.json(data, { status, headers });

export function createHandler(getStore, options = {}) {
  const authenticate =
    options.authenticate ||
    options.auth?.authenticate ||
    (() => {
      throw new HttpError(401, "Увійдіть до облікового запису.");
    });
  return async function handle(request) {
    try {
      const url = new URL(request.url);
      const origin = request.headers.get("origin");
      if (
        request.headers.get("sec-fetch-site") === "cross-site" ||
        (origin && origin !== url.origin)
      ) {
        throw new HttpError(403, "Запити з іншого сайту заборонено.");
      }
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204, headers });
      const path = url.pathname
        .replace(/^\/(?:api|\.netlify\/functions\/api)(?:\/|$)/, "/")
        .replace(/\/$/, "");
      if (path === "/health" && request.method === "GET") {
        const store = getStore();
        await store.read();
        return json({ status: "ok", storage: store.kind });
      }
      let dto = {};
      if (["POST", "PUT", "PATCH"].includes(request.method)) {
        if (
          !request.headers
            .get("content-type")
            ?.toLowerCase()
            .startsWith("application/json")
        )
          throw new HttpError(415, "Очікується application/json.");
        const body = await request.text();
        if (new TextEncoder().encode(body).length > 65536)
          throw new HttpError(413, "Запит занадто великий.");
        try {
          dto = JSON.parse(body);
        } catch {
          throw new HttpError(400, "Некоректний JSON.");
        }
        if (!dto || typeof dto !== "object" || Array.isArray(dto))
          throw new HttpError(400, "Очікується JSON-об’єкт.");
      }
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method))
        checkCsrf(request);
      if (path.startsWith("/auth/")) {
        const responseHeaders = new Headers(headers);
        const csrfToken = ensureCsrf(request, responseHeaders);
        let result;
        if (path === "/auth/session" && request.method === "GET") {
          result = {
            user: await authenticate(request, true),
            csrfToken,
            needsRefresh: Boolean(
              cookies(request)[cookieName(request, "refresh")],
            ),
          };
          if (result.user) result.needsRefresh = false;
        } else {
          const auth = options.auth;
          if (!auth)
            throw new HttpError(
              503,
              "Сервіс облікових записів не налаштовано.",
            );
          if (request.method !== "POST")
            throw new HttpError(404, "Маршрут не знайдено.");
          switch (path) {
            case "/auth/login":
            case "/auth/refresh": {
              const session =
                path === "/auth/login"
                  ? await auth.login(dto)
                  : await auth.refresh(request);
              setSession(responseHeaders, request, session.session);
              result = { user: session.user, csrfToken };
              break;
            }
            case "/auth/signup":
              result = await auth.signup(dto, `${url.origin}/login`);
              break;
            case "/auth/recover":
              result = await auth.recover(dto, `${url.origin}/reset-password`);
              break;
            case "/auth/reset":
              result = await auth.reset(dto);
              break;
            case "/auth/logout":
              await auth.logout(request);
              clearSession(responseHeaders, request);
              result = { user: null };
              break;
            default:
              throw new HttpError(404, "Маршрут не знайдено.");
          }
        }
        return Response.json(result, { headers: responseHeaders });
      }
      const actor = await authenticate(request);
      const store = getStore();
      if (path === "/users" && request.method === "GET") {
        requireManager(actor);
        return json(await store.profiles());
      }
      if (/^\/users\/[^/]+$/.test(path) && request.method === "PATCH") {
        requireManager(actor);
        if (!["manager", "agent", "client"].includes(dto.role))
          throw new HttpError(400, "Некоректна роль.");
        return json(await store.assignRole(actor, path.split("/")[2], dto));
      }
      const operation = resolveOperation(
        request.method,
        path,
        dto,
        url.searchParams,
        actor,
      );
      const trackSearch =
        request.method === "POST" &&
        path === "/properties/search" &&
        actor.role === "client";
      const perform = (state) => {
        authorize(state, actor, request.method, path, dto);
        const result = operation.execute(
          operation.mutates ? state : scopeState(state, actor),
        );
        if (trackSearch)
          state.searchHistory.push({
            id: randomUUID(),
            clientId: actor.clientId,
            createdAt: new Date().toISOString(),
            filter: dto,
            resultCount: result.length,
          });
        return result;
      };
      const result =
        operation.mutates || trackSearch
          ? await store.mutate(perform)
          : perform(await store.read());
      if (path === "/reports" && request.method === "GET") {
        const quote = (value) => {
          let text = String(value ?? "");
          if (/^\s*[-=+@]/.test(text)) text = `'${text}`;
          return `"${text.replaceAll('"', '""')}"`;
        };
        const rows = [
          ["Дата", "Об’єкт", "Клієнт", "Агент", "Сума", "Комісія, %", "Дохід"],
          ...result.map((row) => [
            row.date,
            row.property,
            row.client,
            row.agent,
            row.total,
            row.commission,
            row.profit,
          ]),
        ];
        return new Response(
          "\ufeff" + rows.map((row) => row.map(quote).join(",")).join("\r\n"),
          {
            headers: {
              ...headers,
              "Content-Type": "text/csv; charset=utf-8",
              "Content-Disposition": 'attachment; filename="agency-deals.csv"',
            },
          },
        );
      }
      return json(result);
    } catch (error) {
      if (error instanceof HttpError)
        return json({ error: error.message }, error.status);
      // No internal errors, file paths, upstream responses or credentials in browser responses.
      console.error("Agency API failed:", error.name);
      return json({ error: "Внутрішня помилка сервера." }, 500);
    }
  };
}
