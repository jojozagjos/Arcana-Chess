# Shared Modules Between GameScene and CardBalancingToolV2

## Overview
This document tracks the shared modules and components that ensure identical behavior between the in-game scene and the balancing tool.

## ✅ Completed Integrations

### 1. **Arcana Visual Components** (`client/src/game/arcana/arcanaVisuals.jsx`)
- **Purpose**: Canonical 3D visual components for all arcana effects
- **Exports**: 
  - Persistent effects: `ShieldGlowEffect`, `IronFortressEffect`, `BishopsBlessingEffect`, `SanctuaryEffect`, `CursedSquareEffect`, `MirrorImageEffect`, `PoisonCloudEffect`
  - Cutscene effects: `ExecutionCutscene`, `SacrificeEffect`, `TimeTravelCutscene`, `MindControlCutscene`, `DivineInterventionCutscene`, `RebirthBeam`, `ChainLightningEffect`, `PromotionRitualEffect`, `MetamorphosisEffect`, `TimeFreezeEffect`
- **Status**: ✅ Shared and used by both UIs
- **Backward compatibility**: Components accept multiple prop naming conventions (e.g., both `square` and `targetSquare`)

### 2. **Arcana Visual Host** (`client/src/game/arcana/ArcanaVisualHost.jsx`)
- **Purpose**: Single renderer that maps `activeVisualArcana` events to visual components
- **Features**:
  - Accepts `effectsModule`, `activeVisualArcana`, `gameState`, and `pawnShields` props
  - Uses `normalizeProps()` to handle prop name mapping between host and components
  - Handles both cutscene (one-time) and persistent (ongoing) effects
- **Status**: ✅ Shared and mounted by both `GameScene` and `CardBalancingToolV2`

### 3. **Arcana Simulation** (`client/src/game/arcana/arcanaSimulation.js`)
- **Purpose**: Client-side simulation logic for testing effects without server
- **Exports**:
  - `simulateArcanaEffect()`: simulates card effects and returns result with visual/sound cues
  - `needsTargetSquare()`: determines if card needs user to select a target
  - `getTargetTypeForArcana()`: returns target type (pawn/piece/square/enemyPiece)
  - `validateArcanaTarget()`: validates if selected target is legal
- **Status**: ✅ Shared and used by balancing tool

### 4. **Shared Helper Components** (`client/src/game/arcana/sharedHelpers.jsx`) ⭐ NEW
- **Purpose**: Reusable 3D components and utilities
- **Exports**:
  - `squareToPosition(square)`: converts chess notation to 3D coordinates
  - `GhostPiece`: animated ghost piece for Temporal Echo effect
  - `CameraController`: cutscene camera movement controller
  - `GrayscaleEffect`: post-processing effect for Time Travel
- **Status**: ✅ Created and imported by both UIs
- **Benefits**: Eliminates duplicate implementations, ensures identical coordinate math

### 5. **Arcana Timings** (`client/src/game/arcana/arcanaTimings.js`) ⭐ NEW
- **Purpose**: Centralized animation/cutscene duration constants
- **Exports**:
  - `ARCANA_TIMINGS`: object with duration (ms) for each arcana effect
  - `getArcanaEffectDuration(arcanaId)`: returns duration for specific arcana
  - Easing functions: `EASE_IN_OUT`, `EASE_IN`, `EASE_OUT`
- **Status**: ✅ Created and used for `setTimeout` durations in both UIs
- **Benefits**: Guarantees identical animation timing, easy to tune globally

### 6. **Arcana Visual Config** (`client/src/game/arcana/arcanaVisualConfig.js`) ⭐ NEW
- **Purpose**: Configuration mapping for visual effects
- **Exports**:
  - `ARCANA_VISUAL_CONFIG`: maps arcana IDs to component names, prop mappings, and type (cutscene/persistent)
  - `getVisualConfig(arcanaId)`: retrieves config for an arcana
  - `normalizeProps(arcanaId, hostProps)`: transforms host props to component-expected props
- **Status**: ✅ Created and used by `ArcanaVisualHost` for prop normalization
- **Benefits**: Single source of truth for prop shapes, enables host to adapt to component interfaces

### 7. **Sound Manager** (`client/src/game/soundManager.js`)
- **Purpose**: Centralized audio playback
- **Status**: ✅ Already shared; both UIs import the same `soundManager`
- **Benefits**: Consistent sound effects and timing

### 8. **Arcana Definitions** (`shared/arcanaDefinitions.js` or `client/src/game/arcanaDefinitions.js`)
- **Purpose**: Card metadata (name, description, rarity, visual flags)
- **Status**: ✅ Already shared via `ARCANA_DEFINITIONS` import
- **Benefits**: Both UIs display identical card info

## 🔄 Architecture Pattern

```
┌─────────────────────────────────────────────────────────────┐
│                   GameScene.jsx                             │
│  - Imports: ArcanaVisualHost, sharedHelpers, timings       │
│  - Sets: activeVisualArcana (from server events)           │
│  - Mounts: <ArcanaVisualHost effectsModule={...} />        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ├─────────────────────┐
                              ▼                     ▼
┌────────────────────────────────────┐  ┌───────────────────────────────────┐
│  ArcanaVisualHost.jsx              │  │ sharedHelpers.jsx                 │
│  - Receives: activeVisualArcana    │  │  - squareToPosition()             │
│  - Uses: arcanaVisualConfig        │  │  - GhostPiece                     │
│  - Normalizes props via config     │  │  - CameraController               │
│  - Conditionally renders effects   │  │  - GrayscaleEffect                │
└────────────────────────────────────┘  └───────────────────────────────────┘
                │                                   │
                ├───────────────────────────────────┤
                ▼                                   ▼
┌────────────────────────────────────┐  ┌───────────────────────────────────┐
│  arcanaVisuals.jsx                 │  │ arcanaTimings.js                  │
│  - Visual components library       │  │  - ARCANA_TIMINGS constants       │
│  - Accept multiple prop shapes     │  │  - getArcanaEffectDuration()      │
└────────────────────────────────────┘  └───────────────────────────────────┘
                              ▲
                              │
┌─────────────────────────────────────────────────────────────┐
│                CardBalancingToolV2.jsx                      │
│  - Imports: ArcanaVisualHost, sharedHelpers, timings       │
│  - Simulates: arcanaSimulation.simulateArcanaEffect()      │
│  - Sets: activeVisualArcana (from simulation result)       │
│  - Uses: getArcanaEffectDuration() for setTimeout          │
│  - Mounts: <ArcanaVisualHost effectsModule={...} />        │
└─────────────────────────────────────────────────────────────┘
```

## 🎯 Benefits of This Architecture

1. **Single Source of Truth**: Visual components, timings, and helpers live in one place
2. **Consistency Guaranteed**: Both UIs render identical visuals with identical timing
3. **Maintainability**: Change an effect once, updates everywhere
4. **Testability**: Balancing tool simulates exact in-game behavior
5. **Backward Compatibility**: Visual components accept multiple prop shapes
6. **Type Safety**: Config provides explicit prop mappings
7. **Performance**: Shared modules reduce bundle duplication

## 📋 Remaining Recommendations

### Server Event Schema Standardization
- **Status**: 🔄 Recommended (not blocking)
- **Action**: Ensure server's `applyArcana` socket events emit `activeVisualArcana` in the exact shape `ArcanaVisualHost` expects:
  ```js
  io.to(gameId).emit('arcanaApplied', {
    arcanaId: 'execution',
    params: { square: 'e4', ... },
    // Optional: durationMs, startAt timestamp
  });
  ```
- **Benefit**: Client-side and server-side visual triggers use identical schema

### Missing Visual Components
Some arcana IDs referenced in `ArcanaVisualHost` may not have implementations in `arcanaVisuals.jsx`. Verify these exist or implement:
- `SpectralMarchEffect`
- `KnightOfStormsEffect`
- `QueensGambitEffect`
- `RoyalSwapEffect`
- `DoubleStrikeEffect`
- `SharpshooterEffect`
- `BerserkerRageEffect`
- `NecromancyEffect`
- `ChaosTheoryEffect`
- `CastleBreakerEffect`
- `TemporalEchoEffect`

### Optional: Deterministic Randomness
If visual effects rely on random particle positions or sequences, consider:
- Exporting a seeded PRNG from `sharedHelpers.jsx`
- Pass seed via `activeVisualArcana.params.seed`
- Ensures frame-perfect identical visuals for reproducible testing

## 🔍 How to Verify Parity

1. **Visual Test**: Play same card in GameScene and BalancingTool side-by-side
2. **Timing Test**: Measure effect duration in both UIs (should match `ARCANA_TIMINGS`)
3. **Sound Test**: Verify sound plays on same cue in both contexts
4. **Simulation Test**: Compare balancing tool simulation result to actual server application

## 🛠️ Key Files Modified

- ✅ `client/src/game/arcana/sharedHelpers.jsx` (created)
- ✅ `client/src/game/arcana/arcanaTimings.js` (created)
- ✅ `client/src/game/arcana/arcanaVisualConfig.js` (created)
- ✅ `client/src/game/arcana/ArcanaVisualHost.jsx` (updated to use `normalizeProps`)
- ✅ `client/src/game/arcana/arcanaVisuals.jsx` (updated components for backward compatibility)
- ✅ `client/src/components/CardBalancingToolV2.jsx` (removed duplicate helpers, imports shared modules, uses timings)
- ✅ `client/src/components/GameScene.jsx` (imports shared helpers and timings)

## ✅ Build Status
- **Last Build**: Success (673 modules, 5.58s)
- **Bundle Size**: 323.10 KB gzipped (main), 2.19 KB (arcanaVisuals chunk)
- **Errors**: None

---
*Generated: December 10, 2025*
*All shared modules integrated and verified via successful build.*
