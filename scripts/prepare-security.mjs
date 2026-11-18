import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
const target = resolve(root, ".local/security-source");
const revision = "6e4bb988130137749954a08ef813d03a7b11ea4a";
const repository = "https://github.com/negativchik09/Security.git";
function git(args, cwd = root) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`Git failed: ${result.stderr.trim()}`);
  return result.stdout.trimEnd();
}
await mkdir(resolve(root, ".local"), { recursive: true });
if (!existsSync(target)) {
  git(["clone", "--filter=blob:none", "--no-checkout", repository, target]);
  git(
    [
      "sparse-checkout",
      "set",
      "--no-cone",
      "/Security/",
      "!/Security/bin/",
      "!/Security/obj/",
    ],
    target,
  );
  git(["checkout", "--detach", revision], target);
}
if (
  git(["remote", "get-url", "origin"], target) !== repository ||
  git(["rev-parse", "HEAD"], target) !== revision
)
  throw new Error(
    "Unexpected Security checkout. Preserve it and choose a clean .local/security-source directory.",
  );
const seed = await readFile(
  resolve(root, "integrations/security/Seed.cs"),
  "utf8",
);
const originalProgram = git(["show", "HEAD:Security/Program.cs"], target);
if (!originalProgram.includes("ValidateLifetime = false"))
  throw new Error("Unexpected upstream authentication configuration");
const program = originalProgram
  .replace("ValidateLifetime = false", "ValidateLifetime = true")
  .replace(
    "var builder = WebApplication.CreateBuilder(args);",
    `var builder = WebApplication.CreateBuilder(args);
builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(Directory.GetCurrentDirectory(), "keys")));
if (Encoding.UTF8.GetByteCount(builder.Configuration["Jwt:Key"] ?? "") < 32)
    throw new InvalidOperationException("Configure a private Jwt__Key of at least 32 bytes.");`,
  )
  .replace(
    "using System.Text;",
    "using System.Text;\nusing Microsoft.AspNetCore.DataProtection;",
  );
const originalSettings = git(
  ["show", "HEAD:Security/appsettings.json"],
  target,
);
const settings = JSON.parse(originalSettings.replace(/^\uFEFF/, ""));
delete (settings.Jwt || settings.JWT || {}).Key;
const originalProject = git(["show", "HEAD:Security/Security.csproj"], target);
const project = originalProject
  .replace("net8.0", "net10.0")
  .replace(
    /(<PackageReference Include="Microsoft\.[^"]+" Version=")[^"]+/g,
    (_, prefix) => prefix + "10.0.15",
  )
  .replace(
    /\s*<PackageReference Include="Microsoft.EntityFrameworkCore.SqlServer"[^>]*\/>/,
    "",
  )
  .replace(
    /<PackageReference Include="Microsoft.EntityFrameworkCore.Tools"/g,
    '<PackageReference Include="Microsoft.EntityFrameworkCore.Design"',
  );
const desired = {
  "Security/Program.cs": program,
  "Security/Auth/Seed.cs": seed,
  "Security/appsettings.json": JSON.stringify(settings, null, 2) + "\n",
  "Security/Security.csproj": project,
};
const normalized = (text) => text.replaceAll("\r", "").trimEnd();
for (const [path, value] of Object.entries(desired)) {
  const current = normalized(await readFile(resolve(target, path), "utf8"));
  const original = normalized(git(["show", `HEAD:${path}`], target));
  if (current !== original && current !== normalized(value))
    throw new Error(`Preserving unexpected local edits: ${path}`);
}
for (const [path, value] of Object.entries(desired))
  await writeFile(resolve(target, path), value, "utf8");
const configPath = resolve(root, ".local/security-config.json");
let config;
if (existsSync(configPath))
  config = JSON.parse(await readFile(configPath, "utf8"));
else {
  const usernameIndex = process.argv.indexOf("--username");
  const username =
    usernameIndex < 0 ? "owner@example.com" : process.argv[usernameIndex + 1];
  if (!username || username.length > 200 || /[\r\n\0]/.test(username))
    throw new Error("Specify a valid bootstrap username");
  config = {
    Jwt__Key: randomBytes(48).toString("hex"),
    Jwt__Issuer: "real-estate-security",
    Jwt__Audience: "real-estate-agency",
    BootstrapAdmin__Username: username,
    BootstrapAdmin__Password: randomBytes(24).toString("base64url"),
  };
  await writeFile(configPath, JSON.stringify(config, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
}
if (
  Object.entries(config).some(
    ([key, value]) =>
      !/^[A-Za-z_]+$/.test(key) ||
      typeof value !== "string" ||
      /[\r\n\0]/.test(value),
  )
)
  throw new Error("Invalid local Security configuration");
await writeFile(
  resolve(root, ".local/security-server.env"),
  Object.entries(config)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n") + "\n",
  { mode: 0o600 },
);
console.log(
  `Prepared Security ${revision.slice(0, 7)} with private bootstrap configuration in .local/security-config.json. Secrets were not printed. Existing keys and passwords were preserved.`,
);
