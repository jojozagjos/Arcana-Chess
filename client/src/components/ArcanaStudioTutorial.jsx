import React, { useMemo, useState } from 'react';

const STEPS = [
  {
    id: 'quickstart',
    title: 'New Quickstart',
    bullets: [
      'Pick a card from the left library.',
      'Use Piece and Audio tracks for timeline authoring in the new lightweight Studio flow.',
      'Legacy Game Config gives direct JSON control for camera, phases, sounds, and timing.',
      'Legacy VFX Values lets you edit effect numbers directly (size, amount, delays, intensity).',
      'Card Visual Config is available for every card so you can edit/import visual JSON globally.',
      'Play, retime, and export once the sequence matches the in-game feel.',
    ],
  },
  {
    id: 'events',
    title: 'Studio Event Catalog',
    bullets: [
      'Event track keys use Event Type + Payload JSON and are normalized at runtime.',
      'Supported families: highlight_*, sound_*, camera_*, overlay_*, vfx_*, and log/combat_log/status_log.',
      'Use Delay (ms) plus payload values to sync events with camera shots, sounds, and overlays.',
      'Legacy phase action names are supported, so imported cutscene cards still play correctly.',
    ],
  },
  {
    id: 'legacy-vfx',
    title: 'Blade and Blood Editing',
    bullets: [
      'Execution blade and blood values are in Legacy VFX Values under config.vfx.',
      'Edit fields like bladeDuration, bloodExplosionDelay, bloodParticles, and destructionIntensity.',
      'Apply VFX Values to update the selected card and keep it in sync with cutscene timing.',
      'Use Apply Legacy Config when you need to change whole phase/action timing blocks.',
      'The same VFX edit flow works for all cutscene cards that expose config.vfx fields.',
    ],
  },
  {
    id: 'all-cards-visuals',
    title: 'Visuals For Every Card',
    bullets: [
      'Card Visual Config is imported from the selected card definition visual object.',
      'You can edit booleans and any additional visual metadata as raw JSON.',
      'Apply Visual Config stores per-card overrides inside Studio card metadata.',
      'Reset Visual Draft restores the current card visual source object.',
      'This editor is available for every card, not only cutscene cards.',
    ],
  },
  {
    id: 'qol',
    title: 'Polish Pass',
    bullets: [
      'Space toggles preview play and pause.',
      'Drag moment diamonds to retime beats quickly.',
      'Use Loop Playback for quick polish passes.',
      'Use Event Payload JSON to line up camera, overlay, and VFX action timing.',
      'Validate by running gameplay and checking event alignment against card outcome timing.',
      'Export all cards as one package when balancing is complete.',
    ],
  },
];

export function ArcanaStudioTutorial({ onClose, eventTypes = [] }) {
  const [active, setActive] = useState(STEPS[0].id);
  const section = useMemo(() => STEPS.find((x) => x.id === active) || STEPS[0], [active]);
  const currentIndex = Math.max(0, STEPS.findIndex((x) => x.id === section.id));
  const normalizedEventTypes = useMemo(() => {
    return [...new Set((eventTypes || []).map((entry) => String(entry || '').trim()).filter(Boolean))].sort();
  }, [eventTypes]);

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
            {section.id === 'events' ? (
              <>
                <div className="tutorial-progress" style={{ marginTop: 12 }}>All Event Types In This Build ({normalizedEventTypes.length})</div>
                <div className="tutorial-event-grid">
                  {normalizedEventTypes.map((eventType) => (
                    <span key={eventType} className="tutorial-event-chip">{eventType}</span>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
