import React, { useEffect, useMemo, useState } from 'react';
import './styles/ArcanaCompendium.css';
import { ARCANA_DEFINITIONS } from '../game/arcanaDefinitions.js';
import { ArcanaCard } from './ArcanaCard.jsx';

const RARITY_ORDER = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
  '???': 6,
};

function getCompendiumDisplayArcana(arcana) {
  if (arcana?.rarity !== '???') return arcana;
  return {
    ...arcana,
    name: '???',
    description: 'The only way to know what this Arcana does is to get it in-game.',
    backgroundPath: arcana.backgroundPath || '/cards/backgrounds/Void.png',
  };
}

export function ArcanaCompendium({ onBack }) {
  const [rarityFilter, setRarityFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const typeOptions = useMemo(() => {
    const categories = Array.from(
      new Set(
        ARCANA_DEFINITIONS
          .map((a) => a.category)
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
    return ['all', ...categories];
  }, []);

  const filtered = useMemo(() => {
    const list = ARCANA_DEFINITIONS.filter((a) => {
      const rarityMatch = rarityFilter === 'all' || a.rarity.toLowerCase() === rarityFilter.toLowerCase();
      const typeMatch = typeFilter === 'all' || a.category?.toLowerCase() === typeFilter.toLowerCase();
      return rarityMatch && typeMatch;
    });
    return list.sort((a, b) => {
      const rarityDiff = (RARITY_ORDER[a.rarity] || 999) - (RARITY_ORDER[b.rarity] || 999);
      if (rarityDiff !== 0) return rarityDiff;
      return a.name.localeCompare(b.name);
    });
  }, [rarityFilter, typeFilter]);

  useEffect(() => {
    if (selected && !filtered.some((a) => a.id === selected.id)) {
      setSelected(null);
    }
  }, [filtered, selected]);

  const selectedDisplay = selected ? getCompendiumDisplayArcana(selected) : null;

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <div style={styles.headerRow}>
          <div>
            <h2 style={styles.heading}>Arcana Compendium</h2>
            <div style={styles.totalCount}>Total Arcana: {ARCANA_DEFINITIONS.length}</div>
          </div>
          <button style={styles.backButton} onClick={onBack}>
            Back
          </button>
        </div>

        <div style={styles.filterRow}>
          <label style={styles.filterLabel}>Rarity</label>
          <select
            style={styles.select}
            value={rarityFilter}
            onChange={(e) => setRarityFilter(e.target.value)}
          >
            <option value="all">All</option>
            <option value="common">Common</option>
            <option value="uncommon">Uncommon</option>
            <option value="rare">Rare</option>
            <option value="epic">Epic</option>
            <option value="legendary">Legendary</option>
            <option value="???">???</option>
          </select>

          <label style={styles.filterLabel}>Type</label>
          <select
            style={styles.select}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            {typeOptions.map((type) => (
              <option key={type} value={type}>
                {type === 'all' ? 'All' : type[0].toUpperCase() + type.slice(1)}
              </option>
            ))}
          </select>
        </div>

          <div style={styles.content}>
          <div className="arcana-list" style={styles.list}>
            {filtered.map((arcana) => {
              const displayArcana = getCompendiumDisplayArcana(arcana);
              return (
                <div key={arcana.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <ArcanaCard
                    arcana={displayArcana}
                    size="medium"
                    isSelected={selected?.id === arcana.id}
                    onClick={() => setSelected(arcana)}
                    disableTooltip
                    deferLoad
                  />
                  <div style={{ fontSize: '0.85rem', textAlign: 'center', opacity: 0.9 }}>
                    {arcana.rarity} · {arcana.category}
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>No Arcana for these filters.</div>
            )}
          </div>

          <div style={styles.detail}>
            {!selected && (
              <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                Select an Arcana on the left to see its details, rules effect, and visuals.
              </div>
            )}
            {selectedDisplay && (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16}}>
                  <ArcanaCard arcana={selectedDisplay} size="large" disableTooltip />
                </div>
                <h3 style={{ marginTop: 0, textAlign: 'center', fontSize: '1.5rem' }}>{selectedDisplay.name}</h3>
                <p style={styles.detailMeta}>
                  <strong>Rarity:</strong> {selectedDisplay.rarity}<br />
                  <strong>Category:</strong> {selectedDisplay.category}
                </p>
                <p>{selectedDisplay.description}</p>
                <p style={{ marginTop: 16, fontSize: '0.85rem', opacity: 0.8, }}>
                  During an Arcana Chess match, Arcana remain dormant until the Ascension event is
                  triggered (for example, on the first capture). Once Ascended, each player can
                  select one Arcana before making a move to apply its effect. Most Arcana can be
                  used only once per game and may also trigger unique particles, lighting changes,
                  or short in-game cinematics.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 20% 10%, #173047 0%, #0a1824 45%, #04070c 100%)',
    color: '#e9f4fb',
    fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
  },
  panel: {
    width: '70%',
    // height: '70%',
    padding: 36,
    borderRadius: 22,
    border: '1px solid rgba(69, 170, 194, 0.28)',
    background: 'linear-gradient(180deg, rgba(9, 17, 27, 0.97) 0%, rgba(6, 12, 20, 0.98) 100%)',
    boxShadow: '0 28px 80px rgba(0,0,0,0.7), 0 0 70px rgba(45, 173, 186, 0.12)',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heading: {
    margin: 0,
    fontSize: '1.65rem',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  backButton: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(87, 198, 208, 0.36)',
    background: 'rgba(10, 22, 36, 0.75)',
    color: '#d9edf6',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  filterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  filterLabel: {
    fontSize: '0.85rem',
  },
  select: {
    padding: '8px 12px',
    borderRadius: 10,
    border: '1px solid rgba(87, 198, 208, 0.3)',
    background: 'rgba(8,20,32,0.92)',
    color: '#e9f4fb',
    fontSize: '1rem',
  },
  content: {
    display: 'flex',
    gap: 16,
    height: '65vh',
  },
  list: {
    flex: 1,
    overflowY: 'auto',
    paddingRight: 8,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: 18,
    alignContent: 'start',
    justifyItems: 'center',
  },
  totalCount: {
    marginTop: 8,
    fontSize: '0.95rem',
    color: '#b9e3ef',
    opacity: 0.95,
  },
  card: {
    padding: 10,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(11,16,32,0.9)',
    cursor: 'pointer',
  },
  cardName: {
    fontWeight: 600,
  },
  cardMeta: {
    fontSize: '0.8rem',
    opacity: 0.8,
  },
  detail: {
    flex: 1.2,
    padding: 12,
    borderRadius: 12,
    background: 'rgba(10,22,36,0.72)',
    border: '1px solid rgba(87, 198, 208, 0.14)',
    fontSize: '0.9rem',
    textAlign: 'center',
  },
  detailMeta: {
    fontSize: '1rem',
    opacity: 0.9,
  },
};
