import design from './design-schema.mjs';
const { name, description, theme, cards, library, pages, navigation } = design.properties;
const root = (format, properties) => ({
  $schema: design.$schema,
  type: 'object',
  additionalProperties: false,
  properties: {
    format: { const: format },
    formatVersion: { const: 1 },
    name,
    description,
    ...properties,
  },
  required: ['format', 'formatVersion', 'name', ...Object.keys(properties)],
  $defs: design.$defs,
});
export const themeSchema = root('netplex.theme', {
  theme,
  cards,
  navigation: {
    type: 'object',
    additionalProperties: false,
    required: ['position'],
    properties: { position: navigation.properties.position },
  },
});
export const layoutSchema = root('netplex.layout', {
  library,
  pages,
  navigation: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: { items: navigation.properties.items },
  },
});
