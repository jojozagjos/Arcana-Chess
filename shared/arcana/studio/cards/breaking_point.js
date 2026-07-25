/**
 * Breaking Point cutscene.
 *
 * Beat sheet:
 *   0.00s  anticipation  - camera pushes in, piece squashes down
 *   0.42s  launch        - piece is flung skyward, tumbling; camera rises with it
 *   2.00s  apex          - camera settles into a near top-down look at the square
 *   2.35s  slam          - piece accelerates straight back into the board
 *   2.60s  impact        - explosion + shockwave VFX, camera kick, piece crushed flat
 *   3.20s  settle        - camera eases back to its resting 3/4 view
 *
 * Camera key positions/targets are OFFSETS from the target square, which the
 * runtime adds to the anchor (see ArcanaStudioRuntimeHost.cameraAnchorPosition).
 * Object key positions are offsets from the piece's own square.
 */

const CURVE = { easing: 'easeInOutCubic', bezier: [0.25, 0.1, 0.25, 1], blendMode: 'curve' };
// Heavy acceleration for the fall, so the slam reads as gravity rather than a lerp.
const FALL = { easing: 'easeInCubic', bezier: [0.55, 0, 0.95, 0.3], blendMode: 'curve' };
// Snappy deceleration for the launch.
const LAUNCH = { easing: 'easeOutCubic', bezier: [0.16, 0.84, 0.44, 1], blendMode: 'curve' };

export const STUDIO_CARD_OVERRIDE = {
  version: 1,
  id: 'breaking_point',
  name: 'breaking_point',
  durationMs: 4200,
  settings: {
    autoKey: false,
    fps: 60,
    timelineSnapMs: 10,
    randomSeed: 4242,
    seedLocked: true,
  },
  board: {
    fen: '8/8/8/8/4p3/8/8/8 w - - 0 1',
    focusSquare: 'e4',
  },
  tracks: {
    camera: [
      {
        id: 'bp_cam_main',
        name: 'Main Camera',
        keys: [
          // Resting 3/4 view on the doomed piece.
          { id: 'bp_c0', timeMs: 0, position: [1.7, 1.6, 2.3], target: [0, 0.25, 0], fov: 50, ...CURVE },
          // Push in for the anticipation beat.
          { id: 'bp_c1', timeMs: 400, position: [1.15, 1.25, 1.65], target: [0, 0.3, 0], fov: 43, ...CURVE },
          // Rise with the launch, still looking up at the piece.
          { id: 'bp_c2', timeMs: 1250, position: [1.0, 4.3, 1.9], target: [0, 2.7, 0], fov: 52, ...LAUNCH },
          // Apex: swing over the board into a near top-down look.
          // Keep a small Z offset so the lookAt never becomes parallel to `up`.
          { id: 'bp_c3', timeMs: 2000, position: [0.35, 7.5, 1.15], target: [0, 1.0, 0], fov: 58, ...CURVE },
          // Track the fall back down.
          { id: 'bp_c4', timeMs: 2420, position: [0.32, 6.5, 1.05], target: [0, 0.4, 0], fov: 55, ...FALL },
          // Impact kick: camera punched back and wide.
          { id: 'bp_c5', timeMs: 2640, position: [0.55, 4.2, 1.6], target: [0, 0.15, 0], fov: 64, easing: 'easeOutQuad', bezier: [0.2, 0.9, 0.35, 1], blendMode: 'curve' },
          // Ride the shockwave out.
          { id: 'bp_c6', timeMs: 3200, position: [1.25, 2.7, 2.25], target: [0, 0.2, 0], fov: 53, ...CURVE },
          // Return to rest.
          { id: 'bp_c7', timeMs: 4200, position: [1.7, 1.6, 2.3], target: [0, 0.25, 0], fov: 50, ...CURVE },
        ],
      },
    ],
    objects: [
      {
        id: 'bp_obj_piece',
        name: 'Target Piece',
        type: 'piece',
        // 'target' resolves to the square Breaking Point was cast on.
        pieceSquare: 'target',
        previewPlayAnimation: true,
        isAnimatablePiece: true,
        attach: { mode: 'follow', targetId: null, parentId: null, offset: [0, 0, 0], parenting: true },
        keys: [
          { id: 'bp_o0', timeMs: 0, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], ...CURVE },
          // Squash: winding up.
          { id: 'bp_o1', timeMs: 260, position: [0, -0.06, 0], rotation: [0, 0, 0], scale: [1.2, 0.78, 1.2], ...CURVE },
          // Stretch as it leaves the board.
          { id: 'bp_o2', timeMs: 420, position: [0, 0.55, 0], rotation: [0.25, 0.4, 0.1], scale: [0.82, 1.3, 0.82], ...LAUNCH },
          // Tumbling upward.
          { id: 'bp_o3', timeMs: 1250, position: [0.16, 4.7, 0.1], rotation: [3.1, 2.4, 1.2], scale: [0.95, 1.05, 0.95], ...LAUNCH },
          // Apex hang.
          { id: 'bp_o4', timeMs: 2000, position: [0.2, 6.3, 0.12], rotation: [5.0, 4.1, 2.0], scale: [1, 1, 1], ...CURVE },
          // Falling, gaining speed.
          { id: 'bp_o5', timeMs: 2380, position: [0.16, 3.6, 0.1], rotation: [7.4, 5.6, 3.1], scale: [0.9, 1.15, 0.9], ...FALL },
          // Contact: flattened against the board for a single frame of impact.
          { id: 'bp_o6', timeMs: 2600, position: [0, 0, 0], rotation: [8.2, 6.2, 3.6], scale: [1.7, 0.3, 1.7], easing: 'easeInQuart', bezier: [0.6, 0, 1, 0.4], blendMode: 'curve' },
          // Shattered by the blast. Gone ~80ms after landing so the explosion is
          // what the eye follows, not a lingering squashed piece.
          { id: 'bp_o7', timeMs: 2680, position: [0, 0, 0], rotation: [8.2, 6.2, 3.6], scale: [0, 0, 0], easing: 'easeOutQuad', bezier: [0.2, 0.9, 0.35, 1], blendMode: 'curve' },
          { id: 'bp_o8', timeMs: 4200, position: [0, 0, 0], rotation: [8.2, 6.2, 3.6], scale: [0, 0, 0], ...CURVE },
        ],
      },
    ],
    particles: [],
    overlays: [],
    sounds: [
      {
        id: 'bp_snd',
        name: 'Breaking Point SFX',
        keys: [
          // Wind-up whoosh as the piece is torn off the board.
          { id: 'bp_s0', timeMs: 380, soundId: 'arcana:whoosh', volume: 0.9, loop: false, pitch: 0.85 },
          // Rising swoosh through the arc.
          { id: 'bp_s1', timeMs: 1200, soundId: 'arcana:swoosh', volume: 0.75, loop: false, pitch: 1.15 },
          // The slam.
          { id: 'bp_s2', timeMs: 2590, soundId: 'arcana:smash', volume: 1, loop: false, pitch: 0.9 },
          // Low aftershock tail.
          { id: 'bp_s3', timeMs: 2760, soundId: 'arcana:smash', volume: 0.5, loop: false, pitch: 0.55 },
        ],
      },
    ],
    events: [
      {
        id: 'bp_evt',
        name: 'Breaking Point Events',
        keys: [
          {
            // Fires on contact, so the explosion replaces the piece rather than
            // following it.
            id: 'bp_e0',
            timeMs: 2600,
            type: 'vfx_play',
            delayMs: 0,
            payload: {
              arcanaId: 'breaking_point',
              square: 'target',
              vfxKey: 'impact',
              durationMs: 1600,
            },
          },
        ],
      },
    ],
  },
  meta: {
    source: 'arcana-studio',
    createdAt: 1776300000000,
    updatedAt: 1776300000000,
    usedPieces: [],
    isCutscene: true,
    canAnimatePiece: true,
    rarity: '???',
    category: 'special',
    soundId: 'arcana:breaking_point',
  },
};
