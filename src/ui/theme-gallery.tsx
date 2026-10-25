import React, { useEffect, useState } from 'react';
import { parseDesignFile, themePackage, validateDesignFile } from '../design/core';
import type { Design, SavedTheme, ThemePackage } from '../design/types';
import { builtinThemes, DesignStore } from './store';
export function ThemeGallery({
  store,
  design,
  onFeedback,
}: {
  store: DesignStore;
  design: Design;
  onFeedback: (value: string) => void;
}) {
  const [saved, setSaved] = useState<SavedTheme[]>([]),
    [name, setName] = useState('Mit tema'),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void store
      .themes()
      .then((value) => {
        if (active) setSaved(value);
      })
      .catch((error) => {
        if (active) onFeedback(error.message);
      });
    return () => {
      active = false;
    };
  }, [store]);
  const add = async (theme: ThemePackage) => {
    setBusy(true);
    try {
      const entry = await store.saveTheme(validateDesignFile(theme) as ThemePackage);
      setSaved((list) => [...list, entry]);
      onFeedback('Temaet er føjet til Dine temaer. Dit layout er uændret.');
    } catch (error) {
      onFeedback((error as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const tile = (theme: ThemePackage, id: string) => {
    const selected =
      JSON.stringify([design.theme, design.cards, design.navigation.position]) ===
      JSON.stringify([theme.theme, theme.cards, theme.navigation.position]);
    return (
      <button
        key={id}
        className={`studio-theme-tile ${selected ? 'selected' : ''}`}
        aria-label={`Brug temaet ${theme.name}`}
        aria-pressed={selected}
        onClick={() => {
          store.applyTheme(theme);
          onFeedback(
            `${theme.name} vises nu. Dine lister og dit layout er bevaret. Gem for at beholde ændringen.`,
          );
        }}
      >
        <span
          className={`studio-theme-mini ${theme.navigation.position === 'left' ? 'has-sidebar' : ''}`}
          style={{ background: theme.theme.background, color: theme.theme.text }}
        >
          <span className="studio-theme-mini-nav" style={{ background: theme.theme.surface }} />
          <span className="studio-theme-mini-title" style={{ background: theme.theme.accent }} />
          <span className="studio-theme-mini-cards">
            {[0, 1, 2].map((i) => (
              <i
                key={i}
                style={{
                  background: `linear-gradient(${30 + i * 40}deg,${theme.theme.surface},${theme.theme.accent}80)`,
                  borderRadius: Math.min(theme.cards.shared.radius, 8),
                  aspectRatio: JSON.stringify(theme.cards.shared.template).includes(
                    '"ratio":"poster"',
                  )
                    ? '2/3'
                    : '16/9',
                }}
              />
            ))}
          </span>
        </span>
        <strong>{theme.name}</strong>
        <small>
          {theme.navigation.position === 'left' ? 'Sidemenu' : 'Topmenu'} ·{' '}
          {theme.cards.shared.radius ? 'Bløde' : 'Skarpe'} hjørner
        </small>
      </button>
    );
  };
  return (
    <>
      <p className="studio-hint">
        Skift farver, skrifttype, filmkort og menuplacering. Dine lister, filtre og sektioner
        bliver, hvor de er.
      </p>
      <h3 className="studio-section-label">NETPLEX-TEMAER</h3>
      <div className="studio-theme-grid">
        {builtinThemes.map((theme, index) => tile(theme, `builtin-${index}`))}
      </div>
      <h3 className="studio-section-label">DINE TEMAER</h3>
      {!saved.length && (
        <p className="studio-hint">
          Gem dit nuværende udseende som et tema, eller importér et tema fra en ven.
        </p>
      )}
      <div className="studio-theme-grid">
        {saved.map((entry) => (
          <div className="studio-user-theme" key={entry.id}>
            {tile(entry.theme, entry.id)}
            <button
              className="studio-theme-remove"
              aria-label={`Slet temaet ${entry.theme.name}`}
              onClick={async () => {
                try {
                  await store.deleteTheme(entry.id);
                  setSaved((list) => list.filter((t) => t.id !== entry.id));
                  onFeedback('Temaet er fjernet fra biblioteket. Det aktive udseende er uændret.');
                } catch (error) {
                  onFeedback((error as Error).message);
                }
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <label className="studio-field">
        Temaets navn
        <input
          aria-label="Temaets navn"
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <div className="studio-file-actions">
        <button
          disabled={busy || !name.trim()}
          onClick={() => void add(themePackage(design, name.trim()))}
        >
          Gem som tema
        </button>
        <label className="studio-file">
          Importér tema
          <input
            type="file"
            accept=".json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              try {
                if (file.size > 65536) throw new Error('Temafilen må højst fylde 64 KB.');
                const value = parseDesignFile(await file.text());
                if (value.format === 'netplex.layout')
                  throw new Error('Dette er en layoutfil. Importér den under JSON → Layout.');
                await add(value.format === 'netplex.design' ? themePackage(value) : value);
              } catch (error) {
                onFeedback((error as Error).message);
              }
            }}
          />
        </label>
      </div>
      <p className="studio-hint">
        Dine temaer gemmes separat fra det aktive design. Farver og kort kan finjusteres under
        Tilpas og Filmkort.
      </p>
    </>
  );
}
