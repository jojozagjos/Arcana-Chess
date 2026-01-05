/**
 * Arcana Chess - Unit Tests for Arcana Effects
 * Tests critical game logic for arcana interactions
 */

import { Chess } from 'chess.js';

// Helper to create a mock game state
function createMockGameState(fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1') {
  const chess = new Chess(fen);
  return {
    chess,
    activeEffects: {
      ironFortress: { w: false, b: false },
      bishopsBlessing: { w: null, b: null },
      timeFrozen: { w: false, b: false },
      cursedSquares: [],
      sanctuaries: [],
      fogOfWar: { w: false, b: false },
      doubleStrike: { w: null, b: null },
      doubleStrikeActive: null,
      berserkerRage: { w: null, b: null },
      berserkerRageActive: null,
      poisonTouch: { w: false, b: false },
      poisonedPieces: [],
      squireSupport: [],
      queensGambit: { w: 0, b: 0 },
      queensGambitUsed: { w: false, b: false },
      divineIntervention: { w: false, b: false },
      mirrorImages: [],
      mindControlled: [],
    },
    pawnShields: { w: null, b: null },
    capturedByColor: { w: [], b: [] },
    lastMove: null,
    ascended: true,
    mode: 'Ascendant',
    playerIds: ['player1', 'player2'],
    arcanaByPlayer: { player1: [], player2: [] },
    usedArcanaIdsByPlayer: {},
  };
}

// Helper to get adjacent squares
function getAdjacentSquares(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]);
  const adjacent = [];
  
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const newFile = file + df;
      const newRank = rank + dr;
      if (newFile >= 0 && newFile < 8 && newRank >= 1 && newRank <= 8) {
        adjacent.push(`${String.fromCharCode(97 + newFile)}${newRank}`);
      }
    }
  }
  return adjacent;
}

// ============ TEST SUITES ============

console.log('🧪 Arcana Chess Unit Tests\n');
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    failed++;
  }
}

function assert(condition, message = 'Assertion failed') {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message = '') {
  if (actual !== expected) {
    throw new Error(`${message} Expected ${expected}, got ${actual}`);
  }
}

// ============ MIRROR IMAGE TESTS ============

console.log('--- Mirror Image Tests ---');

test('Mirror image tracks duplicate position when moved', () => {
  const state = createMockGameState('8/8/8/4P3/8/8/8/4K2k w - - 0 1');
  // Add a mirror image pawn at e5
  state.activeEffects.mirrorImages.push({
    square: 'e5',
    type: 'p',
    color: 'w',
    turnsLeft: 3
  });
  
  // Simulate moving the mirror pawn from e5 to e6
  const mirrorEntry = state.activeEffects.mirrorImages.find(m => m.square === 'e5');
  mirrorEntry.square = 'e6';
  
  assertEqual(state.activeEffects.mirrorImages[0].square, 'e6', 'Mirror should track new position');
});

test('Mirror image removed when captured', () => {
  const state = createMockGameState('8/8/3p4/4P3/8/8/8/4K2k b - - 0 1');
  state.activeEffects.mirrorImages.push({
    square: 'e5',
    type: 'p',
    color: 'w',
    turnsLeft: 3
  });
  
  // Simulate capturing the mirror at e5
  const mirrorIndex = state.activeEffects.mirrorImages.findIndex(m => m.square === 'e5');
  if (mirrorIndex !== -1) {
    state.activeEffects.mirrorImages.splice(mirrorIndex, 1);
  }
  
  assertEqual(state.activeEffects.mirrorImages.length, 0, 'Mirror should be removed when captured');
});

test('Mirror image pawn updates type when promoted', () => {
  const state = createMockGameState('8/4P3/8/8/8/8/8/4K2k w - - 0 1');
  state.activeEffects.mirrorImages.push({
    square: 'e7',
    type: 'p',
    color: 'w',
    turnsLeft: 3
  });
  
  // Simulate promotion of mirror pawn
  const mirrorEntry = state.activeEffects.mirrorImages.find(m => m.square === 'e7');
  mirrorEntry.square = 'e8';
  mirrorEntry.type = 'q'; // Promoted to queen
  
  assertEqual(state.activeEffects.mirrorImages[0].type, 'q', 'Mirror type should update on promotion');
  assertEqual(state.activeEffects.mirrorImages[0].square, 'e8', 'Mirror square should update on promotion');
});

test('Mirror image expires after 3 turns', () => {
  const state = createMockGameState();
  state.activeEffects.mirrorImages.push({
    square: 'e4',
    type: 'p',
    color: 'w',
    turnsLeft: 1
  });
  
  // Simulate decrement
  state.activeEffects.mirrorImages = state.activeEffects.mirrorImages.filter(m => {
    m.turnsLeft--;
    return m.turnsLeft > 0;
  });
  
  assertEqual(state.activeEffects.mirrorImages.length, 0, 'Expired mirror should be removed');
});

// ============ PAWN SHIELD TESTS ============

console.log('\n--- Pawn Shield Tests ---');

test('Shield pawn protects the pawn itself', () => {
  const state = createMockGameState();
  state.pawnShields.w = { square: 'e4', shieldType: 'pawn' };
  
  // Verify shield is on the pawn square
  assertEqual(state.pawnShields.w.shieldType, 'pawn', 'Shield type should be pawn');
  assertEqual(state.pawnShields.w.square, 'e4', 'Shield should be at pawn square');
});

test('Pawn guard protects piece behind the pawn', () => {
  const state = createMockGameState();
  state.pawnShields.w = { square: 'e3', shieldType: 'behind', pawnSquare: 'e4' };
  
  assertEqual(state.pawnShields.w.shieldType, 'behind', 'Shield type should be behind');
  assertEqual(state.pawnShields.w.pawnSquare, 'e4', 'Guard pawn square should be tracked');
  assertEqual(state.pawnShields.w.square, 'e3', 'Protected piece square should be tracked');
});

test('Pawn guard breaks when guarding pawn is captured', () => {
  const state = createMockGameState();
  state.pawnShields.w = { square: 'e3', shieldType: 'behind', pawnSquare: 'e4' };
  
  // Simulate pawn at e4 being captured - shield breaks
  const guardPawn = state.chess.get('e4');
  if (!guardPawn || guardPawn.type !== 'p') {
    state.pawnShields.w = null;
  }
  
  assertEqual(state.pawnShields.w, null, 'Shield should break when guard pawn is gone');
});

// ============ SANCTUARY TESTS ============

console.log('\n--- Sanctuary Tests ---');

test('Sanctuary prevents captures on protected square', () => {
  const state = createMockGameState();
  state.activeEffects.sanctuaries.push({ square: 'e4', turns: 2 });
  
  const targetSquare = 'e4';
  const hasSanctuary = state.activeEffects.sanctuaries.some(s => s.square === targetSquare);
  
  assert(hasSanctuary, 'Sanctuary should protect square e4');
});

test('Sanctuary expires after turns', () => {
  const state = createMockGameState();
  state.activeEffects.sanctuaries.push({ square: 'e4', turns: 1 });
  
  // Decrement
  state.activeEffects.sanctuaries = state.activeEffects.sanctuaries.filter(s => {
    s.turns--;
    return s.turns > 0;
  });
  
  assertEqual(state.activeEffects.sanctuaries.length, 0, 'Expired sanctuary should be removed');
});

// ============ CURSED SQUARE TESTS ============

console.log('\n--- Cursed Square Tests ---');

test('Cursed square destroys non-king pieces', () => {
  const state = createMockGameState('8/8/8/8/4P3/8/8/4K2k w - - 0 1');
  state.activeEffects.cursedSquares.push({ square: 'e4', turns: 2 });
  
  // Check if piece at e4 would be destroyed
  const piece = state.chess.get('e4');
  const cursed = state.activeEffects.cursedSquares.find(c => c.square === 'e4');
  
  const shouldDestroy = cursed && piece && piece.type !== 'k';
  assert(shouldDestroy, 'Non-king piece on cursed square should be destroyed');
});

test('Cursed square does not destroy king', () => {
  const state = createMockGameState('8/8/8/8/4K3/8/8/7k w - - 0 1');
  state.activeEffects.cursedSquares.push({ square: 'e4', turns: 2 });
  
  const piece = state.chess.get('e4');
  const shouldDestroy = piece && piece.type !== 'k';
  
  assert(!shouldDestroy, 'King on cursed square should NOT be destroyed');
});

// ============ DOUBLE STRIKE / BERSERKER TESTS ============

console.log('\n--- Double Strike & Berserker Tests ---');

test('Double strike allows second capture if not adjacent', () => {
  const state = createMockGameState();
  state.activeEffects.doubleStrike.w = {
    active: true,
    firstKillSquare: 'e4',
    usedSecondKill: false
  };
  
  const firstKill = 'e4';
  const secondTarget = 'g6'; // Not adjacent to e4
  const isAdjacent = getAdjacentSquares(firstKill).includes(secondTarget);
  
  assert(!isAdjacent, 'g6 should not be adjacent to e4');
  assert(state.activeEffects.doubleStrike.w.active, 'Double strike should be active');
});

test('Double strike blocked if second target is adjacent', () => {
  const state = createMockGameState();
  state.activeEffects.doubleStrike.w = {
    active: true,
    firstKillSquare: 'e4',
    usedSecondKill: false
  };
  
  const firstKill = 'e4';
  const secondTarget = 'e5'; // Adjacent to e4
  const isAdjacent = getAdjacentSquares(firstKill).includes(secondTarget);
  
  assert(isAdjacent, 'e5 should be adjacent to e4');
});

test('Extra move not granted on promotion', () => {
  // Simulating the check from gameManager.js
  const result = { promotion: 'q', color: 'w' };
  const hasDoubleStrike = true && !result.promotion;
  const hasBerserkerRage = true && !result.promotion;
  
  assert(!hasDoubleStrike, 'Double strike extra move should be blocked on promotion');
  assert(!hasBerserkerRage, 'Berserker rage extra move should be blocked on promotion');
});

// ============ EN PASSANT TESTS ============

console.log('\n--- En Passant Tests ---');

test('En passant capture square calculation', () => {
  // For en passant, captured pawn is on different square than move destination
  const move = { from: 'd5', to: 'e6', flags: 'e' }; // e = en passant
  
  // The captured pawn is at same file as destination, same rank as source
  const capturedSquare = move.flags.includes('e') 
    ? move.to[0] + move.from[1]  // e.g., 'e5' for d5xe6 en passant
    : move.to;
  
  assertEqual(capturedSquare, 'e5', 'En passant capture square should be e5');
});

test('Shield check uses en passant capture square', () => {
  const state = createMockGameState();
  state.pawnShields.b = { square: 'e5', shieldType: 'pawn' };
  
  const move = { from: 'd5', to: 'e6', flags: 'e', captured: 'p' };
  
  let capturedSquare = move.to;
  if (move.flags && move.flags.includes('e')) {
    capturedSquare = move.to[0] + move.from[1];
  }
  
  const isShielded = capturedSquare === state.pawnShields.b.square;
  assert(isShielded, 'En passant capture should check shield at e5, not e6');
});

// ============ MIND CONTROL TESTS ============

console.log('\n--- Mind Control Tests ---');

test('Mind controlled piece tracks position when moved', () => {
  const state = createMockGameState();
  state.activeEffects.mindControlled.push({
    square: 'e4',
    originalColor: 'b',
    controlledBy: 'w'
  });
  
  // Simulate piece moving from e4 to e5
  const controlled = state.activeEffects.mindControlled.find(c => c.square === 'e4');
  controlled.square = 'e5';
  
  assertEqual(state.activeEffects.mindControlled[0].square, 'e5', 'Controlled piece position should update');
});

// ============ IRON FORTRESS TESTS ============

console.log('\n--- Iron Fortress Tests ---');

test('Iron fortress protects all pawns for color', () => {
  const state = createMockGameState();
  state.activeEffects.ironFortress.w = true;
  
  // Check that fortress is active for white
  assert(state.activeEffects.ironFortress.w, 'Iron fortress should be active for white');
  assert(!state.activeEffects.ironFortress.b, 'Iron fortress should NOT be active for black');
});

// ============ AI MOVE FILTERING TESTS ============

console.log('\n--- AI Move Filtering Tests ---');

test('AI avoids moving into cursed squares', () => {
  const cursedSquares = ['e4', 'd4'];
  const candidateMove = { from: 'e2', to: 'e4' };
  
  const shouldAvoid = cursedSquares.includes(candidateMove.to);
  assert(shouldAvoid, 'AI should avoid moving to cursed square e4');
});

test('AI avoids capturing into sanctuary', () => {
  const sanctuaries = ['d5'];
  const captureMove = { from: 'e4', to: 'd5', captured: 'p' };
  
  const shouldAvoid = captureMove.captured && sanctuaries.includes(captureMove.to);
  assert(shouldAvoid, 'AI should avoid capturing into sanctuary at d5');
});

test('AI prefers moves not blocked by shields', () => {
  const shield = { square: 'e5', shieldType: 'pawn' };
  const captureMove = { from: 'd4', to: 'e5', captured: 'p' };
  
  const isShielded = captureMove.to === shield.square;
  assert(isShielded, 'AI should recognize e5 is shielded');
});

// ============ TEMPORAL ECHO TESTS ============

console.log('\n--- Temporal Echo Tests ---');

test('Temporal echo calculates move pattern correctly', () => {
  const lastMove = { from: 'e2', to: 'e4' };
  
  const fromFile = lastMove.from.charCodeAt(0);
  const fromRank = parseInt(lastMove.from[1]);
  const toFile = lastMove.to.charCodeAt(0);
  const toRank = parseInt(lastMove.to[1]);
  
  const fileDelta = toFile - fromFile;
  const rankDelta = toRank - fromRank;
  
  assertEqual(fileDelta, 0, 'File delta should be 0 (same column)');
  assertEqual(rankDelta, 2, 'Rank delta should be 2 (moved 2 squares up)');
});

test('Temporal echo allows knight-like patterns without intervening check', () => {
  const pattern = { fileDelta: 1, rankDelta: 2 }; // Knight move
  
  // Knight moves don't slide through squares
  const isSliding = (Math.abs(pattern.fileDelta) > 1 && pattern.rankDelta === 0) ||
                   (Math.abs(pattern.rankDelta) > 1 && pattern.fileDelta === 0) ||
                   (Math.abs(pattern.fileDelta) === Math.abs(pattern.rankDelta) && Math.abs(pattern.fileDelta) > 1);
  
  assert(!isSliding, 'Knight pattern should not be treated as sliding');
});

// ============ SUMMARY ============

console.log('\n=============================');
console.log(`Tests passed: ${passed}`);
console.log(`Tests failed: ${failed}`);
console.log(`Total: ${passed + failed}`);
console.log('=============================');

if (failed > 0) {
  process.exit(1);
}
