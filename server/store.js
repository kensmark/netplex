import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function openStore(directory) {
  await mkdir(directory, { recursive: true });
  const file = join(directory, 'settings.json');
  let state;
  try { state = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('NetPlex kunne ikke læse sine lokale indstillinger. Gendan .netplex/settings.json fra en sikkerhedskopi.'); }
  state ||= { version: 1, clientId: randomUUID(), connection: null, account: null, lists: {} };
  if (!state.clientId || !state.lists) throw new Error('NetPlex-indstillingerne er ugyldige.');
  let queue = Promise.resolve();
  return {
    state,
    save() {
      const snapshot = JSON.stringify(state, null, 2);
      queue = queue.catch(() => {}).then(async () => {
        const temporary = join(directory, 'settings.tmp');
        await writeFile(temporary, snapshot, { mode: 0o600 });
        await rename(temporary, file);
      });
      return queue;
    },
  };
}
