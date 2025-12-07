import React, { useState } from 'react';
import { ARCANA_DEFINITIONS } from '../game/arcanaDefinitions.js';

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
          <h2 style={styles.heading}>Arcana Compendium</h2>
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
            <option value="legendary">Legendary</option>
          </select>
        </div>

        <div style={styles.content}>
          <div style={styles.list}>
            {filtered.map((arcana) => (
              <div
                key={arcana.id}
                style={{
                  ...styles.card,
                  borderColor: selected?.id === arcana.id ? '#2f6fed' : 'rgba(255,255,255,0.08)',
                }}
                onClick={() => setSelected(arcana)}
              >
                <div style={styles.cardName}>{arcana.name}</div>
                <div style={styles.cardMeta}>{arcana.rarity} · {arcana.category}</div>
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
                <h3 style={{ marginTop: 0 }}>{selected.name}</h3>
                <p style={styles.detailMeta}>
                  <strong>Rarity:</strong> {selected.rarity}<br />
                  <strong>Category:</strong> {selected.category}
                </p>
                <p>{selected.description}</p>
                <p style={{ marginTop: 8, fontSize: '0.9rem', opacity: 0.9 }}>
                  <strong>Visual flavor:</strong> {selected.visual}
                </p>
                <p style={{ marginTop: 16, fontSize: '0.85rem', opacity: 0.8 }}>
                  During a XXI-Chess match, Arcana remain dormant until the Ascension event is
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
    width: '90vw',
    maxWidth: 960,
    padding: 24,
    borderRadius: 18,
    background: 'rgba(5, 6, 10, 0.95)',
    boxShadow: '0 22px 60px rgba(0,0,0,0.65)',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heading: {
    margin: 0,
    fontSize: '1.4rem',
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
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #3b4252',
    background: 'rgba(8,10,20,0.9)',
    color: '#e5e9f0',
    fontSize: '0.9rem',
  },
  content: {
    display: 'flex',
    gap: 16,
  },
  list: {
    flex: 1,
    maxHeight: 360,
    overflowY: 'auto',
    paddingRight: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
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
