import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSupabaseStore, normalizeState } from '../server/store.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = resolve(root, process.argv[2] || 'RealEstateAgency/agency_data.json');
const data = normalizeState(JSON.parse(await readFile(source, 'utf8')));
const store = createSupabaseStore();
try {
  await store.mutate(state => {
    if (Object.values(state).some(value => Array.isArray(value) && value.length)) {
      throw new Error('Import refused: the database already contains records. Existing data was preserved.');
    }
    Object.assign(state, structuredClone(data));
  });
  console.log(`Imported: ${data.properties.length} properties, ${data.clients.length} clients, ${data.agents.length} agents, ${data.deals.length} deals.`);
  console.log('Legacy client type 2 is ambiguous (tenant/owner); review these clients in the CRM.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
