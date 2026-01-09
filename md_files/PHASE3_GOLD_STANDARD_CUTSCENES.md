# Phase 3: Gold-Standard Cutscene Implementation

## Overview

This phase implements the three legendary cutscene cards with full visuals, camera movement, overlays, and sound effects:

1. **Execution** - Guillotine animation with red flash and FOV spike
2. **Time Freeze** - Monochrome overlay with freeze particles and ice crystals  
3. **Time Travel** - Reverse time spiral, temporal trails, and B&W fade transition

---

## Implementation Status

### VFX Components (✓ COMPLETE)

All three cutscene effects are implemented in `arcanaVisuals.jsx`:

- **ExecutionEffect** (line 1004) - X-cross animation, shatter particles, red glow
- **TimeFreezeEffect** (line 1072) - Frozen clock, ice crystals, frozen wave, ambient glow
- **TimeTravelEffect** (line 1141) - Reverse spiral, rewind trails, distortion field, temporal wave

### Cutscene Configuration (✓ COMPLETE)

Complete configs in `cutsceneDefinitions.js`:
- **executionCutscene** - 1800ms total, 1.8x zoom, red flash overlay
- **timeFrozenCutscene** - 2000ms total, 1.3x zoom, monochrome 85% intensity overlay
- **timeTravelCutscene** - 2500ms total, 1.5x zoom, dual overlay (fade→monochrome→restore)

### Cutscene Infrastructure (✓ COMPLETE)

New components and helpers:
- **CameraCutscene.jsx** - Camera movement with phase-based animation, FOV control, easing
- **CutsceneOverlay.jsx** - Overlay effects with blend modes and CSS animations
- **cutsceneOrchestrator.js** - Timing orchestration, action execution, cleanup

---

## Integration with GameScene.jsx

### Current State

GameScene already has:
- Basic cutscene trigger logic (line 144-151)
- `cutsceneCards` array for detection
- `triggerCutscene()` call on lastArcanaEvent
- VFX loading via ArcanaVisualHost

### Changes Required

#### 1. Import new components

```jsx
import CameraCutscene from './CameraCutscene';
import CutsceneOverlay from './CutsceneOverlay';
import { orchestrateCutscene } from '../game/arcana/cutsceneOrchestrator.js';
```

#### 2. Create refs for camera and overlay

```jsx
const cutsceneRef = useRef();
const overlayRef = useRef();
```

#### 3. Add refs to JSX

```jsx
return (
  <>
    <CutsceneOverlay ref={overlayRef} />
    <CameraCutscene ref={cutsceneRef} onPhaseChange={handlePhaseChange} />
    <Canvas>
      {/* ... */}
    </Canvas>
  </>
);
```

#### 4. Enhance the cutscene trigger logic

Replace the existing cutscene code (line 144-151) with:

```jsx
useEffect(() => {
  if (!lastArcanaEvent) return;
  setActiveVisualArcana(lastArcanaEvent);
  
  const { arcanaId, params } = lastArcanaEvent;
  const cutsceneCards = ['execution', 'divine_intervention', 'astral_rebirth', 'time_travel', 'mind_control'];
  
  if (cutsceneCards.includes(arcanaId) && params?.targetSquare) {
    // Orchestrate full cutscene with camera, overlay, and VFX
    orchestrateCutscene({
      arcanaId,
      cameraRef: cutsceneRef,
      overlayRef,
      soundManager,
      targetSquare: params.targetSquare,
      onVFXTrigger: (vfxConfig) => {
        // Trigger VFX through ArcanaVisualHost
        // Implementation depends on how effects are currently triggered
        console.log('VFX trigger:', vfxConfig);
      },
      onComplete: () => {
        console.log(`${arcanaId} cutscene complete`);
      },
    });
  }
  
  const t = setTimeout(() => setActiveVisualArcana(null), 1500);
  return () => clearTimeout(t);
}, [lastArcanaEvent]);
```

---

## Execution Cutscene Details

### Timing
- **Duration**: 1800ms
- **Camera Focus**: 0-800ms (moves to target, 1.8x zoom)
- **Execution**: 400-1400ms (guillotine falls, piece destroyed)
- **Camera Return**: 1400-1800ms

### Visuals
1. **ExecutionEffect Component** (0ms)
   - X-cross animation (red, easeOutCubic)
   - 16 shatter particles exploding outward
   - Glow intensity 4 → 0

2. **Overlay Flash** (400ms)
   - Red flash (#ff6b6b)
   - 300ms duration
   - Intensity 0.8
   - fadeIn: 100ms, hold: 100ms, fadeOut: 100ms

3. **Sound Effects**
   - 0ms: Guillotine drop sound
   - 800ms: Piece destruction sound
   - 1500ms: Completion/impact sound

### Server Flow
1. Server: `applyExecution()` validates target
2. Server: Removes piece from FEN
3. Socket: Sends `arcanaTriggered` with targetSquare
4. Client: Renders cutscene and destroys piece from board
5. GameScene: Updates board state from new FEN

---

## Time Freeze Cutscene Details

### Timing
- **Duration**: 2000ms
- **Camera Focus**: 0-400ms (moves to target, 1.3x zoom)
- **Freeze State**: 400-1600ms (monochrome + particles)
- **Camera Return**: 1600-2000ms

### Visuals
1. **TimeFreezeEffect Component** (0ms)
   - Frozen clock ring spinning
   - 24 ice crystals expanding outward
   - Glow color: cyan (#4fc3f7)
   - Frozen wave expanding

2. **Overlay Monochrome** (400ms)
   - Grayscale desaturation
   - 2000ms total duration
   - Intensity 0.85
   - fadeIn: 400ms, hold: 1200ms, fadeOut: 400ms

3. **Sound Effects**
   - 0ms: Freeze sound effect
   - 600ms: Ambient/wind loop starts
   - 1800ms: Unfreeze sound

### Opponent Experience
- Board becomes grayscale
- Opponent is SKIPPED next turn (server handles)
- Unfreeze happens after opponent's turn would be
- Visual returns to color

---

## Time Travel Cutscene Details

### Timing
- **Duration**: 2500ms
- **Camera Focus**: 0-600ms (moves to target, 1.5x zoom)
- **Rewind**: 600-1300ms (reverse moves play)
- **Return**: 1600-2500ms (camera returns, color restores)

### Visuals
1. **TimeTravelEffect Component** (0ms)
   - Reverse time spiral (12 rotating orbs)
   - 16 rewind trails moving backward
   - Blue distortion field (#0d47a1)
   - Temporal displacement wave

2. **Overlay Effects** (Multi-phase)
   - **Fade to B&W** (0-600ms): Color → grayscale transition
     - Color fade to #2c3e50
     - 600ms duration
     - fadeIn: 200ms, hold: 200ms, fadeOut: 200ms
   - **Hold B&W** (600-1600ms): Monochrome during rewind
     - Intensity 1.0
   - **Fade to Color** (1600-2200ms): Grayscale → color restoration
     - Color fade from #2ecc71
     - fadeOut: 600ms

3. **Sound Effects**
   - 0ms: Rewind sound (high-pitched)
   - 600ms: Ambient rewind loop
   - 1800ms: Completion sound

4. **Board Animation**
   - Pieces animate BACKWARDS to previous positions
   - Captured pieces REAPPEAR
   - Requires special move reversal animation

### Server Flow
1. Server: Calls `applyTimeTravel()`
2. Server: Reverts last 2 moves (yours + opponent's)
3. Server: Restores FEN from history
4. Socket: Sends `arcanaTriggered` with prev FEN
5. Client: Renders cutscene
6. Client: Animates pieces reversing to old positions
7. Client: Updates board from restored FEN

---

## Implementation Checklist

### Core Cutscene System
- [x] CameraCutscene.jsx (camera movement, easing, phase control)
- [x] CutsceneOverlay.jsx (screen effects, blend modes)
- [x] CutsceneOverlay.css (animations, transitions)
- [x] cutsceneDefinitions.js (all 6 cutscene configs)
- [x] cutsceneOrchestrator.js (timing, action execution)

### VFX Components
- [x] ExecutionEffect (X-cross, particles, glow)
- [x] TimeFreezeEffect (clock, ice, wave)
- [x] TimeTravelEffect (spiral, trails, distortion)

### GameScene Integration
- [ ] Import CameraCutscene, CutsceneOverlay, orchestrateCutscene
- [ ] Add cutsceneRef, overlayRef
- [ ] Render components in JSX
- [ ] Update cutscene trigger logic to use orchestrateCutscene()
- [ ] Connect onVFXTrigger callback to ArcanaVisualHost

### Testing & Validation
- [ ] Test Execution: camera moves, red flash, piece disappears
- [ ] Test Time Freeze: monochrome overlay, opponent skipped, color returns
- [ ] Test Time Travel: B&W fade, pieces reverse, color restoration
- [ ] Test multiplayer (both players see cutscene, state sync)
- [ ] Test Card Tester (dev tool shows same visuals)
- [ ] Test OrbitControls disabled during cutscene
- [ ] Test sound effects play in order
- [ ] Test cleanup on abort/disconnect

---

## Audio Requirements

Create/verify these sound files exist:

**Execution**
- `arcana:execution_guillotine` - Guillotine drop (sharp, metallic)
- `arcana:execution_destroy` - Piece destruction (crash, shattering)
- `arcana:execution_complete` - Impact finish (low thud)

**Time Freeze**
- `arcana:time_freeze_freeze` - Freeze magic (icy whoosh)
- `arcana:time_freeze_ambient` - Ambient wind (loopable, quiet)
- `arcana:time_freeze_unfreeze` - Unfreeze release (magical tone)

**Time Travel**
- `arcana:time_travel_rewind` - Rewind sound (high-pitched wind-up)
- `arcana:time_travel_ambient` - Temporal ambient (ethereal, loopable)
- `arcana:time_travel_complete` - Completion (magical chime)

---

## Known Limitations & Future Work

1. **Move Reversal Animation** (Time Travel)
   - Currently pieces update instantly
   - Should animate backward along move path
   - Requires piece position tracking

2. **Opponent Skip Visualization** (Time Freeze)
   - Server skips opponent turn correctly
   - Client shows monochrome during their "turn"
   - No explicit "SKIPPED" message yet

3. **Camera Per-Cutscene Customization**
   - Current system focuses on target square
   - Could support custom camera positions per card
   - Execution could use guillotine animation cam

4. **VFX Cleanup**
   - Effects properly cleanup via onComplete
   - Should verify no orphaned components remain
   - Test rapid-fire cutscenes (stress test)

---

## Testing Instructions

### In-Game Test

1. **Execution**
   - Play game, draw Execution card
   - Target enemy piece (not king)
   - Observe: Camera zooms, piece red-flashes, piece disappears
   - Wait 1800ms, camera returns
   - Verify opponent sees piece missing

2. **Time Freeze**
   - Play game, draw Time Freeze card
   - Use card (no targeting)
   - Observe: Screen fades to grayscale, ambient sound
   - Opponent's turn is SKIPPED
   - Wait ~1600ms, screen returns to color
   - Verify you get next turn

3. **Time Travel**
   - Play game with opponent, make 2+ moves each
   - Draw Time Travel card
   - Use card (no targeting)
   - Observe: Screen fades to B&W, pieces animate backward
   - All pieces return to positions 2 moves ago
   - Screen fades back to color
   - Verify state is correct

### Card Tester Test

- Launch CardBalancingToolV2
- Simulate Execution, Time Freeze, Time Travel
- Verify overlays appear
- Verify no camera errors (dev tool doesn't use camera cutscene)
- Verify state is correct

### Multiplayer Test

- Two browsers, both in game
- Player 1: Uses Execution
- Verify: Both see same cutscene, same timing
- Player 1: Uses Time Freeze
- Verify: Both see freeze, Player 2's turn skipped
- Player 1: Uses Time Travel
- Verify: Both see rewind, state is identical

---

## Performance Notes

- Overlay effects use CSS animations (GPU-accelerated)
- VFX components are ephemeral (cleaned up after duration)
- Camera movement uses easing (smooth, not linear)
- No new geometry created per-frame (pre-allocated meshes)
- Sound loops stopped explicitly after duration

---

## Next Steps (Phase 4)

After Phase 3 cutscenes are tested:
1. Audit remaining 40 cards for state cleanup, validation, privacy
2. Fix Double Strike / Berserker Rage non-adjacent rule validation
3. Implement Temporal Echo pattern validation
4. Add Arcane Cycle discard UI
5. Verify Mirror Image/Poison/Curse array cleanup
6. Test all cards in Card Tester for parity with in-game
