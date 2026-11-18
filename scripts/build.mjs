import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../client-app/", import.meta.url));
// npm_execpath works both on Windows (npm.cmd) and Netlify's Linux build image.
const npm = process.env.npm_execpath;
if (!npm) throw new Error("Run this script with npm run build.");
for (const args of [
  ["ci", "--no-audit", "--no-fund"],
  ["run", "build"],
]) {
  const result = spawnSync(process.execPath, [npm, ...args], {
    cwd,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
