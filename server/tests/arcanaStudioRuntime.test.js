import {
  createArcanaStudioRuntimeSession,
  getArcanaStudioCardDuration,
  normalizeArcanaStudioEventActions,
  resolveRuntimeSquare,
  resolveSoundPreviewUrl,
} from '../../client/src/game/arcana/studio/arcanaStudioRuntime.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed += 1;
  } catch (error) {
    console.log(`  ❌ ${name} - ${error.message}`);
    failed += 1;
  }
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`.trim());
  }
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new Error(message);
}

console.log('\nArcana Studio Runtime Test Suite');

test('duration uses farthest keyed track time', () => {
  const card = {
    durationMs: 1800,
    tracks: {
      camera: [{ keys: [{ timeMs: 0 }, { timeMs: 1200 }] }],
      sounds: [{ keys: [{ timeMs: 2100 }] }],
      events: [{ keys: [{ timeMs: 1600, delayMs: 400 }] }],
    },
  };
  assertEqual(getArcanaStudioCardDuration(card), 2100, 'duration should reflect the furthest timed key.');
});

test('resolveRuntimeSquare understands target and dash aliases', () => {
  const eventParams = {
    targetSquare: 'e4',
    dashPath: ['d4', 'd5', 'd6'],
    displaced: [{ to: 'g7' }],
  };
  assertEqual(resolveRuntimeSquare('target', eventParams), 'e4');
  assertEqual(resolveRuntimeSquare('dash2', eventParams), 'd5');
  assertEqual(resolveRuntimeSquare('displaced1', eventParams), 'g7');
});

test('sound preview URLs map arcana and ui ids correctly', () => {
  assertEqual(resolveSoundPreviewUrl('arcana:execution'), '/sounds/arcana/execution.mp3');
  assertEqual(resolveSoundPreviewUrl('capture'), '/sounds/ui/capture.mp3');
  assertEqual(resolveSoundPreviewUrl('music:menu'), '/sounds/music/menu.mp3');
});

test('runtime session computes duration and metadata', () => {
  const card = { id: 'execution', durationMs: 2500, tracks: { overlays: [{ keys: [{ timeMs: 2600 }] }] } };
  const session = createArcanaStudioRuntimeSession(card, { targetSquare: 'e4' });
  assert(session.id.startsWith('studio_runtime_execution_'), 'session id should include the card id.');
  assertEqual(session.durationMs, 2600, 'session duration should use runtime duration, not just card duration.');
  assertEqual(session.eventParams.targetSquare, 'e4');
});

test('normalize events produces overlay and camera actions', () => {
  const overlayActions = normalizeArcanaStudioEventActions({
    type: 'overlay_flash',
    payload: { color: '#ffffff', duration: 700, intensity: 0.8 },
  });
  assertEqual(overlayActions[0]?.kind, 'overlay');
  assertEqual(overlayActions[0]?.effect, 'flash');

  const cameraActions = normalizeArcanaStudioEventActions({
    type: 'camera_cutscene',
    payload: { square: 'target', eventParams: { targetSquare: 'd5' }, zoom: 1.8 },
  });
  assertEqual(cameraActions[0]?.kind, 'camera');
  assertEqual(cameraActions[0]?.square, 'd5');
});

test('normalize highlight and log actions are sanitized', () => {
  const actions = normalizeArcanaStudioEventActions({
    type: 'highlight:set',
    payload: { squares: ['E4', 'z9', 'a1'], color: '#ff0000', durationMs: 1500 },
  });
  assertEqual(actions[0]?.kind, 'highlight');
  assertEqual(actions[0]?.squares.length, 2);
  assertEqual(actions[0]?.squares[0], 'e4');

  const logActions = normalizeArcanaStudioEventActions({
    type: 'combat_log',
    payload: { text: 'Arcana pulse reached target.' },
  });
  assertEqual(logActions[0]?.kind, 'log');
  assertEqual(logActions[0]?.text, 'Arcana pulse reached target.');
});

test('legacy sound action resolves concrete cue id', () => {
  const actions = normalizeArcanaStudioEventActions({
    type: 'sound_impact',
    payload: {
      soundMap: {
        impact: 'arcana:execution_impact',
        slash: 'arcana:execution_slash',
      },
    },
  });
  assertEqual(actions[0]?.kind, 'sound');
  assertEqual(actions[0]?.soundId, 'arcana:execution_impact');
});

test('legacy vfx action maps to overlay effect', () => {
  const actions = normalizeArcanaStudioEventActions({
    type: 'vfx_fracture_bolts',
    payload: { intensity: 0.7 },
  });
  assertEqual(actions[0]?.kind, 'overlay');
  assertEqual(actions[0]?.effect, 'flash');
});

if (failed > 0) {
  console.log(`\nArcana Studio runtime tests failed: ${failed}`);
  process.exit(1);
}

console.log(`\nArcana Studio runtime tests passed: ${passed}`);