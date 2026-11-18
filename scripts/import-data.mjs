import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseStore, normalizeState } from "../server/store.mjs";
import { adaptLegacyData, mergeImport } from "../server/import.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(
  root,
  process.argv.slice(2).find((arg) => !arg.startsWith("--")) ||
    "RealEstateAgency/agency_data.json",
);
const data = adaptLegacyData(JSON.parse(await readFile(source, "utf8")));
const store = createSupabaseStore();
try {
  const report = process.argv.includes("--dry-run")
    ? mergeImport(await store.read(), data)
    : await store.mutate((state) => mergeImport(state, data));
  console.log(
    JSON.stringify(
      { dryRun: process.argv.includes("--dry-run"), ...report },
      null,
      2,
    ),
  );
  console.log(
    "Legacy client type 2 is ambiguous (tenant/owner); review these clients in the CRM.",
  );
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
