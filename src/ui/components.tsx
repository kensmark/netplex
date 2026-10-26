import React, { useLayoutEffect, useRef, useState } from 'react';
import { fitCardColumns, CARD_SIZES, cardSizeIndex } from '../design/core';
import type {
  MediaItem,
  Card,
  CardElement,
  LayoutNode,
  Collections,
  Design,
  Route,
} from '../design/types';
export interface UIHost {
  artwork: (item: MediaItem, options?: { poster?: boolean; large?: boolean }) => string;
  icon: (name: string) => string;
  saved: Set<string>;
  route: Route;
  demo: boolean;
  globalQuery?: string;
  platform?: string;
}
function Icon({ name, host }: { name: string; host: UIHost }) {
  return <span className="np-icon" dangerouslySetInnerHTML={{ __html: host.icon(name) }} />;
}
const duration = (value: number) => {
  const minutes = Math.round(value / 60000);
  return `${Math.floor(minutes / 60) ? `${Math.floor(minutes / 60)} t ` : ''}${minutes % 60} min`;
};
function cardImage(node: CardElement): Extract<CardElement, { type: 'image' }> | undefined {
  return node.type === 'image'
    ? node
    : node.type === 'container'
      ? node.children.map(cardImage).find(Boolean)
      : undefined;
}
export function FilmCard({ item, card, host }: { item: MediaItem; card: Card; host: UIHost }) {
  const image = cardImage(card.template),
    ratio = image?.ratio || 'poster';
  const information = (
    <span className="np-card-info">
      <span className="film-title np-card-field">{item.title}</span>
      <span className="np-card-facts">
        {item.year > 0 && <span className="np-card-field np-field-year">{item.year}</span>}
        {item.rating > 0 && (
          <span
            className="np-card-field np-field-rating"
            aria-label={'Bedømmelse ' + item.rating.toFixed(1) + ' af 10'}
          >
            ★ {item.rating.toFixed(1)}
          </span>
        )}
      </span>
    </span>
  );
  return (
    <article
      className="film-card np-film-card np-simple-card np-presentation-overlay"
      style={{ '--np-card-radius': card.radius + 'px' } as React.CSSProperties}
    >
      <div className="np-card-root np-card-container np-card-column">
        <button
          className={'poster-button np-card-image np-ratio-' + ratio}
          data-detail={item.id}
          aria-label={'Se detaljer om ' + item.title}
        >
          <span className="np-card-visual">
            <span
              className="np-card-artwork"
              dangerouslySetInnerHTML={{
                __html: host.artwork(item, {
                  poster: !image || image.field === 'poster',
                  large: image?.field === 'backdrop',
                }),
              }}
            />
            <span className="np-card-shade" />
          </span>
          {information}
        </button>
        <button
          className="np-card-save np-card-action"
          data-save={item.id}
          data-saveid={item.id}
          aria-pressed={host.saved.has(item.id)}
          title={host.saved.has(item.id) ? 'Fjern fra din liste' : 'Gem på din liste'}
          aria-label={host.saved.has(item.id) ? 'Fjern fra din liste' : 'Gem på din liste'}
        >
          <Icon name={host.saved.has(item.id) ? 'check' : 'plus'} host={host} />
        </button>
      </div>
      {item.progress > 0 && !item.watched && (
        <span
          className="np-resume-progress"
          role="progressbar"
          aria-label="Afspilningsfremdrift"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(
            Math.min(100, item.duration ? (item.progress / item.duration) * 100 : 0),
          )}
        >
          <span
            style={{
              width: Math.min(100, item.duration ? (item.progress / item.duration) * 100 : 0) + '%',
            }}
          />
        </span>
      )}
    </article>
  );
}

export function FilmList({
  items,
  card,
  layout,
  host,
  label = 'film',
}: {
  items: MediaItem[];
  card: Card;
  layout: string;
  host: UIHost;
  label?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [perPage, setPerPage] = useState(1),
    [page, setPage] = useState(0);
  const identity = items.map((item) => item.id).join(',');
  useLayoutEffect(() => {
    if (!['row', 'grid'].includes(layout) || !viewport.current) return;
    const update = () => {
      const element = viewport.current;
      if (!element) return;
      const gap =
        parseFloat(
          getComputedStyle(
            layout === 'row' ? element.querySelector('.np-carousel-track')! : element,
          ).columnGap,
        ) || 24;
      const style = getComputedStyle(element),
        available =
          element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      setPerPage(fitCardColumns(available, gap, card.width));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, [layout, card]);
  useLayoutEffect(() => setPage(0), [identity]);
  const pages = Math.max(1, Math.ceil(items.length / perPage)),
    current = Math.min(page, pages - 1);
  const turn = (offset: number) => setPage((current + offset + pages) % pages);
  if (layout === 'row')
    return (
      <div className="np-carousel-shell" ref={viewport}>
        <div
          className="np-carousel"
          data-card-size={CARD_SIZES[cardSizeIndex(card.width)].width}
          data-carousel-page={current}
          data-carousel-pages={pages}
          onKeyDown={(event) => {
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
              event.preventDefault();
              turn(event.key === 'ArrowLeft' ? -1 : 1);
            }
          }}
        >
          <div
            className="np-carousel-track"
            style={
              {
                '--np-per-page': perPage,
                '--np-card-width': `${card.width}px`,
              } as React.CSSProperties
            }
          >
            {items.slice(current * perPage, (current + 1) * perPage).map((item) => (
              <FilmCard key={item.id} item={item} card={card} host={host} />
            ))}
          </div>
          {pages > 1 && (
            <>
              <button
                className="np-carousel-arrow np-carousel-prev"
                aria-label={`Vis forrige i ${label}`}
                onClick={() => turn(-1)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="m14 6-6 6 6 6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                className="np-carousel-arrow np-carousel-next"
                aria-label={`Vis næste i ${label}`}
                onClick={() => turn(1)}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="m10 6 6 6-6 6"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </>
          )}
          <span className="np-carousel-status" aria-live="polite">
            Side {current + 1} af {pages}
          </span>
        </div>
      </div>
    );
  return (
    <div
      className={`np-film-list np-layout-${layout === 'list' ? 'column' : layout}`}
      ref={viewport}
      data-card-size={CARD_SIZES[cardSizeIndex(card.width)].width}
      style={
        {
          '--np-card-width': `${CARD_SIZES[cardSizeIndex(card.width)].width}px`,
          '--np-card-columns': perPage,
        } as React.CSSProperties
      }
    >
      {items.map((item) => (
        <FilmCard key={item.id} item={item} card={card} host={host} />
      ))}
    </div>
  );
}
function Hero({ item, variant, host }: { item: MediaItem; variant: string; host: UIHost }) {
  return (
    <section className={`hero np-hero np-hero-${variant}`}>
      <div
        className="hero-image"
        dangerouslySetInnerHTML={{ __html: host.artwork(item, { large: true }) }}
      />
      <div className="hero-copy">
        <span className="eyebrow">UDVALGT FRA DIT BIBLIOTEK</span>
        <h1>{item.title}</h1>
        <div className="meta">
          <span>{item.year || ''}</span>
          <span>{duration(item.duration)}</span>
          <span>★ {item.rating?.toFixed(1)}</span>
          {item.genres.slice(0, 2).map((genre) => (
            <span key={genre}>{genre}</span>
          ))}
        </div>
        <p>{item.summary}</p>
        <div className="actions">
          <button
            className="btn btn-primary"
            {...(item.type === 'show' ? { 'data-detail': item.id } : { 'data-play': item.id })}
          >
            <Icon name="play" host={host} />
            {item.type === 'show' ? 'Se episoder' : item.progress ? 'Fortsæt filmen' : 'Afspil nu'}
          </button>
          <button className="btn btn-secondary" data-detail={item.id}>
            <Icon name="info" host={host} />
            Mere info
          </button>
          <button
            className="icon-btn"
            data-save={item.id}
            data-saveid={item.id}
            aria-label="Gem på min liste"
            aria-pressed={host.saved.has(item.id)}
          >
            <Icon name={host.saved.has(item.id) ? 'check' : 'bookmark'} host={host} />
          </button>
        </div>
        <div className="hero-index">
          <span>
            01 <small>/ UDVALGT</small>
          </span>
          <span className="hero-index-track" />
          <span>DIN EGEN FILMVERDEN</span>
        </div>
      </div>
    </section>
  );
}
export function Layout({
  node,
  collections,
  design,
  host,
}: {
  node: LayoutNode;
  collections: Collections;
  design: Design;
  host: UIHost;
}): React.ReactNode {
  if (node.type === 'container')
    return (
      <div
        data-module={node.id}
        className={`np-container np-container-${node.layout} np-section-${node.surface || 'none'}`}
        style={
          {
            gap: node.gap ?? design.theme.spacing,
            '--np-columns': node.columns || 2,
            '--np-section-gap': `${node.gap ?? design.theme.spacing}px`,
            '--np-column-tracks':
              node.columns === 2 && node.ratio === 'wide-left'
                ? '2fr 1fr'
                : node.columns === 2 && node.ratio === 'wide-right'
                  ? '1fr 2fr'
                  : `repeat(${node.columns || 2}, minmax(0, 1fr))`,
          } as React.CSSProperties
        }
      >
        {node.children.map((child) => (
          <Layout
            key={child.id}
            node={child}
            collections={collections}
            design={design}
            host={host}
          />
        ))}
      </div>
    );
  if (node.type === 'spacer')
    return <div data-module={node.id} style={{ height: node.height }} aria-hidden="true" />;
  if (node.type === 'text')
    return node.appearance === 'heading' ? (
      <h2 data-module={node.id} className="np-text-heading">
        {node.text}
      </h2>
    ) : (
      <p data-module={node.id} className={`np-text-${node.appearance}`}>
        {node.text}
      </p>
    );
  const result = collections[node.id] || { items: [], total: 0 };
  if (node.type === 'hero')
    return result.items[0] ? (
      <Hero item={result.items[0]} variant={node.variant} host={host} />
    ) : null;
  if (!result.items.length && node.empty === 'hide') return null;
  const card = design.cards.shared;
  return (
    <section className="shelf np-collection" data-module={node.id}>
      <div className="shelf-head">
        <div>
          <h2>{node.title}</h2>
          <span className="shelf-count">
            {result.total} {result.total === 1 ? 'titel' : 'titler'}
          </span>
        </div>
        {node.query.source !== 'continuing' && result.total > result.items.length && (
          <button className="text-button" data-collection={node.id}>
            Se alle <Icon name="arrow" host={host} />
          </button>
        )}
      </div>
      {result.items.length ? (
        <FilmList
          items={result.items}
          layout={node.layout}
          card={card}
          host={host}
          label={node.title}
        />
      ) : (
        <div className="np-empty">Ingen titler matcher denne kategori i dit bibliotek.</div>
      )}
    </section>
  );
}
export function Navigation({
  design,
  host,
  profile,
}: {
  design: Design;
  host: UIHost;
  profile: string;
}) {
  return (
    <>
      <button className="brand-button" data-route="home" aria-label="NetPlex forside">
        <span className="brand">
          Net<span>Plex</span>
          <b>.</b>
        </span>
      </button>
      <nav aria-label="Hovedmenu">
        {design.navigation.items.map((item) => (
          <button
            key={item.route}
            className={`nav-button ${host.route === item.route ? 'active' : ''}`}
            data-route={item.route}
          >
            {item.route === 'home' ? 'Forside' : item.route === 'saved' ? 'Din liste' : item.label}
          </button>
        ))}
      </nav>
      <div className="header-tools">
        <form
          className="header-search"
          id="global-search"
          role="search"
          aria-label="Søg i alle titler"
        >
          <Icon name="search" host={host} />
          <input
            id="global-query"
            type="search"
            aria-label="Søg i alle titler"
            placeholder="Søg efter titler, personer…"
            defaultValue={host.globalQuery || ''}
            autoComplete="off"
          />
          <kbd aria-hidden="true">{host.platform === 'darwin' ? '⌘ K' : 'Ctrl K'}</kbd>
        </form>
        <button
          className="icon-btn np-design-trigger"
          data-action="design-studio"
          aria-label="Tilpas design"
          title="Tilpas design"
        >
          <Icon name="sliders" host={host} />
        </button>
        <button className="icon-btn" data-action="settings" aria-label="Indstillinger">
          <Icon name="settings" host={host} />
        </button>
        <button
          className="profile-btn"
          data-action="settings"
          aria-label={`${profile} – indstillinger`}
        >
          <span className="avatar">{profile.slice(0, 1).toUpperCase()}</span>
        </button>
      </div>
    </>
  );
}
