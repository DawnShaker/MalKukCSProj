import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const dll = join(root, 'RealEstateAgency/bin/Debug/net10.0/RealEstateAgency.dll');
if (!existsSync(dll)) throw new Error('First run npm run agency:build.');
const cloud = process.argv.includes('--cloud-security');
function settings(name) {
  const path = join(root, '.local', name);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')) : {};
}
const admin = settings('security-config.json');
const jwt = cloud ? settings('security-cloud.json') : admin;
const deployment = settings('deployment-state.json');
const database = join(root, '.local/agency.db');
const runtime = join(root, '.local/agency-runtime');
mkdirSync(runtime, { recursive: true });
const env = {
  ...process.env,
  ASPNETCORE_ENVIRONMENT: process.env.ASPNETCORE_ENVIRONMENT || 'Development',
  ASPNETCORE_URLS: process.env.ASPNETCORE_URLS || 'http://127.0.0.1:5000',
  ConnectionStrings__Agency: process.env.ConnectionStrings__Agency || `Data Source=${database}`,
  Security__Url: process.env.Security__Url || process.env.SECURITY_AUTH_URL || (cloud ? deployment.render?.url : 'http://127.0.0.1:5252') || '',
  Security__JwtKey: process.env.Security__JwtKey || process.env.SECURITY_JWT_KEY || jwt.Jwt__Key || '',
  Security__Issuer: process.env.Security__Issuer || process.env.SECURITY_JWT_ISSUER || jwt.Jwt__Issuer || 'real-estate-security',
  Security__Audience: process.env.Security__Audience || process.env.SECURITY_JWT_AUDIENCE || jwt.Jwt__Audience || 'real-estate-agency',
  Security__BootstrapManagerUsername: process.env.Security__BootstrapManagerUsername || process.env.BOOTSTRAP_MANAGER_USERNAME || admin.BootstrapAdmin__Username || '',
};
if (!env.Security__JwtKey || !env.Security__BootstrapManagerUsername)
  throw new Error('Run npm run security:prepare or configure Security__JwtKey and Security__BootstrapManagerUsername.');
if (!existsSync(database) && !process.env.ConnectionStrings__Agency) {
  const imported = spawnSync('dotnet', [dll, '--import-json', join(root, 'RealEstateAgency/agency_data.json')], { cwd: runtime, env, stdio: 'inherit', windowsHide: true });
  if (imported.status !== 0) process.exit(imported.status ?? 1);
}
console.log(`Agency: ${env.ASPNETCORE_URLS}; Security: ${env.Security__Url}`);
const child = spawn('dotnet', [dll], { cwd: runtime, env, stdio: 'inherit', windowsHide: true });
process.on('SIGINT', () => child.kill());
process.on('SIGTERM', () => child.kill());
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('exit', code => { process.exitCode = code ?? 0; });
