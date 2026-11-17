import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { emptyState, normalizeState } from './store.mjs';

// Development only. This module is deliberately not imported by Netlify Functions.
export function createLocalStore(file, initial = emptyState()) {
  let queue = Promise.resolve();
  async function read() {
    try { return normalizeState(JSON.parse(await readFile(file, 'utf8'))); }
    catch (error) {
      if (error.code === 'ENOENT') return normalizeState(structuredClone(initial));
      throw error;
    }
  }
  return {
    kind: 'local', read,
    mutate(operation) {
      const pending = queue.then(async () => {
        const state = await read();
        const result = operation(state);
        await mkdir(dirname(file), { recursive: true });
        const temporary = `${file}.tmp`;
        await writeFile(temporary, JSON.stringify(state, null, 2), 'utf8');
        await rename(temporary, file);
        return result;
      });
      queue = pending.catch(() => {});
      return pending;
    },
  };
}
