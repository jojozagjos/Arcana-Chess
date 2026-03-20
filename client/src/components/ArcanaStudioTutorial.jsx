import React, { useMemo, useState } from 'react';

const STEPS = [
  {
    id: 'quickstart',
    title: 'Quick Start',
    bullets: [
      'Pick a card from the left library.',
      'Every card gets one Main Piece object at center so you can animate immediately.',
      'Move/Rotate/Scale gizmos stay visible while the piece is selected; click empty ground to deselect.',
      'If the object has no keyframe yet, moving with gizmos auto-creates the first keyframe at the playhead.',
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
    id: 'piece-logic',
    title: 'Piece Logic and Facing',
    bullets: [
      'Object-track animation applies to the selected object track only; add more object tracks to animate more pieces.',
      'Main Piece uses world-space at board center for cards that do not target a board square.',
      'Front direction guide: positive Z is forward by default; use rotation keys to set facing for your animation.',
      'For non-cutscene cards, camera tracks are intentionally disabled to keep gameplay cards lightweight.',
      'Use piece-type and color as identity, then drive motion entirely from timeline keys.',
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
      'Drag timeline diamonds to retime keyframes quickly.',
      'Use Loop Playback for quick polish passes.',
      'Cards without cutscenes skip camera keyframing by design.',
      'Export all cards as one package when done balancing.',
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
