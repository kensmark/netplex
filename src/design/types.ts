export type Route = 'home' | 'movies' | 'shows' | 'saved' | 'search';
export interface MediaItem {
  serverId?: string;
  serverName?: string;
  preferredSourceId?: string;
  sources?: { id: string; serverId: string; name: string; resolution?: string; edition?: string }[];
  id: string;
  type: string;
  title: string;
  summary: string;
  year: number;
  duration: number;
  progress: number;
  watched: boolean;
  rating: number;
  genres: string[];
  directors?: string[];
  cast?: { name: string; role?: string }[];
  resolution: string;
  addedAt: number;
  [key: string]: unknown;
}
export interface Query {
  source: 'library' | 'continuing' | 'saved';
  filter?: {
    types?: ('movie' | 'show' | 'episode')[];
    genres?: string[];
    directors?: string[];
    actors?: string[];
    year?: { gte?: number; lt?: number };
    ratingMin?: number;
    unwatched?: boolean;
    resolution?: '4k' | '1080' | '720';
    text?: string;
    durationMax?: number;
  };
  sort?: 'added' | 'title' | 'year' | 'oldest' | 'rating' | 'duration';
  limit?: number;
}
export type Field =
  'title' | 'year' | 'duration' | 'rating' | 'genres' | 'resolution' | 'summary' | 'remaining';
export type CardElement =
  | {
      type: 'container';
      direction: 'row' | 'column';
      gap?: number;
      padding?: number;
      children: CardElement[];
    }
  | {
      type: 'image';
      field: 'poster' | 'backdrop';
      ratio: 'poster' | 'landscape' | 'square';
      action?: 'details' | 'play';
    }
  | { type: 'field'; field: Field; size?: number; weight?: 'normal' | 'bold'; lines?: number }
  | {
      type: 'action';
      action: 'play' | 'details' | 'save';
      label?: string;
      appearance?: 'primary' | 'secondary';
    }
  | { type: 'progress' };
export interface Card {
  template: CardElement;
  width: number;
  radius: number;
  presentation: 'overlay' | 'standard';
}
export type LayoutNode =
  | {
      id: string;
      type: 'container';
      layout: 'stack' | 'columns' | 'masonry';
      columns?: number;
      ratio?: 'equal' | 'wide-left' | 'wide-right';
      surface?: 'none' | 'panel';
      gap?: number;
      children: LayoutNode[];
    }
  | { id: string; type: 'text'; text: string; appearance: 'eyebrow' | 'heading' | 'body' }
  | { id: string; type: 'spacer'; height: number }
  | { id: string; type: 'hero'; query: Query; variant: 'cinematic' | 'split' | 'compact' }
  | {
      id: string;
      type: 'collection';
      title: string;
      query: Query;
      layout: 'row' | 'grid' | 'list' | 'column';
      empty: 'hide' | 'message';
    };
export interface Design {
  format: 'netplex.design';
  formatVersion: 2;
  name: string;
  description?: string;
  theme: {
    background: string;
    surface: string;
    text: string;
    muted: string;
    accent: string;
    font: 'system' | 'unbounded' | 'serif';
    spacing: number;
  };
  navigation: { position: 'top' | 'left'; items: { route: Route; label: string }[] };
  cards: { shared: Card };
  library: { layout: 'grid' | 'row' | 'list' };
  pages: { home: LayoutNode };
}
export interface CollectionResult {
  items: MediaItem[];
  total: number;
}
export interface ThemePackage {
  format: 'netplex.theme';
  formatVersion: 1;
  name: string;
  description?: string;
  theme: Design['theme'];
  navigation: Pick<Design['navigation'], 'position'>;
  cards: Design['cards'];
}
export interface LayoutPackage {
  format: 'netplex.layout';
  formatVersion: 1;
  name: string;
  description?: string;
  navigation: Pick<Design['navigation'], 'items'>;
  library: Design['library'];
  pages: Design['pages'];
}
export type DesignFile = Design | ThemePackage | LayoutPackage;
export interface SavedTheme {
  id: string;
  theme: ThemePackage;
}
export type Collections = Record<string, CollectionResult>;
export interface Catalog {
  items: MediaItem[];
  continuing: MediaItem[];
  saved: string[];
}
export interface CatalogFacets {
  types: ('movie' | 'show' | 'episode')[];
  genres: string[];
  directors: string[];
  actors: string[];
}
