import validateSchema from './validate.generated.js';
import validateLegacySchema from './validate-v1.generated.js';
import { validateTheme, validateLayout } from './validate-packages.generated.js';
import type { ThemePackage, LayoutPackage, DesignFile } from './types';
import type {
  Design,
  LayoutNode,
  Query,
  MediaItem,
  Catalog,
  Collections,
  Card,
  CardElement,
  CatalogFacets,
} from './types';
export type {
  Design,
  LayoutNode,
  Query,
  MediaItem,
  Catalog,
  Collections,
  Card,
  CardElement,
  CatalogFacets,
} from './types';

function checkBudget(value: unknown) {
  // Budget the tree before the recursive schema validator sees imported data.
  const stack: [unknown, number][] = [[value, 0]];
  let count = 0;
  while (stack.length) {
    const [entry, depth] = stack.pop()!;
    if (++count > 6000 || depth > 24)
      throw new Error('Designet er for komplekst. Brug højst 8 niveauer af containere.');
    if (entry && typeof entry === 'object')
      for (const child of Object.values(entry)) stack.push([child, depth + 1]);
  }
}
export function validateDesign(value: unknown): Design {
  checkBudget(value);
  if (
    value &&
    typeof value === 'object' &&
    (value as { formatVersion?: number }).formatVersion === 1
  ) {
    if (!validateLegacySchema(value)) throw new Error('Ugyldigt design i det tidligere format.');
    value = migrateV1(value);
  }
  if (!value || typeof value !== 'object' || (value as Design).formatVersion !== 2)
    throw new Error('Denne designversion understøttes ikke. NetPlex forventer formatVersion 2.');
  if (!validateSchema(value)) {
    const error =
      validateSchema.errors?.find(
        (error) =>
          error.message &&
          !error.message.includes('required') &&
          !error.message.includes('constant'),
      ) || validateSchema.errors?.[0];
    throw new Error(
      `Ugyldigt design: ${error?.instancePath || '/'} ${error?.message || 'Kontrollér designfilens felter.'}`,
    );
  }
  const design = value as Design;
  validateLayoutStructure(design.pages, design.navigation.items);
  return design;
}
function validateLayoutStructure(pages: Design['pages'], items: Design['navigation']['items']) {
  const ids = new Set<string>();
  let nodes = 0;
  const visit = (node: LayoutNode, depth: number) => {
    if (++nodes > 180 || depth > 8)
      throw new Error('Designet må højst have 180 moduler og 8 niveauer.');
    if (ids.has(node.id)) throw new Error(`Modul-id skal være unikt: ${node.id}`);
    ids.add(node.id);
    if (node.type === 'container') node.children.forEach((child) => visit(child, depth + 1));
    if (
      'query' in node &&
      node.query.filter?.year?.gte !== undefined &&
      node.query.filter.year.lt !== undefined &&
      node.query.filter.year.gte >= node.query.filter.year.lt
    )
      throw new Error('Fra-år skal være lavere end før-år.');
  };
  visit(pages.home, 0);
  if (new Set(items.map((item) => item.route)).size !== items.length)
    throw new Error('Hver menuside må kun optræde én gang.');
}

export function themePackage(design: Design, name = design.name): ThemePackage {
  return structuredClone({
    format: 'netplex.theme',
    formatVersion: 1,
    name,
    description: design.description,
    theme: design.theme,
    navigation: { position: design.navigation.position },
    cards: design.cards,
  }) as ThemePackage;
}
export function layoutPackage(design: Design): LayoutPackage {
  return structuredClone({
    format: 'netplex.layout',
    formatVersion: 1,
    name: design.name,
    description: design.description,
    navigation: { items: design.navigation.items },
    library: design.library,
    pages: design.pages,
  }) as LayoutPackage;
}
export function validateDesignFile(value: unknown): DesignFile {
  checkBudget(value);
  const candidate = value as DesignFile;
  if (candidate?.format === 'netplex.theme') {
    if (!validateTheme(value))
      throw new Error(
        'Ugyldig temafil. Temaer må kun indeholde udseende, menuplacering og filmkort.',
      );
    return candidate;
  }
  if (candidate?.format === 'netplex.layout') {
    if (!validateLayout(value))
      throw new Error(
        'Ugyldig layoutfil. Layout indeholder lister, regler, menuindhold og sektioner.',
      );
    validateLayoutStructure(candidate.pages, candidate.navigation.items);
    return candidate;
  }
  return validateDesign(value);
}
export function parseDesignFile(text: string): DesignFile {
  if (new TextEncoder().encode(text).length > 65536) throw new Error('Filen må højst fylde 64 KB.');
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('JSON-filen indeholder en syntaksfejl.');
  }
  return validateDesignFile(value);
}
export function applyDesignFile(current: Design, value: unknown): Design {
  const file = validateDesignFile(value);
  if (file.format === 'netplex.design') return structuredClone(file);
  const next = structuredClone(current);
  if (file.format === 'netplex.theme') {
    next.theme = structuredClone(file.theme);
    next.cards = structuredClone(file.cards);
    next.navigation.position = file.navigation.position;
  } else {
    next.pages = structuredClone(file.pages);
    next.library = structuredClone(file.library);
    next.navigation.items = structuredClone(file.navigation.items);
  }
  return validateDesign(next);
}
export function parseDesign(text: string): Design {
  if (new TextEncoder().encode(text).length > 65536)
    throw new Error('Designfilen må højst fylde 64 KB.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('JSON-filen indeholder en syntaksfejl. Kontrollér kommaer og anførselstegn.');
  }
  return validateDesign(value);
}
export const cloneDesign = (design: Design): Design => JSON.parse(JSON.stringify(design));
export const CARD_SIZES = [
  { width: 100, label: 'Meget små' },
  { width: 140, label: 'Små' },
  { width: 180, label: 'Mellem' },
  { width: 240, label: 'Store' },
  { width: 320, label: 'Meget store' },
  { width: 420, label: 'Ekstra store' },
  { width: 520, label: 'Maksimal' },
];
export function cardSizeIndex(width: number): number {
  return CARD_SIZES.reduce(
    (best, entry, index) =>
      Math.abs(entry.width - width) < Math.abs(CARD_SIZES[best].width - width) ? index : best,
    0,
  );
}
export function fitCardColumns(available: number, gap: number, preference: number): number {
  const target = CARD_SIZES[cardSizeIndex(preference)].width;
  return Math.max(
    1,
    Math.round((Math.max(0, available) + Math.max(0, gap)) / (target + Math.max(0, gap))),
  );
}
// Conversion happens only after validation against the frozen v1 contract.
function migrateV1(value: unknown): Design {
  const old = JSON.parse(JSON.stringify(value));
  const previous = old.cards.default;
  const card: Card = { ...previous, radius: old.theme.radius, presentation: 'overlay' };
  if (
    previous.template.type === 'container' &&
    previous.template.direction === 'column' &&
    previous.template.children?.[0]?.type === 'image'
  ) {
    const image = previous.template.children[0];
    const shape = image.ratio === 'poster' ? 'poster' : 'landscape';
    Object.assign(
      card,
      basicCard(shape, previous.width, [
        'title',
        'year',
        'rating',
        'duration',
        'genres',
        'summary',
      ]),
    );
    card.radius = old.theme.radius;
  }
  old.cards = { shared: card };
  delete old.theme.radius;
  delete old.theme.contentWidth;
  old.formatVersion = 2;
  const visit = (node: any) => {
    delete node.card;
    if (node.query?.filter) {
      const filter = node.query.filter;
      if (filter.type) filter.types = [filter.type];
      if (filter.genre) filter.genres = [filter.genre];
      delete filter.type;
      delete filter.genre;
    }
    if (node.type === 'container') node.children.forEach(visit);
  };
  visit(old.pages.home);
  return old as Design;
}
const same = (value: string) => value.trim().toLocaleLowerCase('da');
const matchesAny = (selected: string[] | undefined, available: string[]) =>
  !selected?.length ||
  selected.some((value) => available.some((candidate) => same(candidate) === same(value)));
export function catalogFacets(items: MediaItem[]): CatalogFacets {
  const unique = (values: string[]) =>
    [...new Map(values.filter(Boolean).map((value) => [same(value), value.trim()])).values()].sort(
      (a, b) => a.localeCompare(b, 'da'),
    );
  return {
    types: [
      ...new Set(
        items
          .map((item) => item.type)
          .filter((type): type is 'movie' | 'show' | 'episode' =>
            ['movie', 'show', 'episode'].includes(type),
          ),
      ),
    ],
    genres: unique(items.flatMap((item) => item.genres)),
    directors: unique(items.flatMap((item) => item.directors || [])),
    actors: unique(items.flatMap((item) => (item.cast || []).map((person) => person.name))),
  };
}
export function queryItems(items: MediaItem[], query: Query, saved: string[] = []) {
  const filter = query.filter || {};
  const text = filter.text?.trim().toLocaleLowerCase('da');
  const selected = items.filter(
    (item) =>
      matchesAny(filter.types, [item.type]) &&
      matchesAny(filter.genres, item.genres) &&
      matchesAny(filter.directors, item.directors || []) &&
      matchesAny(
        filter.actors,
        (item.cast || []).map((person) => person.name),
      ) &&
      (filter.year?.gte === undefined || (item.year > 0 && item.year >= filter.year.gte)) &&
      (filter.year?.lt === undefined || (item.year > 0 && item.year < filter.year.lt)) &&
      (filter.ratingMin === undefined || item.rating >= filter.ratingMin) &&
      (!filter.unwatched || !item.watched) &&
      (!filter.resolution ||
        (filter.resolution === '4k'
          ? ['4k', '2160'].includes(item.resolution)
          : item.resolution === filter.resolution)) &&
      (!filter.durationMax || (item.duration > 0 && item.duration <= filter.durationMax * 60000)) &&
      (!text ||
        `${item.title} ${item.genres.join(' ')} ${item.summary}`
          .toLocaleLowerCase('da')
          .includes(text)) &&
      (query.source !== 'saved' || saved.includes(item.id)),
  );
  if (query.sort)
    selected.sort(
      query.sort === 'title'
        ? (a, b) => a.title.localeCompare(b.title, 'da')
        : query.sort === 'oldest'
          ? (a, b) => (a.year || 9999) - (b.year || 9999)
          : query.sort === 'year'
            ? (a, b) => b.year - a.year
            : query.sort === 'rating'
              ? (a, b) => b.rating - a.rating
              : query.sort === 'duration'
                ? (a, b) => a.duration - b.duration
                : (a, b) => b.addedAt - a.addedAt,
    );
  return { items: selected.slice(0, query.limit ?? 18), total: selected.length };
}
export function resolveCollections(design: Design, catalog: Catalog): Collections {
  const result: Collections = {};
  const visit = (node: LayoutNode) => {
    if (node.type === 'container') node.children.forEach(visit);
    else if ('query' in node)
      result[node.id] = queryItems(
        node.query.source === 'continuing' ? catalog.continuing : catalog.items,
        node.query,
        catalog.saved,
      );
  };
  visit(design.pages.home);
  return result;
}
export function basicCard(
  shape: 'poster' | 'landscape' | 'list',
  width = 180,
  fields = ['title', 'year', 'rating'],
): Card {
  const children: CardElement[] = [
    {
      type: 'image',
      field: shape === 'poster' ? 'poster' : 'backdrop',
      ratio: shape === 'poster' ? 'poster' : 'landscape',
      action: 'details',
    },
    {
      type: 'container',
      direction: 'column',
      padding: 10,
      gap: 6,
      children: [
        ...fields.map(
          (field) =>
            ({
              type: 'field',
              field,
              size: field === 'title' ? 14 : 11,
              weight: field === 'title' ? 'bold' : 'normal',
              lines: field === 'summary' ? 2 : 1,
            }) as CardElement,
        ),
        {
          type: 'container',
          direction: 'row',
          gap: 8,
          children: [
            { type: 'action', action: 'play', label: 'Afspil', appearance: 'primary' },
            { type: 'action', action: 'save', label: 'Min liste' },
          ],
        },
      ],
    },
  ];
  return {
    width,
    radius: 8,
    presentation: 'overlay',
    template: {
      type: 'container',
      direction: shape === 'list' ? 'row' : 'column',
      gap: 0,
      children,
    },
  };
}
