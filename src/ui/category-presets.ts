import type { CatalogFacets, Query } from '../design/types';
export interface CategoryPreset {
  id: string;
  title: string;
  query: Query;
}
export function categoryPresets(catalog: CatalogFacets): CategoryPreset[] {
  return [
    {
      id: 'recent',
      title: 'Senest tilføjede film',
      query: { source: 'library', filter: { types: ['movie'] }, sort: 'added', limit: 24 },
    },
    { id: 'continue', title: 'Fortsæt med at se', query: { source: 'continuing', limit: 12 } },
    { id: 'saved', title: 'Din liste', query: { source: 'saved', sort: 'added', limit: 24 } },
    {
      id: 'unwatched',
      title: 'Usete favoritter',
      query: {
        source: 'library',
        filter: { types: ['movie'], unwatched: true },
        sort: 'rating',
        limit: 24,
      },
    },
    {
      id: 'rated',
      title: 'Højt vurderet',
      query: {
        source: 'library',
        filter: { types: ['movie'], ratingMin: 8 },
        sort: 'rating',
        limit: 24,
      },
    },
    {
      id: 'classics',
      title: 'Film før 1990',
      query: {
        source: 'library',
        filter: { types: ['movie'], year: { lt: 1990 } },
        sort: 'rating',
        limit: 24,
      },
    },
    {
      id: 'nineties',
      title: '90’ernes film',
      query: {
        source: 'library',
        filter: { types: ['movie'], year: { gte: 1990, lt: 2000 } },
        sort: 'rating',
        limit: 24,
      },
    },
    {
      id: 'short',
      title: 'En film under 100 minutter',
      query: {
        source: 'library',
        filter: { types: ['movie'], durationMax: 100 },
        sort: 'rating',
        limit: 18,
      },
    },
    {
      id: '4k',
      title: 'Film i 4K',
      query: {
        source: 'library',
        filter: { types: ['movie'], resolution: '4k' },
        sort: 'added',
        limit: 24,
      },
    },
    {
      id: 'series',
      title: 'Serier til næste aften',
      query: { source: 'library', filter: { types: ['show'] }, sort: 'added', limit: 24 },
    },
    ...catalog.genres.map(
      (genre, index) =>
        ({
          id: `genre-${index}`,
          title: genre,
          query: {
            source: 'library',
            filter: { types: ['movie'], genres: [genre] },
            sort: 'rating',
            limit: 24,
          },
        }) as CategoryPreset,
    ),
  ];
}
