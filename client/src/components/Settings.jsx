import React from 'react';

export function Settings({ settings, onChange, onBack }) {
  const handleAudioChange = (key, value) => {
    onChange({
      audio: {
        ...settings.audio,
        [key]: value,
      },
    });
  };

  const handleGraphicsChange = (key, value) => {
    onChange({
      graphics: {
        ...settings.graphics,
        [key]: value,
      },
    });
  };

  const handleGameplayChange = (key, value) => {
    onChange({
      gameplay: {
        ...settings.gameplay,
        [key]: value,
      },
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <div style={styles.headerRow}>
          <h2 style={styles.heading}>Settings</h2>
          <button style={styles.backButton} onClick={onBack}>
            Back
          </button>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionHeading}>Audio</h3>
          <SliderRow
            label="Master"
            value={settings.audio.master}
            onChange={(v) => handleAudioChange('master', v)}
          />
          <SliderRow
            label="Music"
            value={settings.audio.music}
            onChange={(v) => handleAudioChange('music', v)}
          />
          <SliderRow
            label="SFX"
            value={settings.audio.sfx}
            onChange={(v) => handleAudioChange('sfx', v)}
          />
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionHeading}>Graphics</h3>
          <div style={styles.row}>
            <label style={styles.labelInline}>Quality</label>
            <select
              style={styles.select}
              value={settings.graphics.quality}
              onChange={(e) => handleGraphicsChange('quality', e.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <ToggleRow
            label="Post-processing"
            value={settings.graphics.postProcessing}
            onChange={(v) => handleGraphicsChange('postProcessing', v)}
          />
          <ToggleRow
            label="Shadows"
            value={settings.graphics.shadows}
            onChange={(v) => handleGraphicsChange('shadows', v)}
          />
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionHeading}>Gameplay</h3>
          <ToggleRow
            label="Show legal moves"
            value={settings.gameplay.showLegalMoves}
            onChange={(v) => handleGameplayChange('showLegalMoves', v)}
          />
          <ToggleRow
            label="Highlight last move"
            value={settings.gameplay.highlightLastMove}
            onChange={(v) => handleGameplayChange('highlightLastMove', v)}
          />
        </div>
      </div>
    </div>
  );
}

function SliderRow({ label, value, onChange }) {
  return (
    <div style={styles.row}>
      <label style={styles.labelInline}>{label}</label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ flex: 1 }}
      />
      <div style={styles.sliderValue}>{Math.round(value * 100)}%</div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }) {
  return (
    <div style={styles.row}>
      <label style={styles.labelInline}>{label}</label>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          padding: '4px 10px',
          borderRadius: 999,
          border: '1px solid #394867',
          background: value ? 'linear-gradient(135deg, #4c6fff, #8f94fb)' : 'transparent',
          color: '#d0d6ea',
          cursor: 'pointer',
          fontSize: '0.8rem',
        }}
      >
        {value ? 'On' : 'Off'}
      </button>
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
    minWidth: 420,
    maxWidth: 720,
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
  section: {
    marginTop: 10,
    paddingTop: 10,
    borderTop: '1px solid rgba(255,255,255,0.05)',
  },
  sectionHeading: {
    margin: 0,
    marginBottom: 8,
    fontSize: '1rem',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  labelInline: {
    minWidth: 120,
    fontSize: '0.85rem',
  },
  select: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #3b4252',
    background: 'rgba(8,10,20,0.9)',
    color: '#e5e9f0',
    fontSize: '0.9rem',
  },
  sliderValue: {
    width: 40,
    textAlign: 'right',
    fontSize: '0.8rem',
    opacity: 0.9,
  },
};
