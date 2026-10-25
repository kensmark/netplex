import React, { useEffect, useState, useSyncExternalStore } from 'react';
import { validateDesign } from '../design/core';
import type { CatalogFacets, Design, LayoutNode, Query } from '../design/types';
import { DesignStore } from './store';
import { findModule, LayoutTree, moduleLabel, moveModule } from './layout-tree';
import { MetadataPicker } from './metadata-picker';
import { CardsPanel, ThemePanel } from './studio-panels';
import { ThemeGallery } from './theme-gallery';
import { StudioJSON } from './studio-json';
import { categoryPresets } from './category-presets';

function YearInput({
  value,
  label,
  onCommit,
}: {
  value: number | undefined;
  label: string;
  onCommit: (value: number | undefined) => void;
}) {
  const [text, setText] = useState(String(value ?? ''));
  useEffect(() => setText(String(value ?? '')), [value]);
  return (
    <input
      aria-label={label}
      type="number"
      min={1800}
      max={2200}
      value={text}
      onChange={(event) => setText(event.target.value)}
      onBlur={() => onCommit(text ? Number(text) : undefined)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
      }}
    />
  );
}
const emptyCatalog: CatalogFacets = { types: [], genres: [], directors: [], actors: [] };
export function Studio({
  store,
  onClose,
  loadCatalog,
}: {
  store: DesignStore;
  onClose: () => void;
  loadCatalog: () => Promise<CatalogFacets>;
}) {
  const design = useSyncExternalStore(store.subscribe, store.snapshot);
  const [tab, setTab] = useState('layout'),
    [selected, setSelected] = useState(design.pages.home.id),
    [feedback, setFeedback] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [catalog, setCatalog] = useState(emptyCatalog),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    setSaved(false);
  }, [design]);
  useEffect(() => {
    let alive = true;
    void loadCatalog()
      .then((value) => {
        if (alive) setCatalog(value);
      })
      .catch(() => {
        if (alive)
          setFeedback(
            'Bibliotekets valgmuligheder kunne ikke indlæses. Luk og åbn Designstudio for at prøve igen.',
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [loadCatalog]);
  const attempt = (action: () => void) => {
    try {
      action();
      setFeedback('');
    } catch (error) {
      setFeedback((error as Error).message);
    }
  };
  const edit = (action: (draft: Design) => void) => attempt(() => store.edit(action));
  const node = findModule(design.pages.home, selected) || design.pages.home;
  const nodeEdit = (action: (node: LayoutNode) => void) =>
    edit((draft) => action(findModule(draft.pages.home, node.id) || draft.pages.home));
  const changeFilter = (key: keyof NonNullable<Query['filter']>, value: unknown) =>
    nodeEdit((n) => {
      if (!('query' in n)) return;
      n.query.filter = { ...n.query.filter, [key]: value };
      if (value === undefined) delete (n.query.filter as Record<string, unknown>)[key];
    });
  const categories = categoryPresets(catalog);
  const add = (type: 'collection' | 'text' | 'spacer') =>
    edit((draft) => {
      const parent = draft.pages.home;
      if (parent.type !== 'container')
        throw new Error('Forsidens rod skal være en container for at tilføje moduler.');
      const id = `module-${crypto.randomUUID().slice(0, 8)}`;
      const child: LayoutNode =
        type === 'collection'
          ? {
              id,
              type,
              title: 'Min kategori',
              query: { source: 'library', filter: { types: ['movie'] }, sort: 'added', limit: 12 },
              layout: 'row',
              empty: 'message',
            }
          : type === 'text'
            ? { id, type, text: 'Din overskrift', appearance: 'heading' }
            : { id, type, height: 32 };
      parent.children.push(child);
      setSelected(id);
    });
  const remove = (id: string) =>
    edit((draft) => {
      if (id === draft.pages.home.id) return;
      const visit = (n: LayoutNode) => {
        if (n.type === 'container') {
          n.children = n.children.filter((child) => child.id !== id);
          n.children.forEach(visit);
        }
      };
      visit(draft.pages.home);
      setSelected(draft.pages.home.id);
    });
  return (
    <aside className="design-studio" aria-label="Designstudio">
      <header className="studio-header">
        <div>
          <span className="studio-eyebrow">NETPLEX STUDIO</span>
          <h2>Gør det til dit.</h2>
        </div>
        <button
          className="studio-close"
          aria-label="Luk designstudio"
          onClick={() => {
            store.discard();
            onClose();
          }}
        >
          ×
        </button>
      </header>
      <div className="studio-preview-note">
        <span className="dot live-dot" />
        Live forhåndsvisning
      </div>
      <div className="studio-history">
        <button disabled={!store.past.length} onClick={() => store.undo()}>
          ↶ Fortryd ændring
        </button>
        <button disabled={!store.future.length} onClick={() => store.redo()}>
          ↷ Gentag
        </button>
      </div>
      <nav className="studio-tabs" aria-label="Designtilpasning">
        {[
          ['layout', 'Layout'],
          ['themes', 'Temaer'],
          ['theme', 'Tilpas'],
          ['cards', 'Filmkort'],
          ['json', 'JSON'],
        ].map(([key, label]) => (
          <button key={key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>
      <div className="studio-body">
        {tab === 'layout' && (
          <>
            <p className="studio-hint">
              Layout styrer dine lister, filmregler og rækkefølge. Skift udseende separat under
              Temaer.
            </p>
            <label className="studio-field">
              Bibliotekets visning
              <select
                aria-label="Bibliotekets visning"
                value={design.library.layout}
                onChange={(event) =>
                  edit((draft) => {
                    draft.library.layout = event.target.value as 'grid';
                  })
                }
              >
                <option value="grid">Plakatgitter</option>
                <option value="row">Vandret karrusel</option>
              </select>
            </label>
            <LayoutTree
              design={design}
              selected={node.id}
              onSelect={setSelected}
              onMove={(source, target, edge) =>
                edit((draft) => moveModule(draft, source, target, edge))
              }
              onAdd={add}
              onRemove={remove}
            />
            <section className="studio-properties" hidden={node.id === design.pages.home.id}>
              <h3>{moduleLabel(node)}</h3>
              {node.type === 'text' && (
                <>
                  <label className="studio-field">
                    Tekst
                    <textarea
                      value={node.text}
                      onChange={(event) =>
                        nodeEdit((n) => {
                          if (n.type === 'text') n.text = event.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="studio-field">
                    Type
                    <select
                      value={node.appearance}
                      onChange={(event) =>
                        nodeEdit((n) => {
                          if (n.type === 'text') n.appearance = event.target.value as 'heading';
                        })
                      }
                    >
                      <option value="heading">Overskrift</option>
                      <option value="eyebrow">Lille overskrift</option>
                      <option value="body">Brødtekst</option>
                    </select>
                  </label>
                </>
              )}
              {node.type === 'spacer' && (
                <label className="studio-field">
                  Højde
                  <input
                    type="range"
                    min={0}
                    max={240}
                    value={node.height}
                    onChange={(event) =>
                      nodeEdit((n) => {
                        if (n.type === 'spacer') n.height = Number(event.target.value);
                      })
                    }
                  />
                </label>
              )}
              {node.type === 'hero' && (
                <label className="studio-field">
                  Visning
                  <select
                    value={node.variant}
                    onChange={(event) =>
                      nodeEdit((n) => {
                        if (n.type === 'hero') n.variant = event.target.value as 'split';
                      })
                    }
                  >
                    <option value="cinematic">Filmisk</option>
                    <option value="split">Opdelt</option>
                    <option value="compact">Kompakt</option>
                  </select>
                </label>
              )}
              {node.type === 'collection' && (
                <>
                  <label className="studio-field">
                    Brug færdig kategori
                    <select
                      aria-label="Brug færdig kategori"
                      value=""
                      onChange={(event) => {
                        const preset = categories.find((p) => p.id === event.target.value);
                        if (preset)
                          nodeEdit((n) => {
                            if (n.type === 'collection') {
                              n.title = preset.title;
                              n.query = structuredClone(preset.query);
                            }
                          });
                      }}
                    >
                      <option value="">Vælg regler fra en skabelon…</option>
                      {categories.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="studio-field">
                    Kategoriens navn
                    <input
                      aria-label="Kategoriens navn"
                      value={node.title}
                      onChange={(event) =>
                        nodeEdit((n) => {
                          if (n.type === 'collection') n.title = event.target.value;
                        })
                      }
                    />
                  </label>
                  <label className="studio-field">
                    Visning
                    <select
                      value={node.layout}
                      onChange={(event) =>
                        nodeEdit((n) => {
                          if (n.type === 'collection') n.layout = event.target.value as 'grid';
                        })
                      }
                    >
                      <option value="row">Vandret karrusel</option>
                      <option value="grid">Plakatgitter</option>
                      <option value="column">Lodret plakatkolonne</option>
                    </select>
                  </label>
                  <label className="studio-field">
                    Når kategorien er tom
                    <select
                      value={node.empty}
                      onChange={(event) =>
                        nodeEdit((n) => {
                          if (n.type === 'collection') n.empty = event.target.value as 'hide';
                        })
                      }
                    >
                      <option value="hide">Skjul kategorien</option>
                      <option value="message">Vis en besked</option>
                    </select>
                  </label>
                </>
              )}
              {'query' in node && (
                <>
                  <div className="studio-section-label">FILMREGLER</div>
                  <label className="studio-field">
                    Indhold
                    <select
                      value={node.query.source}
                      onChange={(event) =>
                        nodeEdit((n) => {
                          if ('query' in n) n.query.source = event.target.value as 'library';
                        })
                      }
                    >
                      <option value="library">Hele biblioteket</option>
                      <option value="continuing">Fortsæt med at se</option>
                      <option value="saved">Min liste</option>
                    </select>
                  </label>
                  <MetadataPicker
                    label="Medietype"
                    options={catalog.types}
                    selected={node.query.filter?.types || []}
                    labels={{ movie: 'Film', show: 'Serier', episode: 'Episoder' }}
                    loading={loading}
                    onChange={(values) => changeFilter('types', values)}
                  />
                  <MetadataPicker
                    label="Genrer"
                    options={catalog.genres}
                    selected={node.query.filter?.genres || []}
                    loading={loading}
                    onChange={(values) => changeFilter('genres', values)}
                  />
                  <MetadataPicker
                    label="Instruktører"
                    options={catalog.directors}
                    selected={node.query.filter?.directors || []}
                    loading={loading}
                    onChange={(values) => changeFilter('directors', values)}
                  />
                  <MetadataPicker
                    label="Medvirkende"
                    options={catalog.actors}
                    selected={node.query.filter?.actors || []}
                    loading={loading}
                    onChange={(values) => changeFilter('actors', values)}
                  />
                  <p className="studio-hint">
                    Kun navne fra dit bibliotek. En titel skal matche mindst ét valg i hver udfyldt
                    liste.
                  </p>
                  <div className="studio-pair">
                    <label className="studio-field">
                      Fra år
                      <YearInput
                        key={node.id + '-from'}
                        label="Fra år"
                        value={node.query.filter?.year?.gte}
                        onCommit={(value) => {
                          const year = { ...node.query.filter?.year };
                          if (value === undefined) delete year.gte;
                          else year.gte = value;
                          changeFilter('year', year);
                        }}
                      />
                    </label>
                    <label className="studio-field">
                      Før år
                      <YearInput
                        key={node.id + '-before'}
                        label="Før år"
                        value={node.query.filter?.year?.lt}
                        onCommit={(value) => {
                          const year = { ...node.query.filter?.year };
                          if (value === undefined) delete year.lt;
                          else year.lt = value;
                          changeFilter('year', year);
                        }}
                      />
                    </label>
                  </div>
                  <label className="studio-check">
                    <input
                      type="checkbox"
                      checked={Boolean(node.query.filter?.unwatched)}
                      onChange={(event) => changeFilter('unwatched', event.target.checked)}
                    />
                    Kun usete titler
                  </label>
                  <label className="studio-field">
                    Sortering
                    <select
                      value={node.query.sort || 'added'}
                      onChange={(event) =>
                        nodeEdit((n) => {
                          if ('query' in n) n.query.sort = event.target.value as 'added';
                        })
                      }
                    >
                      {[
                        ['added', 'Senest tilføjet'],
                        ['title', 'Titel A–Å'],
                        ['year', 'Nyeste først'],
                        ['oldest', 'Ældste først'],
                        ['rating', 'Højest vurderet'],
                        ['duration', 'Korteste først'],
                      ].map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="studio-field">
                    Antal titler
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={node.query.limit || 18}
                      onChange={(event) =>
                        nodeEdit((n) => {
                          if ('query' in n) n.query.limit = Number(event.target.value);
                        })
                      }
                    />
                  </label>
                </>
              )}
            </section>
          </>
        )}
        {tab === 'themes' && (
          <ThemeGallery store={store} design={design} onFeedback={setFeedback} />
        )}
        {tab === 'theme' && <ThemePanel design={design} edit={edit} />}
        {tab === 'cards' && <CardsPanel design={design} edit={edit} />}
        {tab === 'json' && (
          <StudioJSON
            design={design}
            store={store}
            onFeedback={setFeedback}
            onImport={() => setSelected(store.design.pages.home.id)}
          />
        )}
        {feedback && (
          <div className="studio-feedback" role="status">
            {feedback}
          </div>
        )}
        {saved && (
          <div className="studio-feedback" role="status">
            Designet er gemt på denne computer.
          </div>
        )}
      </div>
      <footer className="studio-footer">
        <button
          onClick={() => {
            store.discard();
            onClose();
          }}
        >
          Annullér
        </button>
        <button
          disabled={busy}
          className="studio-primary"
          onClick={async () => {
            setBusy(true);
            try {
              validateDesign(store.design);
              await store.save();
              setSaved(true);
              setFeedback('');
            } catch (error) {
              setFeedback((error as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Gemmer…' : 'Gem design'}
        </button>
      </footer>
    </aside>
  );
}
