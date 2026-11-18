import { createHandler } from "../../server/http.mjs";
import { createSupabaseStore } from "../../server/store.mjs";
import { createConfiguredAuth } from "../../server/auth-provider.mjs";

// No filesystem or in-memory fallback in production: writes always reach Supabase.
const getStore = () => createSupabaseStore();
export default createHandler(getStore, { auth: createConfiguredAuth(getStore) });
