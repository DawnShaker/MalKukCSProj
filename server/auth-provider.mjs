import { createSupabaseAuth } from "./auth.mjs";
import { createSecurityAuth } from "./security-auth.mjs";
import { HttpError } from "./errors.mjs";

export function createConfiguredAuth(
  getStore,
  env = process.env,
  fetchImpl = fetch,
) {
  const provider = env.AUTH_PROVIDER || "supabase";
  if (provider === "supabase")
    return createSupabaseAuth(getStore, env, fetchImpl);
  if (provider === "security")
    return createSecurityAuth(getStore, env, fetchImpl);
  const unavailable = async () => {
    throw new HttpError(503, "Невідомий постачальник облікових записів.");
  };
  return {
    authenticate: unavailable,
    login: unavailable,
    refresh: unavailable,
    signup: unavailable,
    logout: unavailable,
    recover: unavailable,
    reset: unavailable,
  };
}
