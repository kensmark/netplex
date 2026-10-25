import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

export function MetadataPicker({
  label,
  options,
  selected,
  onChange,
  loading = false,
  labels = {},
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
  loading?: boolean;
  labels?: Record<string, string>;
}) {
  const [open, setOpen] = useState(false),
    [search, setSearch] = useState('');
  const root = useRef<HTMLDivElement>(null),
    id = useId();
  const matches = useMemo(
    () =>
      options.filter((value) =>
        (labels[value] || value).toLocaleLowerCase('da').includes(search.toLocaleLowerCase('da')),
      ),
    [options, search, labels],
  );
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const toggle = (value: string) =>
    onChange(
      selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
    );
  return (
    <div className="studio-field studio-picker" ref={root}>
      <span>{label}</span>
      <button
        type="button"
        className="studio-picker-trigger"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        disabled={loading}
        onClick={() => {
          setOpen(!open);
          setSearch('');
        }}
      >
        <span>
          {loading ? 'Indlæser bibliotek…' : selected.length ? `${selected.length} valgt` : 'Alle'}
        </span>
        <span aria-hidden="true">⌄</span>
      </button>
      {selected.length > 0 && (
        <div className="studio-selected-values">
          {selected.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => toggle(value)}
              aria-label={`Fjern ${labels[value] || value}`}
              title={options.includes(value) ? undefined : 'Ikke i det aktuelle bibliotek'}
            >
              {labels[value] || value}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="studio-picker-popover">
          <input
            autoFocus
            type="search"
            aria-label={`Søg i ${label.toLocaleLowerCase('da')}`}
            placeholder="Søg i bibliotekets navne…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                setOpen(false);
              }
            }}
          />
          <div role="listbox" aria-label={label} aria-multiselectable="true" id={id}>
            {matches.slice(0, 100).map((value) => (
              <button
                key={value}
                type="button"
                role="option"
                aria-selected={selected.includes(value)}
                onClick={() => toggle(value)}
              >
                <span className="studio-option-check" aria-hidden="true">
                  {selected.includes(value) ? '✓' : ''}
                </span>
                {labels[value] || value}
              </button>
            ))}
            {!matches.length && <p className="studio-hint">Ingen match i biblioteket.</p>}
          </div>
          {matches.length > 100 && (
            <small>{matches.length} match. Søg for at indsnævre listen.</small>
          )}
        </div>
      )}
    </div>
  );
}
