import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run npm run agency:build.');
for (const [command, args] of [
  [process.execPath, [npm, 'run', 'build']],
  ['dotnet', ['build', 'RealEstateAgency/RealEstateAgency.csproj']],
]) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
