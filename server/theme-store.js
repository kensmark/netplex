import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { validateDesignFile } from '../public/design/core.js';

export function openThemeStore(directory) {
  const file = join(directory, 'themes.json');
  let queue = Promise.resolve();
  const read = async () => {
    let entries;
    try {
      entries = JSON.parse(await readFile(file, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw new Error('Dine temaer kunne ikke læses. Den gemte fil er bevaret.');
    }
    if (!Array.isArray(entries) || entries.length > 50) throw new Error('Ugyldigt temabibliotek.');
    for (const entry of entries) {
      if (
        !/^[a-f0-9-]{36}$/.test(entry.id) ||
        validateDesignFile(entry.theme).format !== 'netplex.theme'
      )
        throw new Error('Ugyldigt tema.');
    }
    return entries;
  };
  const update = (change) => {
    const task = queue
      .catch(() => {})
      .then(async () => {
        const entries = await read(),
          result = change(entries);
        await mkdir(directory, { recursive: true });
        await writeFile(join(directory, 'themes.tmp'), JSON.stringify(entries, null, 2), {
          mode: 0o600,
        });
        await rename(join(directory, 'themes.tmp'), file);
        return result;
      });
    queue = task;
    return task;
  };
  return {
    read,
    async save(value) {
      const theme = validateDesignFile(value);
      if (theme.format !== 'netplex.theme')
        throw new Error('Importér en temafil i temabiblioteket.');
      return update((entries) => {
        if (entries.length >= 50) throw new Error('Du kan gemme højst 50 temaer.');
        const entry = { id: randomUUID(), theme: structuredClone(theme) };
        entries.push(entry);
        return entry;
      });
    },
    remove(id) {
      return update((entries) => {
        const index = entries.findIndex((entry) => entry.id === id);
        if (index >= 0) entries.splice(index, 1);
      });
    },
  };
}
