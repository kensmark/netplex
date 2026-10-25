import React, { useEffect, useState } from 'react';
import { layoutPackage, themePackage, parseDesignFile, applyDesignFile } from '../design/core';
import type { Design } from '../design/types';
import { DesignStore } from './store';
export function download(name: string, content: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type })),
    anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function StudioJSON({
  design,
  store,
  onFeedback,
  onImport,
}: {
  design: Design;
  store: DesignStore;
  onFeedback: (text: string) => void;
  onImport: () => void;
}) {
  const [scope, setScope] = useState('theme'),
    [text, setText] = useState('');
  const output =
    scope === 'theme' ? themePackage(design) : scope === 'layout' ? layoutPackage(design) : design;
  useEffect(() => {
    setText(JSON.stringify(output, null, 2));
  }, [design, scope]);
  const importText = (source: string) => {
    try {
      let file = parseDesignFile(source);
      if (file.format === 'netplex.design' && scope !== 'all')
        file = scope === 'theme' ? themePackage(file) : layoutPackage(file);
      if (scope === 'theme' && file.format !== 'netplex.theme')
        throw new Error('Vælg Layout for at importere denne layoutfil.');
      if (scope === 'layout' && file.format !== 'netplex.layout')
        throw new Error('Vælg Tema for at importere denne temafil.');
      if (scope === 'all' && file.format !== 'netplex.design')
        throw new Error('Vælg Tema eller Layout for at importere en delvis fil.');
      store.preview(applyDesignFile(store.design, file));
      onImport();
      onFeedback(
        scope === 'theme'
          ? 'Temaet vises. Dine lister og filtre er bevaret.'
          : scope === 'layout'
            ? 'Layoutet vises. Farver og filmkort er bevaret.'
            : 'Hele opsætningen vises. Gem for at beholde den.',
      );
    } catch (error) {
      onFeedback((error as Error).message);
    }
  };
  return (
    <>
      <label className="studio-field">
        Del af opsætningen
        <select
          aria-label="JSON-indhold"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          <option value="theme">Tema · kun udseende</option>
          <option value="layout">Layout · lister og sektioner</option>
          <option value="all">Hele opsætningen · sikkerhedskopi</option>
        </select>
      </label>
      <p className="studio-hint">
        {scope === 'theme'
          ? 'Farver, skrifttype, filmkort og menuplacering. Ingen lister eller filmregler.'
          : scope === 'layout'
            ? 'Lister, kategoriregler, sektioner, menuindhold og bibliotekets visning. Ingen farver eller filmkort.'
            : 'Erstatter både layout og udseende. Brug Tema eller Layout for at ændre én del ad gangen.'}
      </p>
      <label className="studio-field">
        {scope === 'theme' ? 'Tema JSON' : scope === 'layout' ? 'Layout JSON' : 'Design JSON'}
        <textarea
          className="studio-json"
          aria-label={
            scope === 'theme' ? 'Tema JSON' : scope === 'layout' ? 'Layout JSON' : 'Design JSON'
          }
          value={text}
          spellCheck={false}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <button className="studio-primary" onClick={() => importText(text)}>
        Vis JSON i forhåndsvisning
      </button>
      <div className="studio-file-actions">
        <label className="studio-file">
          Importér JSON
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              if (file.size > 65536) {
                onFeedback('Filen må højst fylde 64 KB.');
                return;
              }
              importText(await file.text());
            }}
          />
        </label>
        <button
          onClick={() =>
            download(
              `${design.name.replace(/[^a-z0-9_-]/gi, '-')}${scope === 'all' ? '' : `.${scope}`}.netplex.json`,
              JSON.stringify(output, null, 2),
            )
          }
        >
          {scope === 'theme'
            ? 'Eksportér tema'
            : scope === 'layout'
              ? 'Eksportér layout'
              : 'Eksportér design'}
        </button>
        <button
          onClick={async () => {
            try {
              const schema = await (
                await fetch(`/design/${scope === 'all' ? 'schema' : `${scope}-schema`}.json`)
              ).json();
              download(
                'NetPlex-ChatGPT-guide.md',
                `# Tilpas mit NetPlex-${scope}\n\nReturnér kun gyldig JSON efter schemaet. Bevar format og formatVersion. Ingen HTML, CSS, JavaScript, URL'er eller Plex-login. Min ønskede ændring: [beskriv ændringen].\n\n## Min fil\n\n\`\`\`json\n${JSON.stringify(output, null, 2)}\n\`\`\`\n\n## Schema\n\n\`\`\`json\n${JSON.stringify(schema, null, 2)}\n\`\`\`\n`,
                'text/markdown',
              );
            } catch {
              onFeedback('Guiden kunne ikke hentes.');
            }
          }}
        >
          Hent guide til ChatGPT
        </button>
      </div>
      <p className="studio-hint">
        Ældre komplette designfiler kan også importeres her. Kun den valgte del anvendes. Plex-login
        og historik følger aldrig med i eksporten.
      </p>
    </>
  );
}
