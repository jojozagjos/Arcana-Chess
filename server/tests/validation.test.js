import { Chess } from 'chess.js';
import { validateArcanaMove } from '../arcana/arcanaValidation.js';

function assert(cond, msg = 'Assertion failed') { if (!cond) throw new Error(msg); }
function assertEq(a, e, msg='') { if (a !== e) throw new Error(`${msg} expected ${e}, got ${a}`); }

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); console.log(`✅ ${name}`); passed++; } catch (e) { console.log(`❌ ${name}`); console.log('   ' + e.message); failed++; }
}

console.log('\n--- Arcana Validation Tests ---');

// Spectral March: rook passes through one friendly piece
test('Spectral March allows rook through one friendly', () => {
  const chess = new Chess('8/8/8/8/8/8/RP6/4K2k w - - 0 1'); // a2 rook, b2 pawn
  const effects = { spectralMarch: { w: true } };
  const mv = validateArcanaMove(chess, { from: 'a2', to: 'a7' }, effects, 'w');
  assert(mv !== null, 'Expected valid spectral march');
});

// Phantom Step: any piece moves like a knight
test('Phantom Step enables knight move for bishop', () => {
  const chess = new Chess('8/8/8/8/8/8/4B3/4K2k w - - 0 1');
  const effects = { phantomStep: { w: true } };
  const mv = validateArcanaMove(chess, { from: 'e2', to: 'f4' }, effects, 'w');
  assert(mv !== null, 'Expected phantom step move');
});

// Temporal Echo: exact pattern must match and not be blocked for sliders
test('Temporal Echo enforces exact delta', () => {
  const chess = new Chess('8/8/8/8/8/8/4R3/4K2k w - - 0 1');
  const effects = { temporalEcho: { color: 'w', pattern: { fileDelta: 2, rankDelta: 0 } } };
  const ok = validateArcanaMove(chess, { from: 'e2', to: 'g2' }, effects, 'w');
  const bad = validateArcanaMove(chess, { from: 'e2', to: 'g3' }, effects, 'w');
  assert(ok !== null, 'Expected matching echo');
  assertEq(bad, null, 'Mismatched delta should be invalid');
});

  // Helpers: canDrawAgain and isTurnFrozenFlag
  test('canDrawAgain enforces ply gap', () => {
    const { canDrawAgain } = require('../arcana/arcanaUtils.js');
    const ok = canDrawAgain(10, 6);
    const no = canDrawAgain(10, 8);
    assert(ok === true);
    assert(no === false);
  });

  test('isTurnFrozenFlag reads timeFrozen flag', () => {
    const { isTurnFrozenFlag } = require('../arcana/arcanaUtils.js');
    const effects = { timeFrozen: { w: true, b: false } };
    assert(isTurnFrozenFlag(effects, 'w') === true);
    assert(isTurnFrozenFlag(effects, 'b') === false);
  });

if (failed > 0) {
  process.exitCode = 1;
}
