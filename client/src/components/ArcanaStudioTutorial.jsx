import React, { useMemo, useState } from 'react';

const STEPS = [
  {
    id: 'quickstart',
    title: 'Quick Start',
    bullets: [
      'Pick a card from the left library or click Import All Game Cards.',
      'Add a piece/object track and set Piece Square to the piece you want to animate.',
      'Move the playhead and add keys for jump, fling, slam, or heal motions.',
      'Add particles, overlays, and sounds on matching timestamps.',
      'Preview, save to runtime, then export JSON for backup or sharing.',
    ],
  },
  {
    id: 'moon-style',
    title: 'Moon Animator Style Workflow',
    bullets: [
      'Everything is a timeline track with keyframes.',
      'Keyframe easing controls how motion blends between keys.',
      'Events are timed hooks for camera cuts, highlights, and combat logs.',
      'Overlay tracks can be screen HUD text or world-attached floating text.',
      'Audio tracks trigger exact SFX/music beats on the timeline.',
    ],
  },
  {
    id: 'example',
    title: 'Example: Antidote Heal Jump',
    bullets: [
      'Object track: key at 0ms (rest), 220ms (up), 450ms (land).',
      'Particle track: burst enabled at 220ms, soft glow disabled by 520ms.',
      'Overlay track: text "Purified" fades in at 250ms then out at 900ms.',
      'Sound track: play arcana:heal at 200ms, ui:success at 470ms.',
      'Use easeOutCubic going up and easeInCubic coming down.',
    ],
  },
  {
    id: 'qol',
    title: 'Quality of Life',
    bullets: [
      'Space: play/pause timeline.',
      'Shift + click timeline lane: add key at playhead.',
      'Use Loop Playback for quick polish passes.',
      'Use usedPieces list to keep per-card piece scope clean.',
      'Export all cards as one package when done balancing.',
    ],
  },
];

export function ArcanaStudioTutorial({ onClose }) {
  const [active, setActive] = useState(STEPS[0].id);
  const section = useMemo(() => STEPS.find((x) => x.id === active) || STEPS[0], [active]);

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-modal">
        <div className="tutorial-sidebar">
          <h3>Arcana Studio Tutorial</h3>
          {STEPS.map((step) => (
            <button
              key={step.id}
              className={`tutorial-nav-item ${active === step.id ? 'active' : ''}`}
              onClick={() => setActive(step.id)}
            >
              {step.title}
            </button>
          ))}
        </div>

        <div className="tutorial-content">
          <div className="tutorial-header">
            <h2>{section.title}</h2>
            <button className="tutorial-close" onClick={onClose}>Close</button>
          </div>

          <div className="tutorial-body">
            <ul>
              {section.bullets.map((line) => <li key={line}>{line}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
