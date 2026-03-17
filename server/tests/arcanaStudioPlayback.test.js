import {
  collectTimelineRows,
  sampleCameraTrack,
  sampleOverlayTrack,
  sampleObjectTrack,
} from '../../client/src/game/arcana/studio/arcanaStudioPlayback.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  OK ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  FAIL ${name} - ${error.message}`);
    failed += 1;
  }
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`.trim());
  }
}

console.log('\nArcana Studio Playback Test Suite');

test('camera track interpolates between keys', () => {
  const track = {
    keys: [
      { timeMs: 0, position: [0, 7, 7], target: [0, 0, 0], fov: 60, easing: 'linear' },
      { timeMs: 1000, position: [0, 5, 3], target: [1, 0, 0], fov: 40, easing: 'linear' },
    ],
  };
  const sample = sampleCameraTrack(track, 500);
  assertEqual(sample.position[1], 6, 'camera y should be midpoint.');
  assertEqual(sample.fov, 50, 'camera fov should be midpoint.');
});

test('object track returns stable key outside key range', () => {
  const track = {
    keys: [
      { timeMs: 200, position: [1, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] },
      { timeMs: 700, position: [3, 0, 0], rotation: [0, 0.4, 0], scale: [2, 2, 2] },
    ],
  };
  const before = sampleObjectTrack(track, 0);
  const after = sampleObjectTrack(track, 900);
  assertEqual(before.position[0], 1, 'before range should clamp to first key.');
  assertEqual(after.position[0], 3, 'after range should clamp to last key.');
});

test('overlay track interpolates opacity and text', () => {
  const track = {
    content: 'default',
    keys: [
      { timeMs: 0, x: 20, y: 30, opacity: 0.2, scale: 1, rotation: 0, text: 'Start', easing: 'linear' },
      { timeMs: 1000, x: 80, y: 60, opacity: 1, scale: 2, rotation: 10, text: 'End', easing: 'linear' },
    ],
  };
  const mid = sampleOverlayTrack(track, 500);
  assertEqual(Math.round(mid.x), 50, 'overlay x midpoint mismatch.');
  assertEqual(Math.round(mid.opacity * 10) / 10, 0.6, 'overlay opacity midpoint mismatch.');
  assertEqual(mid.text, 'End', 'overlay should carry destination text in transition.');
});

test('collectTimelineRows emits all track categories', () => {
  const card = {
    tracks: {
      camera: [{ id: 'c1', name: 'Cam' }],
      objects: [{ id: 'o1', name: 'Obj' }],
      particles: [{ id: 'p1', name: 'Part' }],
      overlays: [{ id: 'ov1', name: 'Overlay' }],
      sounds: [{ id: 's1', name: 'Snd' }],
      events: [{ id: 'e1', name: 'Evt' }],
    },
  };
  const rows = collectTimelineRows(card);
  assertEqual(rows.length, 6, 'timeline should contain six rows.');
  assert(rows.some((row) => row.type === 'overlay'), 'overlay row missing.');
});

if (failed > 0) {
  console.log(`\nArcana Studio playback tests failed: ${failed}`);
  process.exit(1);
}

console.log(`\nArcana Studio playback tests passed: ${passed}`);
