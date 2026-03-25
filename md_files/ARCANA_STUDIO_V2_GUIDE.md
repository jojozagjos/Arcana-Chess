# Arcana Studio v2 Guide

Arcana Studio was rebuilt as a timeline sequencer for per-piece animation and cutscene authoring.

## What It Is

Arcana Studio is a Moon Animator-style editor where each card is a timeline document with tracks:

- camera
- object (piece/mesh/part)
- particle
- overlay (screen/world)
- sound
- event

You author keyframes and then save/export the card as runtime data used by the game.

## Key Files

- `client/src/components/ArcanaStudio.jsx`
  - Main editor shell (card library, timeline, viewport, inspector)
- `client/src/game/arcana/studio/arcanaStudioSchema.js`
  - v2 schema, migration, load/save helpers
- `client/src/game/arcana/studio/arcanaStudioPlayback.js`
  - track samplers + easing interpolation
- `client/src/game/arcana/studio/arcanaStudioRuntime.js`
  - runtime duration/event/audio/overlay helpers
- `client/src/components/ArcanaStudioTutorial.jsx`
  - in-editor tutorial content
- `client/src/components/styles/ArcanaStudio.css`
  - full UI styling

## Card Data Model (v2)

A card includes:

- `id`, `name`, `description`, `durationMs`
- `board.fen`, `board.focusSquare`
- `settings`:
  - `previewMode`: `plane` or `board`
  - `loopPlayback`: `true`/`false`
  - `autoKey`, `fps`, `timelineSnapMs`, etc.
- `tracks`:
  - `camera`, `objects`, `particles`, `overlays`, `sounds`, `events`
- `meta`:
  - `usedPieces`
  - `cardPiecePreview`
  - `tags`

Object tracks support:

- `pieceSquare`
- `assetUri`
- `clipName`, `clipOffsetMs`, `clipLoop`
- `previewPlayAnimation`
- `attach` settings
- `rig` metadata fields

## Core Workflow

1. Open Arcana Studio from main menu.
2. Select a card from Card Library or click `Import All Game Cards`.
3. Add tracks (`+ Object`, `+ Particle`, `+ Overlay`, `+ Audio`, `+ Event`).
4. Scrub timeline and add keyframes.
5. Use Piece/track inspector to set piece square, easing, overlays, and sound IDs.
6. Preview with Play/Pause.
7. Click `Export Card` to download your card JSON for backup/sharing.
8. Export:
   - `Export Card` for one card JSON
   - `Export All` for package JSON

## Typical Example (Antidote style)

- Object track on poisoned piece:
  - 0ms: base
  - 220ms: jump up (easeOutCubic)
  - 450ms: land (easeInCubic)
- Particle track:
  - enable burst at 220ms
  - disable by ~520ms
- Overlay track:
  - world text `Purified`
- Sound track:
  - `arcana:heal` around jump

## Runtime Notes

- Save uses localStorage key: `arcana.arcanaStudio.cards.v2`
- Loader migrates from v1 key automatically.
- Runtime host (`ArcanaStudioRuntimeHost`) reads the same track structure.

## Troubleshooting

### Overlay appears in center

- Check track `space` (`screen` vs `world`).
- For world overlays set `attach.targetId` or `pieceSquare`.

### Mesh not animating

- Ensure object track has `assetUri`.
- Enable `previewPlayAnimation`.
- Set `clipName` when model has multiple clips.

### Audio not audible in preview

- Verify `soundId` maps to a valid file (for example `arcana:heal`).
- Browser autoplay rules may require interaction before playback.

### Missing card in game

- Ensure card id matches game card id when overriding existing behavior.
- Re-export after edits to keep your latest card JSON backup.

## Dev Validation

Run these checks:

```bash
node server/tests/arcanaStudioPlayback.test.js
node server/tests/arcanaStudioRuntime.test.js
npm run build
```

If all pass, studio/runtime integration is healthy.
