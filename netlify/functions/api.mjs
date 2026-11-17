import { createHandler } from '../../server/http.mjs';
import { createSupabaseStore } from '../../server/store.mjs';

// No filesystem or in-memory fallback in production: writes always reach Supabase.
export default createHandler(() => createSupabaseStore());
