import React, { useState } from 'react';

const TUTORIAL_SECTIONS = [
  {
    id: 'getting-started',
    title: '1. Getting Started',
    content: (
      <div>
        <p><strong>Welcome to Arcana Studio!</strong> This is a full-featured cutscene editor for creating animations and visual effects for chess cards.</p>
        <h4>First Steps:</h4>
        <ul>
          <li><strong>Create a New Card:</strong> Click "New Card" to create a blank card with a unique ID</li>
          <li><strong>Load Existing Card:</strong> Use the "Load Existing Card..." dropdown to select from cutscenes you've already made</li>
          <li><strong>Import from JSON:</strong> Click "Import JSON" to load a previously exported card file</li>
        </ul>
        <p>Once you create or load a card, it will appear in the "Loaded Cards" section on the left sidebar.</p>
      </div>
    ),
  },
  {
    id: 'viewport',
    title: '2. The Viewport',
    content: (
      <div>
        <p>The viewport is your 3D editing space where you can visualize and manipulate your animations.</p>
        <h4>Camera Controls:</h4>
        <ul>
          <li><strong>Rotate:</strong> Middle mouse button + drag (or Alt + Left click + drag)</li>
          <li><strong>Pan:</strong> Middle mouse button + Shift + drag</li>
          <li><strong>Zoom:</strong> Mouse scroll wheel</li>
        </ul>
        <h4>Viewport Modes:</h4>
        <ul>
          <li><strong>Preview Cam:</strong> Shows the camera position from your camera keyframes</li>
          <li><strong>Free Cam:</strong> Free exploration mode (recommended for editing)</li>
        </ul>
        <h4>Transform Controls:</h4>
        <ul>
          <li><strong>G + Move:</strong> Set translate mode to move objects</li>
          <li><strong>R + Rotate:</strong> Set rotate mode to rotate objects</li>
          <li><strong>S + Scale:</strong> Set scale mode to scale objects</li>
        </ul>
        <p>Click on any object in the viewport to select it for transformation. The selected object will show its name as a label.</p>
      </div>
    ),
  },
  {
    id: 'timeline',
    title: '3. Timeline & Keyframes',
    content: (
      <div>
        <p>The timeline shows all your tracks (camera, objects, particles, overlays, sounds, events) and their keyframes across time.</p>
        <h4>Scrubbing the Timeline:</h4>
        <ul>
          <li><strong>Click on the slider:</strong> Jump to that time</li>
          <li><strong>Drag the slider:</strong> Scrub smoothly through time</li>
          <li><strong>Click on a keyframe:</strong> Jump to that keyframe's time</li>
          <li><strong>Drag a keyframe:</strong> Move it to a new time (updates the inspector)</li>
        </ul>
        <h4>Adding Keyframes:</h4>
        <ul>
          <li><strong>Double-click on a track:</strong> Add a new keyframe at that time</li>
          <li><strong>Click "Add Key":</strong> Add a keyframe at the current playhead position</li>
        </ul>
        <h4>Playback:</h4>
        <ul>
          <li><strong>Press Space:</strong> Play/pause from the current position</li>
          <li><strong>Click "Play":</strong> Start playback</li>
          <li><strong>Click "Rewind":</strong> Return to the start</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'tracks',
    title: '4. Track Types',
    content: (
      <div>
        <h4>Camera Track:</h4>
        <p>Controls the camera position, target, field of view (FOV), and smooth blending between keyframes.</p>
        <ul>
          <li>Set position and look-at target</li>
          <li>Adjust FOV for zoom</li>
          <li>Choose easing (linear, ease-in, ease-out, etc.)</li>
          <li>Use blend modes: "cut" for instant changes or "curve" for smooth transitions</li>
        </ul>

        <h4>Object Track:</h4>
        <p>Animates chess pieces, meshes, or custom objects with position, rotation, and scale.</p>
        <ul>
          <li><strong>Type:</strong> "piece" = chess piece, "mesh" = custom 3D model, "part" = abstract shape</li>
          <li><strong>Piece Square:</strong> Which square the piece starts on (e.g., "e4")</li>
          <li><strong>Attach Mode:</strong> "follow" keeps it attached to its source, "world-space" for absolute positioning</li>
          <li>Animate position, rotation, and scale at different times</li>
        </ul>

        <h4>Particle Track:</h4>
        <p>Emits particles for magical effects, explosions, or visual feedback.</p>
        <ul>
          <li>Control emission rate, velocity, lifetime, size</li>
          <li>Set colors that change over the particle lifetime</li>
          <li>Add gravity and drag for realistic motion</li>
          <li>Choose spawn shape: sphere, cube, etc.</li>
        </ul>

        <h4>Overlay Track:</h4>
        <p>Display text or images on screen (HUD elements) or anchored to the world.</p>
        <ul>
          <li><strong>Space:</strong> "screen" = HUD (stays on screen), "world" = anchored to 3D position</li>
          <li><strong>Type:</strong> "text" = display text, "image" = show an image, "panel" = display a styled background</li>
          <li>Control position, opacity, scale, and rotation</li>
        </ul>

        <h4>Sound Track:</h4>
        <p>Play audio samples at specific times with volume and pitch control.</p>
        <ul>
          <li>Select a sound by ID (from your audio assets)</li>
          <li>Adjust volume (0-1) and pitch (0.5-2 typical range)</li>
          <li>Loop sounds or play them once</li>
        </ul>

        <h4>Event Track:</h4>
        <p>Trigger custom events linked to game logic (e.g., "highlight_squares", "create_explosion").</p>
        <ul>
          <li>Each event has a type and optional payload</li>
          <li>Set a delay before the event fires</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'outliner',
    title: '5. Outliner & Selection',
    content: (
      <div>
        <p>The <strong>Outliner</strong> on the left sidebar shows all tracks in your card. Click on a track to select it and edit its properties in the Inspector.</p>
        <h4>Adding Tracks:</h4>
        <ul>
          <li>Click the "+ Camera" button to add a camera track</li>
          <li>Click "+ Object" to add an object/piece animation</li>
          <li>Click "+ Particle" to add particle effects</li>
          <li>Click "+ Overlay" to add text/image overlays</li>
          <li>Click "+ Sound" to add audio</li>
          <li>Click "+ Event" to add custom events</li>
        </ul>
        <h4>Track Labels:</h4>
        <p>Each track shows its type and a descriptive name. For objects, it shows which piece is being animated. For overlays, it shows the content type.</p>
      </div>
    ),
  },
  {
    id: 'inspector',
    title: '6. Inspector Panel',
    content: (
      <div>
        <p>The <strong>Inspector</strong> on the right sidebar shows detailed properties of the selected track or keyframe.</p>
        <h4>Card Properties:</h4>
        <ul>
          <li><strong>Card ID:</strong> Unique identifier (lowercase, underscores)</li>
          <li><strong>Name:</strong> Display name for the card</li>
          <li><strong>Duration:</strong> Total length in milliseconds</li>
          <li><strong>FEN:</strong> Starting chess board state (optional)</li>
          <li><strong>Auto Key:</strong> Automatically create keyframes while dragging objects</li>
          <li><strong>Timeline Snap:</strong> Snap keyframes to this grid (in ms)</li>
        </ul>

        <h4>Track Properties:</h4>
        <p>When a track is selected, you'll see properties specific to that track type (camera params, object type, particle settings, etc.).</p>

        <h4>Keyframe Properties:</h4>
        <p>When a keyframe is selected (from the timeline), you can edit:</p>
        <ul>
          <li><strong>Time (ms):</strong> When this keyframe occurs</li>
          <li><strong>Position/Rotation/Scale:</strong> For object tracks</li>
          <li><strong>Camera Target/FOV:</strong> For camera tracks</li>
          <li><strong>Easing:</strong> How smoothly to blend to the next keyframe</li>
          <li>Type-specific properties (opacity, sound ID, event type, etc.)</li>
        </ul>
        <p>Edit these values directly in the input fields to fine-tune your animation!</p>
      </div>
    ),
  },
  {
    id: 'graph',
    title: '7. Graph Preview',
    content: (
      <div>
        <p>The <strong>Graph Preview</strong> at the bottom right shows the easing curve of the selected keyframe.</p>
        <h4>Understanding Easing:</h4>
        <p>The curve shows how values blend between keyframes:</p>
        <ul>
          <li><strong>Linear:</strong> Straight line = constant speed</li>
          <li><strong>Ease-in:</strong> Slow start, fast end</li>
          <li><strong>Ease-out:</strong> Fast start, slow end</li>
          <li><strong>Ease-in-out:</strong> Slow start and end, fast middle</li>
          <li><strong>Custom Bezier:</strong> Define your own curve with 4 control points</li>
        </ul>
        <p>Select different easing modes in the Inspector to change the curve shape.</p>
      </div>
    ),
  },
  {
    id: 'advanced',
    title: '8. Advanced Tips',
    content: (
      <div>
        <h4>Keyboard Shortcuts:</h4>
        <ul>
          <li><strong>Ctrl+Z / Cmd+Z:</strong> Undo last change</li>
          <li><strong>Ctrl+Shift+Z / Cmd+Shift+Z:</strong> Redo</li>
          <li><strong>Space:</strong> Play/pause</li>
          <li><strong>G:</strong> Translate mode</li>
          <li><strong>R:</strong> Rotate mode</li>
          <li><strong>S:</strong> Scale mode</li>
          <li><strong>Delete/Backspace:</strong> Remove selected keyframe</li>
        </ul>

        <h4>Piece Animation Best Practices:</h4>
        <ul>
          <li>Create an object track and set it to "piece" type</li>
          <li>Set the "Piece Square" to where the piece starts (e.g., "e2")</li>
          <li>Keyframe the position to move the piece between squares</li>
          <li>Use "follow" attach mode to keep it relative to the board</li>
        </ul>

        <h4>Multi-Track Coordination:</h4>
        <ul>
          <li>Multiple tracks play simultaneously - use matching duration for coordinated effects</li>
          <li>Set keyframes at the same time on different tracks to synchronize animations</li>
          <li>Camera cuts should align with action for dramatic effect</li>
        </ul>

        <h4>Exporting & Saving:</h4>
        <ul>
          <li><strong>Save Runtime:</strong> Stores your card in browser localStorage for playtime integration</li>
          <li><strong>Export Card:</strong> Downloads a JSON file of your card (for backup/sharing)</li>
          <li><strong>Export Legacy:</strong> Exports in the old format (for compatibility)</li>
        </ul>

        <h4>Performance Tips:</h4>
        <ul>
          <li>Keep particle counts reasonable (&lt; 100 typically)</li>
          <li>Use "cut" blend mode for instant camera changes instead of curves</li>
          <li>Test on target devices to ensure smooth playback</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'troubleshooting',
    title: '9. Troubleshooting',
    content: (
      <div>
        <h4>Camera resets during transform:</h4>
        <p>This is normal! The camera previews and moves as you drag objects. Switch to "Free Cam" mode to pan freely while transforming.</p>

        <h4>Keyframes not appearing:</h4>
        <p>Make sure the track is selected and visible in the timeline. Check that keyframes are at valid times (0 to duration).</p>

        <h4>Object not animating:</h4>
        <ul>
          <li>Check that the object track is enabled (visible in timeline)</li>
          <li>Make sure keyframes have different position/rotation/scale values</li>
          <li>Verify the duration is long enough for the animation to play</li>
        </ul>

        <h4>Particles not showing:</h4>
        <p>Check the particle track's "enabled" keyframe property. Make sure the "emit" keyframe is set to true during playback.</p>

        <h4>Audio not playing:</h4>
        <p>Verify the sound ID matches your audio assets in the public folder. Audio must be in WAV, MP3, or OGG format.</p>

        <h4>Changes not saving:</h4>
        <p>Click "Save Runtime" to persist your card to browser storage. This enables playback in the game.</p>
      </div>
    ),
  },
  {
    id: 'workflow',
    title: '10. Complete Workflow Example',
    content: (
      <div>
        <p>Here's a typical workflow for creating a simple card animation:</p>
        <ol>
          <li><strong>Create a card:</strong> Click "New Card" and give it a name like "pawn_advance"</li>
          <li><strong>Set the board:</strong> In the Inspector, set the FEN to your starting position</li>
          <li><strong>Add camera track:</strong> Click "+ Camera" and position your first keyframe</li>
          <li><strong>Add object track:</strong> Click "+ Object", set it to "piece" type, and set "Piece Square" to "e2"</li>
          <li><strong>Create keyframes:</strong> 
            <ul>
              <li>At time 0ms: object at [0,0,0] (relative to e2)</li>
              <li>At time 500ms: object at [0,0,1] (one square forward - e3)</li>
            </ul>
          </li>
          <li><strong>Add effects:</strong> Click "+ Overlay" to add a text effect like "Pawn Advance!"</li>
          <li><strong>Test:</strong> Press Space to play and watch your animation</li>
          <li><strong>Export:</strong> Once satisfied, click "Save Runtime" to save it</li>
        </ol>
        <p>That's it! You now have your first card animation ready for gameplay.</p>
      </div>
    ),
  },
];

export function ArcanaStudioTutorial({ onClose }) {
  const [selectedSection, setSelectedSection] = useState('getting-started');

  const currentSection = TUTORIAL_SECTIONS.find((s) => s.id === selectedSection);

  return (
    <div className="tutorial-overlay">
      <div className="tutorial-modal">
        <div className="tutorial-sidebar">
          <h3>Tutorial</h3>
          {TUTORIAL_SECTIONS.map((section) => (
            <button
              key={section.id}
              className={`tutorial-nav-item ${selectedSection === section.id ? 'active' : ''}`}
              onClick={() => setSelectedSection(section.id)}
            >
              {section.title}
            </button>
          ))}
        </div>
        <div className="tutorial-content">
          <div className="tutorial-header">
            <h2>{currentSection?.title}</h2>
            <button className="tutorial-close" onClick={onClose}>✕</button>
          </div>
          <div className="tutorial-body">
            {currentSection?.content}
          </div>
        </div>
      </div>
    </div>
  );
}
