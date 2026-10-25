import React from 'react';
import { basicCard, CARD_SIZES, cardSizeIndex } from '../design/core';
import type { CardElement, Design } from '../design/types';
const shapeOf = (node: CardElement): 'poster' | 'landscape' | 'list' =>
  node.type === 'container' && node.direction === 'row'
    ? 'list'
    : JSON.stringify(node).includes('"ratio":"poster"')
      ? 'poster'
      : 'landscape';
export function ThemePanel({
  design,
  edit,
}: {
  design: Design;
  edit: (change: (draft: Design) => void) => void;
}) {
  return (
    <>
      <p className="studio-hint">
        Farver, skrifttype og menu. Forsidens opbygning ændrer du under Layout.
      </p>
      <label className="studio-field">
        Navigation
        <select
          aria-label="Navigation"
          value={design.navigation.position}
          onChange={(event) =>
            edit((draft) => {
              draft.navigation.position = event.target.value as 'top';
            })
          }
        >
          <option value="top">Topmenu</option>
          <option value="left">Sidemenu</option>
        </select>
      </label>
      <div className="studio-colors">
        {[
          ['background', 'Baggrund'],
          ['surface', 'Kort og flader'],
          ['text', 'Tekst'],
          ['muted', 'Sekundær tekst'],
          ['accent', 'Accentfarve'],
        ].map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              aria-label={label}
              type="color"
              value={design.theme[key as 'accent']}
              onChange={(event) =>
                edit((draft) => {
                  draft.theme[key as 'accent'] = event.target.value;
                })
              }
            />
          </label>
        ))}
      </div>
      <label className="studio-field">
        Skrifttype
        <select
          aria-label="Skrifttype"
          value={design.theme.font}
          onChange={(event) =>
            edit((draft) => {
              draft.theme.font = event.target.value as 'system';
            })
          }
        >
          <option value="system">System</option>
          <option value="unbounded">Unbounded</option>
          <option value="serif">Serif</option>
        </select>
      </label>
    </>
  );
}
export function CardsPanel({
  design,
  edit,
}: {
  design: Design;
  edit: (change: (draft: Design) => void) => void;
}) {
  const card = design.cards.shared;
  return (
    <>
      <p className="studio-hint">
        Ét fælles design til alle filmkort — på forsiden, i biblioteket og under Fortsæt med at se.
      </p>
      <div className="studio-section-label">BILLEDFORMAT</div>
      <div className="studio-shapes">
        {[
          ['poster', 'Plakat'],
          ['landscape', 'Bredt billede'],
        ].map(([shape, label]) => (
          <button
            key={shape}
            className={shapeOf(card.template) === shape ? 'selected' : ''}
            aria-pressed={shapeOf(card.template) === shape}
            onClick={() =>
              edit((draft) => {
                draft.cards.shared = {
                  ...basicCard(shape as 'poster', card.width, ['title', 'year', 'rating']),
                  radius: card.radius,
                };
              })
            }
          >
            {label}
          </button>
        ))}
      </div>
      <label className="studio-field">
        Kortstørrelse: {CARD_SIZES[cardSizeIndex(card.width)].label}
        <input
          aria-label="Kortstørrelse"
          type="range"
          min={0}
          max={CARD_SIZES.length - 1}
          step={1}
          value={cardSizeIndex(card.width)}
          aria-valuetext={CARD_SIZES[cardSizeIndex(card.width)].label}
          onChange={(event) =>
            edit((draft) => {
              draft.cards.shared.width = CARD_SIZES[Number(event.target.value)].width;
            })
          }
        />
      </label>
      <p className="studio-hint">
        Faste størrelsestrin. Kortene fordeles jævnt over modulets bredde.
      </p>
      <label className="studio-field">
        Afrunding: {card.radius}px
        <input
          aria-label="Afrunding"
          type="range"
          min={0}
          max={32}
          value={card.radius}
          onChange={(event) =>
            edit((draft) => {
              draft.cards.shared.radius = Number(event.target.value);
            })
          }
        />
      </label>
      <p className="studio-hint">
        Kortene viser titel, år og bedømmelse. Klik på plakaten for at se mere.
      </p>
    </>
  );
}
