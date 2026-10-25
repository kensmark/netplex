import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { DesignStore } from './store';
import { Layout, FilmList, Navigation, type UIHost } from './components';
import { Studio } from './studio';
import { resolveCollections, queryItems, catalogFacets } from '../design/core';
import type {
  Design,
  Collections,
  MediaItem,
  Catalog,
  Query,
  CatalogFacets,
} from '../design/types';

type API = ConstructorParameters<typeof DesignStore>[0];
export function initDesignUI({
  api,
  host,
  onChange,
  loadCatalog,
}: {
  api: API;
  host: () => UIHost;
  onChange: () => void;
  loadCatalog: () => Promise<CatalogFacets>;
}) {
  const store = new DesignStore(api);
  const contentRoots = new Map<Element, Root>();
  let nav: Root | null = null,
    studio: Root | null = null,
    studioElement: HTMLElement | null = null;
  let homeView: { element: Element; collections: Collections } | null = null;
  let cardsView: { element: Element; items: MediaItem[] } | null = null;
  let profile = 'Min profil';
  const signature = (design: Design) => {
    const entries: [string, Query][] = [];
    const visit = (node: Design['pages']['home']) => {
      if ('query' in node) entries.push([node.id, node.query]);
      if (node.type === 'container') node.children.forEach(visit);
    };
    visit(design.pages.home);
    return JSON.stringify(entries.sort(([a], [b]) => a.localeCompare(b)));
  };
  let querySignature = signature(store.design);
  function viewport() {
    const nodes = [...document.querySelectorAll<HTMLElement>('#main-content [data-module]')].filter(
      (node) => !node.classList.contains('np-container'),
    );
    const anchor =
      nodes.find((node) => {
        const rect = node.getBoundingClientRect();
        return rect.top < 160 && rect.bottom > 160;
      }) || nodes.find((node) => node.getBoundingClientRect().top >= 0);
    return { y: scrollY, id: anchor?.dataset.module, top: anchor?.getBoundingClientRect().top };
  }
  function restore(position: ReturnType<typeof viewport>) {
    const anchor = position.id
      ? [...document.querySelectorAll<HTMLElement>('#main-content [data-module]')].find(
          (node) => node.dataset.module === position.id,
        )
      : null;
    window.scrollTo({
      top:
        position.y +
        (anchor && position.top !== undefined
          ? anchor.getBoundingClientRect().top - position.top
          : 0),
      behavior: 'instant',
    });
  }
  function theme(design: Design) {
    const values = {
      '--bg': design.theme.background,
      '--soft': design.theme.surface,
      '--surface': design.theme.surface,
      '--text': design.theme.text,
      '--muted': design.theme.muted,
      '--accent': design.theme.accent,
      '--accent-hover': design.theme.accent,
      '--np-radius': '6px',
      '--np-card-radius': `${design.cards.shared.radius}px`,
      '--np-spacing': `${design.theme.spacing}px`,
      '--np-content-width': 'none',
      '--np-font':
        design.theme.font === 'serif'
          ? 'Georgia, Cambria, serif'
          : design.theme.font === 'unbounded'
            ? "'Unbounded Variable', system-ui, sans-serif"
            : 'system-ui, sans-serif',
    };
    for (const [name, value] of Object.entries(values))
      document.documentElement.style.setProperty(name, value);
    document.body.dataset.navigation = design.navigation.position;
    document.body.classList.add('np-designed');
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', design.theme.background);
  }
  function render(element: Element, view: React.ReactNode) {
    let root = contentRoots.get(element);
    if (!root) {
      root = createRoot(element);
      contentRoots.set(element, root);
    }
    flushSync(() => root.render(view));
  }
  let timer: ReturnType<typeof setTimeout>;
  store.subscribe(() => {
    const position = viewport();
    theme(store.design);
    if (nav)
      flushSync(() =>
        nav!.render(<Navigation design={store.design} host={host()} profile={profile} />),
      );
    if (homeView?.element.isConnected)
      render(
        homeView.element,
        <Layout
          node={store.design.pages.home}
          collections={homeView.collections}
          design={store.design}
          host={host()}
        />,
      );
    if (cardsView?.element.isConnected)
      render(
        cardsView.element,
        <FilmList
          items={cardsView.items}
          card={store.design.cards.shared}
          layout={store.design.library.layout}
          host={host()}
          label="biblioteket"
        />,
      );
    restore(position);
    const next = signature(store.design);
    if (next !== querySignature) {
      querySignature = next;
      clearTimeout(timer);
      if (homeView || cardsView) timer = setTimeout(onChange, 180);
    }
  });
  return {
    get design() {
      return store.design;
    },
    get querySignature() {
      return querySignature;
    },
    facets(items: MediaItem[]) {
      return catalogFacets(items);
    },
    async load() {
      await store.load();
      theme(store.design);
      return store.recovery;
    },
    resolve(catalog: Catalog) {
      return resolveCollections(store.design, catalog);
    },
    refresh() {
      store.notify();
    },
    filter(items: MediaItem[], query: Query) {
      return queryItems(items, { ...query, limit: items.length }).items;
    },
    collection(id: string | null) {
      if (!id) return null;
      const find = (
        node: Design['pages']['home'],
      ): { id: string; title: string; query: Query } | null =>
        node.id === id && node.type === 'collection'
          ? { id: node.id, title: node.title, query: node.query }
          : node.type === 'container'
            ? node.children.map(find).find(Boolean) || null
            : null;
      return find(store.design.pages.home) || null;
    },
    unmount() {
      for (const root of contentRoots.values()) root.unmount();
      contentRoots.clear();
      homeView = null;
      cardsView = null;
    },
    unmountNavigation() {
      nav?.unmount();
      nav = null;
    },
    navigation(element: HTMLElement, name: string) {
      profile = name;
      if (!nav) nav = createRoot(element);
      flushSync(() =>
        nav!.render(<Navigation design={store.design} host={host()} profile={profile} />),
      );
    },
    home(element: Element, collections: Collections) {
      const position = viewport();
      homeView = { element, collections };
      cardsView = null;
      render(
        element,
        <Layout
          node={store.design.pages.home}
          collections={collections}
          design={store.design}
          host={host()}
        />,
      );
      restore(position);
    },
    cards(element: Element, items: MediaItem[]) {
      const position = viewport();
      cardsView = { element, items };
      homeView = null;
      render(
        element,
        <FilmList
          items={items}
          card={store.design.cards.shared}
          layout={store.design.library.layout}
          host={host()}
          label="biblioteket"
        />,
      );
      restore(position);
    },
    openStudio() {
      if (studio) return;
      studioElement = document.createElement('div');
      document.body.append(studioElement);
      document.body.classList.add('design-editing');
      const close = () => {
        studio?.unmount();
        studio = null;
        studioElement?.remove();
        studioElement = null;
        document.body.classList.remove('design-editing');
        document.querySelector<HTMLElement>('[data-action="design-studio"]')?.focus();
      };
      studio = createRoot(studioElement);
      flushSync(() =>
        studio!.render(<Studio store={store} onClose={close} loadCatalog={loadCatalog} />),
      );
    },
  };
}
