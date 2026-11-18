import { spawn, spawnSync } from "node:child_process";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(
  await readFile(resolve(root, ".local/security-config.json"), "utf8").catch(
    () => {
      throw new Error("Run npm run security:prepare first.");
    },
  ),
);
const data = resolve(root, ".local/security-data");
await mkdir(data, { recursive: true });
const build = spawnSync(
  "dotnet",
  [
    "build",
    resolve(root, ".local/security-source/Security/Security.csproj"),
    "--nologo",
    "-v",
    "quiet",
  ],
  { cwd: root, stdio: "inherit" },
);
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
const child = spawn(
  "dotnet",
  [
    resolve(
      root,
      ".local/security-source/Security/bin/Debug/net10.0/Security.dll",
    ),
    "--urls",
    "http://127.0.0.1:5252",
  ],
  {
    cwd: data,
    stdio: "inherit",
    env: { ...process.env, ...config, ASPNETCORE_ENVIRONMENT: "Development" },
  },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
