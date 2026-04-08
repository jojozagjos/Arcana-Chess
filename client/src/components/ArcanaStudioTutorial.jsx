import React, { useMemo, useState } from 'react';

const STEPS = [
  {
    id: 'quickstart',
    title: 'Quick Invocation',
    bullets: [
      'Pick a card from the left library.',
      'Each card starts with one Main Piece actor so you can block a sequence instantly.',
      'Use Move, Rotate, and Scale on selected actors; click open ground to clear selection.',
      'If an actor has no moment yet, moving it auto-creates the first moment at the current time.',
      'Layer Aether particles, Sigil overlays, and Chime audio at matching times.',
      'Preview in place, then export for backup or sharing.',
    ],
  },
  {
    id: 'arcana-flow',
    title: 'Arcana-First Workflow',
    bullets: [
      'Arcana Layers are modular spell channels: Lens, Actor, Aether, Sigil, and Chime.',
      'Moments define exactly when each layer changes and how it blends.',
      'Event moments trigger camera focus, highlights, overlays, and combat logs.',
      'Sigil overlays can be screen-space ritual UI or world-space floating runes.',
      'Chime layers trigger precise SFX/music beats during your sequence.',
    ],
  },
  {
    id: 'board-logic',
    title: 'Board Logic and Facing',
    bullets: [
      'Actor animation applies only to the selected actor layer; add more actor layers for multi-piece choreography.',
      'Main Piece stays world-space centered for cards that do not target a board square.',
      'Positive Z is forward by default; use rotation moments to set facing style.',
      'Non-cutscene cards intentionally disable Lens layers to keep gameplay cards lightweight.',
      'Use piece type and color as identity, then drive behavior through moments.',
    ],
  },
  {
    id: 'example',
    title: 'Example: Antidote Heal Jump',
    bullets: [
      'Actor layer: moments at 0ms (rest), 220ms (rise), 450ms (land).',
      'Aether layer: burst on at 220ms, gentle glow off by 520ms.',
      'Sigil layer: text "Purified" fades in at 250ms and out at 900ms.',
      'Chime layer: play arcana:heal at 200ms, then ui:success at 470ms.',
      'Use easeOutCubic going up and easeInCubic coming down.',
    ],
  },
  {
    id: 'qol',
    title: 'Polish Pass',
    bullets: [
      'Space toggles preview play and pause.',
      'Drag moment diamonds to retime beats quickly.',
      'Use Loop Playback for quick polish passes.',
      'Use particle compatibility warnings to avoid runtime-heavy settings.',
      'Cards without cutscenes skip Lens moments by design.',
      'Export all cards as one package when balancing is complete.',
    ],
  },
];

export function ArcanaStudioTutorial({ onClose }) {
  const [active, setActive] = useState(STEPS[0].id);
  const section = useMemo(() => STEPS.find((x) => x.id === active) || STEPS[0], [active]);
  const currentIndex = Math.max(0, STEPS.findIndex((x) => x.id === section.id));

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-modal">
        <div className="tutorial-sidebar">
          <h3>Arcana Studio Tutorial</h3>
          <div className="tutorial-progress">Step {currentIndex + 1} / {STEPS.length}</div>
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
