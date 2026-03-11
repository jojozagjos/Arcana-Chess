import React from 'react';
import { soundManager } from '../game/soundManager.js';

export function Settings({ settings, onChange, onBack }) {
  const DEFAULTS = {
    audio: { master: 0.5, music: 0.1, sfx: 0.5, muted: false },
    graphics: { quality: 'medium', postProcessing: true, shadows: true },
    gameplay: { showLegalMoves: true, highlightLastMove: true },
    display: { fullscreen: false },
  };

  const handleReset = () => {
    try {
      // Apply audio defaults immediately
      try { soundManager.setMasterVolume(DEFAULTS.audio.master); } catch (e) {}
      try { soundManager.setMusicVolume(DEFAULTS.audio.music); } catch (e) {}
      try { soundManager.setSfxVolume(DEFAULTS.audio.sfx); } catch (e) {}
      try { soundManager.setEnabled(!DEFAULTS.audio.muted); } catch (e) {}
    } catch (e) {}

    try {
      localStorage.setItem('arcanaChess.settings', JSON.stringify(DEFAULTS));
      // Also store legacy audio key for compatibility
      localStorage.setItem('arcana:audio', JSON.stringify(DEFAULTS.audio));
    } catch (e) {}

    // Notify parent to replace with defaults
    onChange(DEFAULTS);
  };
  const handleAudioChange = (key, value) => {
    onChange({
      audio: {
        ...settings.audio,
        [key]: value,
      },
    });

    // Apply audio changes immediately to sound system
    try {
      if (key === 'master') {
        soundManager.setMasterVolume(value);
      } else if (key === 'music') {
        soundManager.setMusicVolume(value);
      } else if (key === 'sfx') {
        soundManager.setSfxVolume(value);
      }
    } catch (e) {
      // Non-blocking: settings UI should not crash if audio update fails
    }
    try { localStorage.setItem('arcana:audio', JSON.stringify({ ...settings.audio, [key]: value })); } catch (e) {}
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

  const handleDisplayChange = (key, value) => {
    onChange({
      display: {
        ...settings.display,
        [key]: value,
      },
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <div style={styles.headerRow}>
          <h2 style={styles.heading}>Settings</h2>
          <div style={{ display: 'flex', gap: 8 }}>
            <button style={styles.resetButton} onClick={handleReset}>Reset</button>
            <button style={styles.backButton} onClick={onBack}>Back</button>
          </div>
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionHeading}>Audio</h3>
          <ToggleRow
            label="Mute All"
            value={settings.audio?.muted || false}
            trueLabel="Muted"
            falseLabel="Off"
            trueStyle={{ background: 'rgba(191, 97, 106, 0.5)', color: '#ffdede' }}
            falseStyle={{ background: 'rgba(76, 86, 106, 0.5)', color: '#e5e9f0' }}
            onChange={(v) => {
              onChange({
                audio: {
                  ...settings.audio,
                  muted: v,
                },
              });
              try { soundManager.setEnabled(!v); } catch (e) {}
              try { localStorage.setItem('arcana:audio', JSON.stringify({ ...settings.audio, muted: v })); } catch (e) {}
            }}
          />
          <SliderRow
            label="Master Volume"
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
          <ToggleRow
            label="Fullscreen"
            value={settings.display?.fullscreen || false}
            onChange={(v) => handleDisplayChange('fullscreen', v)}
          />
        </div>

        <div style={styles.section}>
          <h3 style={styles.sectionHeading}>Gameplay</h3>
          <ToggleRow
            label="Show Legal Moves"
            value={settings.gameplay.showLegalMoves}
            onChange={(v) => handleGameplayChange('showLegalMoves', v)}
          />
          <ToggleRow
            label="Highlight Last Move"
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

function ToggleRow({ label, value, onChange, trueLabel = 'On', falseLabel = 'Off', trueStyle = {}, falseStyle = {} }) {
  const background = value ? (trueStyle.background ?? 'linear-gradient(135deg, #1f8ea8 0%, #2ec4b6 100%)') : (falseStyle.background ?? 'rgba(28, 44, 63, 0.72)');
  const color = value ? (trueStyle.color ?? '#eceff4') : (falseStyle.color ?? '#eceff4');

  return (
    <div style={styles.row}>
      <label style={styles.labelInline}>{label}</label>
      <button
        type="button"
        onClick={() => onChange(!value)}
        style={{
          padding: '8px 16px',
          borderRadius: 8,
          border: 'none',
          background,
          color,
          cursor: 'pointer',
          fontSize: '0.9rem',
          fontWeight: 500,
          minWidth: 60,
          transition: 'all 0.2s ease',
        }}
      >
        {value ? trueLabel : falseLabel}
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
    background: 'radial-gradient(circle at 20% 10%, #173047 0%, #0a1824 45%, #04070c 100%)',
    color: '#e9f4fb',
    fontFamily: 'Trebuchet MS, Segoe UI, sans-serif',
  },
  panel: {
    minWidth: 420,
    maxWidth: 720,
    padding: 24,
    borderRadius: 22,
    border: '1px solid rgba(69, 170, 194, 0.28)',
    background: 'linear-gradient(180deg, rgba(9, 17, 27, 0.97) 0%, rgba(6, 12, 20, 0.98) 100%)',
    boxShadow: '0 24px 70px rgba(0,0,0,0.62), 0 0 60px rgba(45, 173, 186, 0.12)',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heading: {
    margin: 0,
    fontSize: '1.45rem',
    letterSpacing: '0.04em',
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
  section: {
    marginTop: 10,
    paddingTop: 12,
    borderTop: '1px solid rgba(87, 198, 208, 0.18)',
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
    border: '1px solid rgba(87, 198, 208, 0.3)',
    background: 'rgba(8, 20, 32, 0.9)',
    color: '#e9f4fb',
    fontSize: '0.9rem',
  },
  sliderValue: {
    width: 40,
    textAlign: 'right',
    fontSize: '0.8rem',
    opacity: 0.9,
  },
  resetButton: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid rgba(87, 198, 208, 0.32)',
    background: 'rgba(10, 22, 36, 0.75)',
    color: '#f0fbff',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
};
