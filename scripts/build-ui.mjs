import { build } from 'esbuild';
import Ajv from 'ajv';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { mkdir, writeFile, copyFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import schema from './design-schema.mjs';
import { themeSchema, layoutSchema } from './package-schemas.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(join(root, 'src/design'), { recursive: true });
await mkdir(join(root, 'public/design/presets'), { recursive: true });
const ajv = new Ajv({ allErrors: true, code: { source: true, esm: true } });
await writeFile(
  join(root, 'src/design/validate.generated.js'),
  standaloneCode(ajv, ajv.compile(schema)),
);
const legacyAjv = new Ajv({ allErrors: true, code: { source: true, esm: true } });
const legacySchema = JSON.parse(
  await readFile(join(root, 'scripts/design-schema-v1.json'), 'utf8'),
);
await writeFile(
  join(root, 'src/design/validate-v1.generated.js'),
  standaloneCode(legacyAjv, legacyAjv.compile(legacySchema)),
);
await writeFile(join(root, 'public/design/schema.json'), JSON.stringify(schema, null, 2));
const packagesAjv = new Ajv({ allErrors: true, code: { source: true, esm: true } });
packagesAjv.addSchema(themeSchema, 'theme').addSchema(layoutSchema, 'layout');
await writeFile(
  join(root, 'src/design/validate-packages.generated.js'),
  standaloneCode(packagesAjv, { validateTheme: 'theme', validateLayout: 'layout' }),
);
await writeFile(
  join(root, 'public/design/theme-schema.json'),
  JSON.stringify(themeSchema, null, 2),
);
await writeFile(
  join(root, 'public/design/layout-schema.json'),
  JSON.stringify(layoutSchema, null, 2),
);
const common = {
  absWorkingDir: root,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true,
  legalComments: 'eof',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
};
await build({
  ...common,
  entryPoints: ['src/design/core.ts'],
  outfile: 'public/design/core.js',
  platform: 'neutral',
});
await build({
  ...common,
  entryPoints: ['src/ui/index.tsx'],
  outfile: 'public/design/ui.js',
  platform: 'browser',
});
await writeFile(
  join(root, 'public/design/ui.css'),
  (await readFile(join(root, 'src/ui/styles.css'), 'utf8')) +
    '\n' +
    (await readFile(join(root, 'src/ui/cards-studio.css'), 'utf8')),
);
const licenses = await Promise.all(
  ['react', 'react-dom', 'ajv'].map(
    async (name) =>
      `${name}\n${await readFile(join(root, 'node_modules', name, 'LICENSE'), 'utf8')}`,
  ),
);
await writeFile(
  join(root, 'public/design/THIRD-PARTY.txt'),
  licenses.join('\n\n--------------------\n\n'),
);
for (const preset of ['premiere', 'obsidian', 'archive'])
  await copyFile(
    join(root, `designs/${preset}.json`),
    join(root, `public/design/presets/${preset}.json`),
  );
console.log('NetPlex Design: TypeScript/React, schema og presets er bygget.');
