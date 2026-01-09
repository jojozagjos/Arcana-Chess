# Phase 2: Standardized Cutscene Pipeline

## Overview

This phase establishes a unified, reusable cutscene system for all Arcana cards that require visual spectacle. The system is built on 3 core components:

1. **CameraCutscene** - Camera movement, FOV changes, smooth interpolation
2. **CutsceneOverlay** - Visual effects (monochrome, flashes, vignette, color fades)
3. **Cutscene Definitions** - Configuration files for gold-standard cutscenes

---

## Architecture

### Component Hierarchy

```
GameScene
├── CameraCutscene (ref-based control)
├── CutsceneOverlay (ref-based control)
├── Three.js Canvas
│   └── ChessPiece group
│       ├── Board
│       ├── Pieces
│       └── VFX (particles, effects)
└── Audio System (soundManager)
```

### Data Flow

```
Socket Event (arcanaTriggered)
    ↓
Check if cutscene needed
    ↓
Get cutscene config from cutsceneDefinitions.js
    ↓
Trigger camera cutscene (CameraCutscene.triggerCutscene)
    ↓
Play overlay effects (CutsceneOverlay.playEffect)
    ↓
Trigger VFX (ExecutionEffect, particles, etc.)
    ↓
Play sound effects (soundManager.play)
    ↓
Wait for all effects to complete
    ↓
Restore camera & controls
    ↓
Emit complete event
```

---

## Component Details

### CameraCutscene.jsx

**Location**: `client/src/components/CameraCutscene.jsx`

**Purpose**: Handles smooth camera movement with phase-based animation

**Features**:
- Phase-based state: idle → moving_to → holding → returning → idle
- Saves/restores camera position, target, and FOV
- Easing functions (easeInOutCubic, easeOutCubic, easeInCubic)
- Automatic OrbitControls disable/enable
- Callback on phase change and completion

**API**:
```javascript
const cutsceneRef = useRef();

cutsceneRef.current.triggerCutscene({
  targetPosition: [x, y, z],      // Final camera position
  targetLookAt: [x, y, z],        // Look-at point
  zoom: 1.5,                      // Zoom multiplier (1.0 = no zoom)
  duration: 800,                  // Time to move camera (ms)
  holdDuration: 1500,             // Time to hold position (ms)
  fov: 45,                        // Field of view (optional)
  easing: 'easeInOutCubic',      // Easing function name
  onComplete: () => {},           // Callback on finish
});
```

**Integration Point**: Update GameScene.jsx to use `<CameraCutscene ref={cutsceneRef} />`

---

### CutsceneOverlay.jsx

**Location**: `client/src/components/CutsceneOverlay.jsx`

**Purpose**: Renders visual overlay effects on top of the entire screen

**Features**:
- Multiple simultaneous overlays
- Phase-based fading (fadeIn → hold → fadeOut)
- Mix-blend-modes for proper blending
- CSS animations for smooth transitions
- No pointer events (doesn't block interaction)

**API**:
```javascript
const overlayRef = useRef();

overlayRef.current.playEffect({
  effect: 'monochrome',         // Type: 'monochrome', 'flash', 'vignette', 'color-fade'
  duration: 1000,               // Total effect duration (ms)
  intensity: 0.85,              // Effect intensity (0-1)
  color: '#000000',             // Color for flash/vignette/fade
  fadeIn: 300,                  // Time to fade in (ms)
  hold: 600,                    // Time at full intensity (ms)
  fadeOut: 100,                 // Time to fade out (ms)
  onComplete: () => {},         // Callback on finish
});
```

**Effect Types**:
- **monochrome**: Desaturates screen (gray effect)
- **flash**: Bright burst (white or colored)
- **vignette**: Darkened edges
- **color-fade**: Smooth color transition

**Integration Point**: Update GameScene.jsx to use `<CutsceneOverlay ref={overlayRef} />`

---

### cutsceneDefinitions.js

**Location**: `client/src/game/arcana/cutsceneDefinitions.js`

**Purpose**: Central configuration for all cutscene cards

**Structure**:
Each cutscene config contains:

```javascript
{
  id: 'execution',              // Card ID
  duration: 1800,               // Total cutscene duration
  config: {
    camera: {                   // Camera movement
      targetZoom: 1.8,
      duration: 800,
      holdDuration: 1000,
      easing: 'easeInOutCubic',
    },
    overlay: {                  // Screen overlay effects
      effect: 'flash',
      color: '#ff6b6b',
      duration: 300,
      intensity: 0.8,
      fadeIn: 100,
      hold: 100,
      fadeOut: 100,
    },
    vfx: {                      // 3D visual effects (particles, etc.)
      guillotineDuration: 600,
      destructionParticles: 24,
      destructionIntensity: 1.0,
    },
    sound: {                    // Audio cues
      guillotine: 'arcana:execution_guillotine',
      destroy: 'arcana:execution_destroy',
      complete: 'arcana:execution_complete',
    },
    phases: [                   // Timeline of events
      {
        name: 'camera_focus',
        duration: 800,
        actions: ['camera_move', 'sound_guillotine'],
      },
      {
        name: 'execution',
        duration: 1000,
        actions: ['vfx_guillotine', 'vfx_destruction', 'overlay_flash', 'sound_destroy'],
        delay: 400,             // Wait 400ms before starting actions
      },
      {
        name: 'camera_return',
        duration: 800,
        actions: ['sound_complete'],
      },
    ],
  },
}
```

**Gold-Standard Cutscenes** (Phase 3 implementation):
1. **Execution** - Guillotine animation, red flash, piece destruction
2. **Time Freeze** - Monochrome overlay, freeze particles
3. **Time Travel** - Color fade to B&W, reverse move animation, color restoration

---

## Implementation Timeline

### Step 1: Integrate CameraCutscene (GameScene.jsx)

```jsx
import CameraCutscene from './CameraCutscene';

function GameScene() {
  const cutsceneRef = useRef();
  
  return (
    <>
      <CameraCutscene ref={cutsceneRef} />
      <Canvas>
        {/* ... */}
      </Canvas>
    </>
  );
}
```

### Step 2: Integrate CutsceneOverlay (GameScene.jsx)

```jsx
import CutsceneOverlay from './CutsceneOverlay';

function GameScene() {
  const overlayRef = useRef();
  
  return (
    <>
      <CutsceneOverlay ref={overlayRef} />
      <CameraCutscene ref={cutsceneRef} />
      <Canvas>
        {/* ... */}
      </Canvas>
    </>
  );
}
```

### Step 3: Orchestrate Cutscenes (GameScene.jsx)

```jsx
import { getCutsceneConfig } from '../game/arcana/cutsceneDefinitions';

useEffect(() => {
  const handleArcanaTriggered = (payload) => {
    const { arcanaId, params } = payload;
    const cutsceneConfig = getCutsceneConfig(arcanaId);
    
    if (!cutsceneConfig) return; // No cutscene for this card
    
    // Orchestrate the cutscene
    orchestrateCutscene({
      config: cutsceneConfig,
      targetSquare: params?.targetSquare,
      cameraRef: cutsceneRef,
      overlayRef: overlayRef,
      onComplete: () => {
        console.log(`${arcanaId} cutscene complete`);
      },
    });
  };
  
  socket.on('arcanaTriggered', handleArcanaTriggered);
  return () => socket.off('arcanaTriggered', handleArcanaTriggered);
}, [socket, cutsceneRef, overlayRef]);
```

### Step 4: Implement orchestrateCutscene Helper

```jsx
function orchestrateCutscene({ config, targetSquare, cameraRef, overlayRef, onComplete }) {
  const { camera, overlay, vfx, sound, duration } = config.config;
  
  // Calculate camera position from target square
  const [boardX, , boardZ] = squareToPosition(targetSquare);
  const cameraPos = [boardX, camera.targetZoom * 5, boardZ + 3];
  
  // Start camera movement
  cameraRef.current?.triggerCutscene({
    targetPosition: cameraPos,
    targetLookAt: [boardX, 0.5, boardZ],
    zoom: camera.targetZoom,
    duration: camera.duration,
    holdDuration: camera.holdDuration,
    easing: camera.easing,
  });
  
  // Play overlay effects
  if (overlay) {
    const overlayDelay = camera.duration * 0.5;
    setTimeout(() => {
      overlayRef.current?.playEffect({
        ...overlay,
        onComplete: () => {
          // Overlay done
        },
      });
    }, overlayDelay);
  }
  
  // Play VFX (delegate to existing effect components)
  // Play sounds
  // ...
  
  // Wait for all to complete
  setTimeout(onComplete, duration);
}
```

---

## Gold-Standard Cutscene Configs

### Execution
- **Duration**: 1800ms
- **Camera**: Zoom 1.8x, 800ms focus, 1000ms hold
- **Overlay**: Red flash (0-300ms)
- **VFX**: Guillotine animation + destruction particles
- **Sound**: Guillotine drop → destruction → complete

### Time Freeze
- **Duration**: 2000ms
- **Camera**: Zoom 1.3x, 400ms focus, 1800ms hold
- **Overlay**: Monochrome (400-1600ms, 85% intensity)
- **VFX**: Snow particles, icy glow
- **Sound**: Freeze effect → ambient loop → unfreeze

### Time Travel
- **Duration**: 2500ms
- **Camera**: Zoom 1.5x, 600ms focus, 1300ms hold
- **Overlay**: Color fade to B&W (0-600ms) → monochrome hold (600-1600ms) → color restore (1600-2200ms)
- **VFX**: Reverse move animation, rewind trails
- **Sound**: Rewind sound → ambient → complete

---

## Integration Checklist

- [ ] Create CameraCutscene.jsx
- [ ] Create CutsceneOverlay.jsx
- [ ] Create CutsceneOverlay.css
- [ ] Create cutsceneDefinitions.js
- [ ] Import in GameScene.jsx
- [ ] Create orchestrateCutscene() helper
- [ ] Add ref handling for camera and overlay
- [ ] Hook socket event for cutscene trigger
- [ ] Test camera movement with easing
- [ ] Test overlay effects with blend modes
- [ ] Test multiple simultaneous overlays
- [ ] Test OrbitControls disable/enable
- [ ] Implement helper functions in GameScene.jsx

---

## Notes

- All cutscenes LOCK controls (OrbitControls disabled) during playback
- Cutscenes are **synchronous** on client (all players see same timing)
- Server sends `arcanaTriggered` event with cutscene flag
- Sound manager handles null/missing sound keys gracefully
- Overlay effects use CSS animations for performance
- Camera transitions use easing for smoothness
- VFX components (Execution, particles) integrate independently
