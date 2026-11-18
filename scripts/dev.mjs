import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createHandler } from "../server/http.mjs";
import { createLocalStore } from "../server/local-store.mjs";
import { createSupabaseStore, normalizeState } from "../server/store.mjs";
import { createConfiguredAuth } from "../server/auth-provider.mjs";
import { createDemoAuth } from "../server/demo-auth.mjs";
import { adaptLegacyData } from "../server/import.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const dist = resolve(root, "client-app/dist");
const configured =
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
if (process.env.AUTH_PROVIDER === "security" && !configured)
  throw new Error(
    "Security authentication requires Supabase database settings. Configure SUPABASE_URL and SUPABASE_SECRET_KEY in .env.",
  );
const seed = adaptLegacyData(
  JSON.parse(
    await readFile(resolve(root, "RealEstateAgency/agency_data.json"), "utf8"),
  ),
);
const storage = configured
  ? createSupabaseStore()
  : createLocalStore(resolve(root, ".local/agency_data.json"), seed);
const demo =
  configured || process.env.AUTH_PROVIDER === "security"
    ? null
    : await createDemoAuth(storage);
const store = demo?.store || storage;
const api = createHandler(() => store, {
  auth: demo?.auth || createConfiguredAuth(() => store),
});
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};
const port = Number(process.env.PORT || 8888);

createServer(async (incoming, outgoing) => {
  try {
    const origin = `http://${incoming.headers.host}`;
    const url = new URL(incoming.url, origin);
    if (
      url.pathname === "/api" ||
      url.pathname.startsWith("/api/") ||
      url.pathname.startsWith("/.netlify/functions/api")
    ) {
      const hasBody = !["GET", "HEAD"].includes(incoming.method);
      const request = new Request(url, {
        method: incoming.method,
        headers: incoming.headers,
        ...(hasBody ? { body: Readable.toWeb(incoming), duplex: "half" } : {}),
      });
      const response = await api(request);
      const responseHeaders = Object.fromEntries(response.headers);
      if (response.headers.getSetCookie().length)
        responseHeaders["set-cookie"] = response.headers.getSetCookie();
      outgoing.writeHead(response.status, responseHeaders);
      outgoing.end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (!["GET", "HEAD"].includes(incoming.method)) {
      outgoing.writeHead(405);
      outgoing.end();
      return;
    }
    const spa = [
      "/",
      "/clients",
      "/deals",
      "/analytics",
      "/my",
      "/users",
      "/login",
      "/reset-password",
    ].includes(url.pathname);
    const file = spa
      ? resolve(dist, "index.html")
      : resolve(dist, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(dist + sep)) {
      outgoing.writeHead(403);
      outgoing.end();
      return;
    }
    const content = await readFile(file);
    outgoing.writeHead(200, {
      "Content-Type": types[extname(file)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });
    outgoing.end(incoming.method === "HEAD" ? undefined : content);
  } catch (error) {
    outgoing.writeHead(error.code === "ENOENT" ? 404 : 500, {
      "Content-Type": "text/plain; charset=utf-8",
    });
    outgoing.end(
      error.code === "ENOENT"
        ? "Файл не знайдено. Спочатку виконайте npm run build."
        : "Помилка локального сервера.",
    );
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Agency: http://127.0.0.1:${port} (${store.kind} storage)`);
  if (store.kind === "local")
    console.log(
      "Local changes are saved in .local/agency_data.json; the original C# data is preserved.",
    );
});
