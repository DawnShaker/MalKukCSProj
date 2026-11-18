import { writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createSupabaseStore } from "../server/store.mjs";
const destination = resolve(process.argv[2] || ".local/agency-export.json");
const data = await createSupabaseStore().read();
await mkdir(dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(data, null, 2), {
  flag: "wx",
  mode: 0o600,
});
console.log("Exported CRM records. Existing files are never overwritten.");
