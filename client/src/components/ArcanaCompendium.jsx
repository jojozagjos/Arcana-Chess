import React, { useState } from 'react';
import './styles/ArcanaCompendium.css';
import { ARCANA_DEFINITIONS } from '../game/arcanaDefinitions.js';
import { ArcanaCard } from './ArcanaCard.jsx';

export function ArcanaCompendium({ onBack }) {
  const [rarityFilter, setRarityFilter] = useState('all');
  const [selected, setSelected] = useState(null);

  const filtered = ARCANA_DEFINITIONS.filter((a) => {
    if (rarityFilter === 'all') return true;
    return a.rarity.toLowerCase() === rarityFilter.toLowerCase();
  });

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
          </select>
        </div>

          <div style={styles.content}>
          <div className="arcana-list" style={styles.list}>
            {filtered.map((arcana) => (
              <div key={arcana.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                <ArcanaCard
                  arcana={arcana}
                  size="medium"
                  isSelected={selected?.id === arcana.id}
                  onClick={() => setSelected(arcana)}
                  deferLoad
                />
                <div style={{ fontSize: '0.85rem', textAlign: 'center', opacity: 0.9 }}>
                  {arcana.rarity} · {arcana.category}
                </div>
              </div>
            ))}
            {filtered.length === 0 && (
              <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>No Arcana for this filter.</div>
            )}
          </div>

          <div style={styles.detail}>
            {!selected && (
              <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
                Select an Arcana on the left to see its details, rules effect, and visuals.
              </div>
            )}
            {selected && (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <ArcanaCard arcana={selected} size="large" />
                </div>
                <h3 style={{ marginTop: 0, textAlign: 'center' }}>{selected.name}</h3>
                <p style={styles.detailMeta}>
                  <strong>Rarity:</strong> {selected.rarity}<br />
                  <strong>Category:</strong> {selected.category}
                </p>
                <p>{selected.description}</p>
                <p style={{ marginTop: 16, fontSize: '0.85rem', opacity: 0.8 }}>
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
    background: 'radial-gradient(circle at top, #1b2735, #090a0f)',
    color: '#e5e9f0',
    fontFamily: 'system-ui, sans-serif',
  },
  panel: {
    width: '75vw',
    maxWidth: '75vw',
    height: '75vh',
    maxHeight: '75vh',
    padding: 36,
    borderRadius: 20,
    background: 'rgba(5, 6, 10, 0.96)',
    boxShadow: '0 28px 80px rgba(0,0,0,0.7)',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heading: {
    margin: 0,
    fontSize: '1.6rem',
  },
  backButton: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid #394867',
    background: 'transparent',
    color: '#d0d6ea',
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
    border: '1px solid #3b4252',
    background: 'rgba(8,10,20,0.92)',
    color: '#e5e9f0',
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
    backgroundcolor: 'rgb(240, 3, 3)',
    // alignItems: 'start',
    // justifyItems: 'center',
  },
  totalCount: {
    marginTop: 8,
    fontSize: '0.95rem',
    color: '#cbd6e6',
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
    background: 'rgba(11,16,32,0.9)',
    fontSize: '0.9rem',
  },
  detailMeta: {
    fontSize: '0.85rem',
    opacity: 0.9,
  },
};
