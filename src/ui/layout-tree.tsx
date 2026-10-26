import React, { useRef, useState } from 'react';
import type { Design, LayoutNode } from '../design/types';
export type DropEdge = 'before' | 'after' | 'inside';
export const moduleLabel = (node: LayoutNode) =>
  node.type === 'collection'
    ? node.title
    : node.type === 'text'
      ? node.text
      : node.type === 'hero'
        ? 'Fremhævet film'
        : node.type === 'spacer'
          ? 'Afstand'
          : 'Forside';
export function findModule(node: LayoutNode, id: string): LayoutNode | null {
  return node.id === id
    ? node
    : node.type === 'container'
      ? node.children.map((child) => findModule(child, id)).find(Boolean) || null
      : null;
}
function parentOf(node: LayoutNode, id: string): Extract<LayoutNode, { type: 'container' }> | null {
  return node.type === 'container'
    ? node.children.some((child) => child.id === id)
      ? node
      : node.children.map((child) => parentOf(child, id)).find(Boolean) || null
    : null;
}
export function moveModule(design: Design, source: string, target: string, edge: DropEdge) {
  const item = findModule(design.pages.home, source),
    destination = findModule(design.pages.home, target),
    parent = parentOf(design.pages.home, source);
  if (!item || !destination || !parent || findModule(item, target)) return;
  const targetParent =
    edge === 'inside' && destination.type === 'container'
      ? destination
      : parentOf(design.pages.home, target);
  if (!targetParent) return;
  parent.children.splice(
    parent.children.findIndex((child) => child.id === source),
    1,
  );
  const index =
    edge === 'inside'
      ? targetParent.children.length
      : targetParent.children.findIndex((child) => child.id === target) +
        (edge === 'after' ? 1 : 0);
  targetParent.children.splice(index, 0, item);
}
export function LayoutTree({
  design,
  selected,
  onSelect,
  onMove,
  onAdd,
  onRemove,
}: {
  design: Design;
  selected: string;
  onSelect: (id: string) => void;
  onMove: (source: string, target: string, edge: DropEdge) => void;
  onAdd: (type: 'collection' | 'text' | 'spacer') => void;
  onRemove: (id: string) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null),
    [drop, setDrop] = useState<{ id: string; edge: DropEdge } | null>(null);
  const ghost = useRef<HTMLElement | null>(null);
  const clear = () => {
    setDrag(null);
    setDrop(null);
    ghost.current?.remove();
    ghost.current = null;
  };
  const valid = (target: LayoutNode) =>
    Boolean(
      drag && target.id !== drag && !findModule(findModule(design.pages.home, drag)!, target.id),
    );
  const tree = (node: LayoutNode, depth: number): React.ReactNode => (
    <React.Fragment key={node.id}>
      <div
        className={`studio-tree-row ${selected === node.id ? 'selected' : ''} ${drag === node.id ? 'dragging' : ''} ${drop?.id === node.id ? `drop-${drop.edge}` : ''}`}
        data-tree-id={node.id}
        style={{ paddingLeft: 10 + depth * 12 }}
        draggable={depth > 0}
        onDragStart={(event) => {
          setDrag(node.id);
          event.dataTransfer.setData('text/plain', node.id);
          event.dataTransfer.effectAllowed = 'move';
          const preview = document.createElement('div');
          preview.className = 'studio-drag-ghost';
          preview.textContent = `⠿  ${moduleLabel(node)}`;
          document.body.append(preview);
          ghost.current = preview;
          event.dataTransfer.setDragImage(preview, 16, 18);
        }}
        onDragEnd={clear}
        onDragOver={(event) => {
          if (!valid(node) || depth === 0) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          const rect = event.currentTarget.getBoundingClientRect();
          setDrop({
            id: node.id,
            edge: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after',
          });
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) setDrop(null);
        }}
        onDrop={(event) => {
          event.preventDefault();
          if (drag && drop?.id === node.id) {
            onMove(drag, node.id, drop.edge);
            onSelect(drag);
          }
          clear();
        }}
      >
        <span className="studio-drag-handle" aria-hidden="true">
          {depth > 0 ? '⠿' : '▦'}
        </span>
        <button
          className="studio-tree-label"
          onClick={() => onSelect(node.id)}
          title={moduleLabel(node)}
        >
          {depth === 0 ? 'Forside' : moduleLabel(node)}
        </button>
        {depth > 0 && (
          <span className="studio-tree-tools">
            {(['before', 'after'] as const).map((edge) => (
              <button
                key={edge}
                aria-label={`Flyt ${moduleLabel(node)} ${edge === 'before' ? 'op' : 'ned'}`}
                onClick={() => {
                  const parent = parentOf(design.pages.home, node.id)!;
                  const index = parent.children.findIndex((child) => child.id === node.id),
                    sibling = parent.children[index + (edge === 'before' ? -1 : 1)];
                  if (sibling) onMove(node.id, sibling.id, edge);
                }}
              >
                {edge === 'before' ? '↑' : '↓'}
              </button>
            ))}
            {selected === node.id && (
              <button
                type="button"
                className="studio-tree-delete"
                aria-label={`Slet modulet: ${moduleLabel(node)}`}
                title="Slet modulet"
                onClick={() => onRemove(node.id)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            )}
          </span>
        )}
      </div>
      {node.type === 'container' && (
        <>
          {node.children.map((child) => tree(child, depth + 1))}
          {!node.children.length && (
            <div
              className={`studio-empty-drop ${drop?.id === node.id ? 'drop-inside' : ''}`}
              onDragOver={(event) => {
                if (!valid(node)) return;
                event.preventDefault();
                setDrop({ id: node.id, edge: 'inside' });
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (drag) onMove(drag, node.id, 'inside');
                clear();
              }}
            >
              Slip et modul her
            </div>
          )}
        </>
      )}
    </React.Fragment>
  );
  return (
    <>
      <div className="studio-section-label">
        FORSIDENS MODULER{' '}
        <small>{drag ? 'Slip ved den markerede linje' : 'Træk for at flytte'}</small>
      </div>
      <div className={`studio-tree ${drag ? 'is-dragging' : ''}`}>{tree(design.pages.home, 0)}</div>
      <div className="studio-add">
        <button onClick={() => onAdd('collection')}>+ Kategori</button>
        <button onClick={() => onAdd('text')}>+ Tekst</button>
        <button onClick={() => onAdd('spacer')}>+ Afstand</button>
      </div>
    </>
  );
}
