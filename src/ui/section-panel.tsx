import React from 'react';
import type { LayoutNode } from '../design/types';
type Section = Extract<LayoutNode, { type: 'container' }>;
export function SectionPanel({
  node,
  onEdit,
}: {
  node: Section;
  onEdit: (change: (node: LayoutNode) => void) => void;
}) {
  return (
    <>
      <label className="studio-field">
        Opbygning
        <select
          aria-label="Sektionens opbygning"
          value={node.layout}
          onChange={(event) =>
            onEdit((n) => {
              if (n.type === 'container') n.layout = event.target.value as Section['layout'];
            })
          }
        >
          <option value="stack">Under hinanden</option>
          <option value="columns">Side om side</option>
          <option value="masonry">Lodrette kolonner</option>
        </select>
      </label>
      <div className={`studio-section-diagram diagram-${node.layout}`} aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <i key={i} />
        ))}
      </div>
      <p className="studio-hint">
        {node.layout === 'columns'
          ? 'Sektioner placeres fra venstre mod højre. Hver kategori kan have sin egen række, plakatkolonne, liste eller gitter.'
          : node.layout === 'masonry'
            ? 'Moduler løber ned gennem den første kolonne og videre i den næste. Forskellige højder kan pakkes tættere.'
            : 'Moduler vises ét under det andet i den rækkefølge, du vælger.'}
      </p>
      {node.layout !== 'stack' && (
        <label className="studio-field">
          Antal kolonner
          <select
            aria-label="Antal kolonner"
            value={node.columns || 2}
            onChange={(event) =>
              onEdit((n) => {
                if (n.type === 'container') n.columns = Number(event.target.value);
              })
            }
          >
            {[2, 3, 4].map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </label>
      )}
      {node.layout === 'columns' && (node.columns || 2) === 2 && (
        <label className="studio-field">
          Fordeling
          <select
            aria-label="Kolonnernes fordeling"
            value={node.ratio || 'equal'}
            onChange={(event) =>
              onEdit((n) => {
                if (n.type === 'container') n.ratio = event.target.value as Section['ratio'];
              })
            }
          >
            <option value="equal">Lige brede · 1:1</option>
            <option value="wide-left">Bred venstre · 2:1</option>
            <option value="wide-right">Bred højre · 1:2</option>
          </select>
        </label>
      )}
      <label className="studio-field">
        Indramning
        <select
          aria-label="Sektionens indramning"
          value={node.surface || 'none'}
          onChange={(event) =>
            onEdit((n) => {
              if (n.type === 'container') n.surface = event.target.value as Section['surface'];
            })
          }
        >
          <option value="none">Åben sektion</option>
          <option value="panel">Samlet panel</option>
        </select>
      </label>
      <label className="studio-field">
        Afstand mellem moduler
        <input
          aria-label="Afstand mellem moduler"
          type="range"
          min={0}
          max={96}
          value={node.gap ?? 24}
          onChange={(event) =>
            onEdit((n) => {
              if (n.type === 'container') n.gap = Number(event.target.value);
            })
          }
        />
      </label>
    </>
  );
}
