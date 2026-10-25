import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validateDesign, parseDesign } from '../public/design/core.js';
const defaultFile = new URL('../public/design/presets/premiere.json', import.meta.url);

export async function openDesignStore(directory) {
  const fallback = parseDesign(await readFile(defaultFile, 'utf8'));
  const file = join(directory, 'design.json');
  let queue = Promise.resolve();
  return {
    async read() {
      try {
        return { design: parseDesign(await readFile(file, 'utf8')) };
      } catch (error) {
        return {
          design: structuredClone(fallback),
          ...(error.code === 'ENOENT'
            ? {}
            : {
                recovery:
                  'Dit gemte design kunne ikke indlæses. NetPlex har åbnet Premiere; den oprindelige fil er bevaret.',
              }),
        };
      }
    },
    async save(value) {
      const data = JSON.stringify(validateDesign(value), null, 2);
      if (Buffer.byteLength(data) > 65536) throw new Error('Designfilen må højst fylde 64 KB.');
      const task = queue
        .catch(() => {})
        .then(async () => {
          await mkdir(directory, { recursive: true });
          try {
            const previous = await readFile(file, 'utf8');
            parseDesign(previous);
            await writeFile(join(directory, 'design.backup.json'), previous, { mode: 0o600 });
          } catch {
            /* Missing or invalid previous design. */
          }
          const temporary = join(directory, 'design.tmp');
          await writeFile(temporary, data, { mode: 0o600 });
          await rename(temporary, file);
        });
      queue = task;
      await task;
    },
  };
}
