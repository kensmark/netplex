// This is the sole runtime contract. The build exports it as JSON Schema and
// compiles it ahead of time so importing a design never evaluates code.
const string = (maxLength) => ({ type: 'string', maxLength });
const enumeration = (values) => ({ type: 'string', enum: values });
const integer = (minimum, maximum) => ({ type: 'integer', minimum, maximum });
const object = (properties, required = Object.keys(properties)) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  required,
});
const ref = (name) => ({ $ref: `#/$defs/${name}` });
const array = (items, maxItems, minItems = 0) => ({ type: 'array', items, maxItems, minItems });
const color = { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' };
const id = { type: 'string', pattern: '^[a-zA-Z][a-zA-Z0-9_-]{0,47}$' };
const query = object(
  {
    source: enumeration(['library', 'continuing', 'saved']),
    filter: object(
      {
        types: { ...array(enumeration(['movie', 'show', 'episode']), 3), uniqueItems: true },
        genres: { ...array(string(100), 50), uniqueItems: true },
        directors: { ...array(string(200), 50), uniqueItems: true },
        actors: { ...array(string(200), 50), uniqueItems: true },
        year: object({ gte: integer(1800, 2200), lt: integer(1800, 2200) }, []),
        ratingMin: { type: 'number', minimum: 0, maximum: 10 },
        unwatched: { type: 'boolean' },
        resolution: enumeration(['4k', '1080', '720']),
        text: string(200),
        durationMax: integer(1, 1000),
      },
      [],
    ),
    sort: enumeration(['added', 'title', 'year', 'oldest', 'rating', 'duration']),
    limit: integer(1, 60),
  },
  ['source'],
);
const element = {
  oneOf: [
    object(
      {
        type: { const: 'container' },
        direction: enumeration(['row', 'column']),
        gap: integer(0, 48),
        padding: integer(0, 48),
        children: array(ref('element'), 16),
      },
      ['type', 'direction', 'children'],
    ),
    object(
      {
        type: { const: 'image' },
        field: enumeration(['poster', 'backdrop']),
        ratio: enumeration(['poster', 'landscape', 'square']),
        action: enumeration(['details', 'play']),
      },
      ['type', 'field', 'ratio'],
    ),
    object(
      {
        type: { const: 'field' },
        field: enumeration([
          'title',
          'year',
          'duration',
          'rating',
          'genres',
          'resolution',
          'summary',
          'remaining',
        ]),
        size: integer(9, 40),
        weight: enumeration(['normal', 'bold']),
        lines: integer(1, 6),
      },
      ['type', 'field'],
    ),
    object(
      {
        type: { const: 'action' },
        action: enumeration(['play', 'details', 'save']),
        label: string(60),
        appearance: enumeration(['primary', 'secondary']),
      },
      ['type', 'action'],
    ),
    object({ type: { const: 'progress' } }),
  ],
};
const card = object({
  width: integer(100, 520),
  radius: integer(0, 32),
  presentation: enumeration(['overlay', 'standard']),
  template: ref('element'),
});
const node = {
  oneOf: [
    object(
      {
        id,
        type: { const: 'container' },
        layout: enumeration(['stack', 'columns', 'masonry']),
        columns: integer(1, 4),
        ratio: enumeration(['equal', 'wide-left', 'wide-right']),
        surface: enumeration(['none', 'panel']),
        gap: integer(0, 96),
        children: array(ref('node'), 30),
      },
      ['id', 'type', 'layout', 'children'],
    ),
    object({
      id,
      type: { const: 'text' },
      text: string(1000),
      appearance: enumeration(['eyebrow', 'heading', 'body']),
    }),
    object({ id, type: { const: 'spacer' }, height: integer(0, 240) }),
    object({
      id,
      type: { const: 'hero' },
      query: ref('query'),
      variant: enumeration(['cinematic', 'split', 'compact']),
    }),
    object(
      {
        id,
        type: { const: 'collection' },
        title: string(120),
        query: ref('query'),
        layout: enumeration(['row', 'grid', 'list', 'column']),
        empty: enumeration(['hide', 'message']),
      },
      ['id', 'type', 'title', 'query', 'layout', 'empty'],
    ),
  ],
};
export default {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'NetPlex Design 2',
  ...object(
    {
      format: { const: 'netplex.design' },
      formatVersion: { const: 2 },
      name: { ...string(80), minLength: 1 },
      description: string(500),
      theme: object({
        background: color,
        surface: color,
        text: color,
        muted: color,
        accent: color,
        font: enumeration(['system', 'unbounded', 'serif']),
        spacing: integer(8, 48),
      }),
      navigation: object({
        position: enumeration(['top', 'left']),
        items: array(
          object({
            route: enumeration(['home', 'movies', 'shows', 'saved', 'search']),
            label: { ...string(32), minLength: 1 },
          }),
          5,
          1,
        ),
      }),
      cards: object({ shared: ref('card') }),
      library: object({ layout: enumeration(['grid', 'row', 'list']) }),
      pages: object({ home: ref('node') }),
    },
    ['format', 'formatVersion', 'name', 'theme', 'navigation', 'cards', 'library', 'pages'],
  ),
  $defs: { query, element, card, node },
};
