import { randomBytes, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors.mjs";

export function cookies(request) {
  const result = {};
  for (const item of (request.headers.get("cookie") || "").split(";")) {
    const index = item.indexOf("=");
    if (index < 0) continue;
    result[item.slice(0, index).trim()] = item.slice(index + 1).trim();
  }
  return result;
}
export function cookieName(request, key) {
  return `${new URL(request.url).protocol === "https:" ? "__Host-" : ""}agency-${key}`;
}
export function setCookie(headers, request, key, value, age) {
  const secure = new URL(request.url).protocol === "https:";
  headers.append(
    "Set-Cookie",
    `${cookieName(request, key)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure ? "; Secure" : ""}`,
  );
}
export function setSession(headers, request, session) {
  setCookie(
    headers,
    request,
    "access",
    session.access_token,
    Math.min(session.expires_in || 3600, 3600),
  );
  setCookie(headers, request, "refresh", session.refresh_token, 604800);
}
export function clearSession(headers, request) {
  for (const key of ["access", "refresh", "csrf"])
    setCookie(headers, request, key, "", 0);
  // The application never persists tokens to Web Storage; clear stale client caches on logout too.
  headers.set("Clear-Site-Data", '"cookies", "storage", "cache"');
}
export function ensureCsrf(request, headers) {
  const stored = cookies(request)[cookieName(request, "csrf")];
  const token =
    stored && /^[a-f0-9]{64}$/.test(stored)
      ? stored
      : randomBytes(32).toString("hex");
  if (token !== stored) setCookie(headers, request, "csrf", token, 604800);
  return token;
}
export function checkCsrf(request) {
  const expected = cookies(request)[cookieName(request, "csrf")];
  const actual = request.headers.get("x-csrf-token");
  if (
    !expected ||
    !actual ||
    !/^[a-f0-9]{64}$/.test(expected) ||
    !/^[a-f0-9]{64}$/.test(actual) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  ) {
    throw new HttpError(403, "Захисний код сесії недійсний. Оновіть сторінку.");
  }
}
