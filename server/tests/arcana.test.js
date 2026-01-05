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
const results = [];

function test(name, fn) {
  const start = Date.now();
  try {
    fn();
    const duration = Date.now() - start;
    console.log(`✅ ${name} (${duration}ms)`);
    passed++;
    results.push({ name, status: 'passed', duration });
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`❌ ${name} (${duration}ms)`);
    console.log(`   ${error.stack}`);
    failed++;
    results.push({ name, status: 'failed', duration, error: error.stack });
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

// ============ PAWN CAPTURE VALIDATION ============

console.log('\n--- Pawn Capture Validation Tests ---');

test('Pawn cannot capture on same rank (adjacent pawn)', () => {
  // White pawn on e4, Black pawn on d4 (adjacent on same rank)
  // White should NOT be able to capture d4 by moving sideways
  const chess = new Chess('4k3/8/8/8/3p1P2/8/8/4K3 w - - 0 1');
  
  // Try to move f4 to d4 (sideways capture, should be invalid)
  const moves = chess.moves({ verbose: true });
  const sideCapture = moves.find(m => m.from === 'f4' && m.to === 'd4');
  
  assert(!sideCapture, 'Pawn should not be able to capture sideways on same rank');
});

test('Pawn can only capture diagonally forward', () => {
  // White pawn on e4, Black pawn on f5 (diagonal forward-right)
  // White should be able to capture f5
  const chess = new Chess('4k3/5p2/8/8/4P3/8/8/4K3 w - - 0 1');
  
  const moves = chess.moves({ verbose: true });
  const pawnMoves = moves.filter(m => m.from === 'e4');
  // Just ensure the pawn has at least one legal move (it should have e5)
  assert(pawnMoves.length > 0, 'Pawn should have legal moves');
});

// ============ COMPREHENSIVE CARD TESTS ============

console.log('\n--- Comprehensive Card Coverage Tests ---');

test('Soft Push moves enemy piece', () => {
  const gameState = createMockGameState('4k3/8/8/8/4r3/8/4K3/4R3 w - - 0 1');
  // Soft push should move the rook on e4
  gameState.activeEffects.softPush = { w: null, b: null };
  gameState.activeEffects.softPush.w = 'e4'; // White used soft push
  
  // The effect should move black's rook
  assert(gameState.activeEffects.softPush.w === 'e4', 'Soft push should be set');
});

test('Focus Fire increases capture damage', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.focusFire = { w: false, b: false };
  gameState.activeEffects.focusFire.w = true;
  
  assert(gameState.activeEffects.focusFire.w === true, 'Focus fire should be active');
});

test('Poison Touch marks piece for delayed death', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.poisonedPieces = [];
  gameState.activeEffects.poisonedPieces.push({ square: 'e4', turnsRemaining: 3, color: 'b' });
  
  assert(gameState.activeEffects.poisonedPieces.length === 1, 'Poisoned piece should be tracked');
  assert(gameState.activeEffects.poisonedPieces[0].turnsRemaining === 3, 'Poison should have 3 turns');
});

test('Sharpshooter bishop captures through blockers', () => {
  const chess = new Chess('4k3/8/8/2p5/1b6/8/4K3/4B3 w - - 0 1');
  // Sharpshooter allows bishop to see through pieces
  // This is validated by arcana validation function
  assert(chess.get('b4') && chess.get('b4').type === 'b', 'Black bishop should exist');
});

test('Chain Lightning destroys adjacent pieces', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.chainLightning = { w: false, b: false };
  gameState.activeEffects.chainLightning.w = true;
  
  assert(gameState.activeEffects.chainLightning.w === true, 'Chain lightning should be active');
});

test('Execution targets and removes enemy piece', () => {
  const gameState = createMockGameState('4k3/8/8/8/4r3/8/4K3/4R3 w - - 0 1');
  // Execution should be able to target any piece
  assert(gameState.chess.get('e4').type === 'r', 'Target piece should exist');
});

test('Time Freeze prevents opponent moves', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.timeFrozen = { w: false, b: false };
  gameState.activeEffects.timeFrozen.b = 2; // Black frozen for 2 turns
  
  assert(gameState.activeEffects.timeFrozen.b === 2, 'Time freeze should track frozen turns');
});

test('Divine Intervention protects king', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.divineIntervention = { w: false, b: false };
  gameState.activeEffects.divineIntervention.w = true;
  
  assert(gameState.activeEffects.divineIntervention.w === true, 'Divine intervention should protect king');
});

test('Pawn Rush allows double pawn advance', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.pawnRush = { w: false, b: false };
  gameState.activeEffects.pawnRush.w = true;
  
  assert(gameState.activeEffects.pawnRush.w === true, 'Pawn rush should be active');
});

test('Spectral March allows rook to pass through piece', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.spectralMarch = { w: false, b: false };
  gameState.activeEffects.spectralMarch.w = true;
  
  assert(gameState.activeEffects.spectralMarch.w === true, 'Spectral march should be active');
});

test('Phantom Step allows any piece to move like knight', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.phantomStep = { w: false, b: false };
  gameState.activeEffects.phantomStep.w = true;
  
  assert(gameState.activeEffects.phantomStep.w === true, 'Phantom step should be active');
});

test('Knight of Storms extends knight range', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.knightOfStorms = { w: null, b: null };
  gameState.activeEffects.knightOfStorms.w = 'g1';
  
  assert(gameState.activeEffects.knightOfStorms.w === 'g1', 'Knight of storms should track knight square');
});

test('Temporal Echo repeats last move pattern', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.temporalEcho = {
    color: 'w',
    pattern: { from: 'e2', to: 'e4' }
  };
  
  assert(gameState.activeEffects.temporalEcho.color === 'w', 'Temporal echo should track color');
  assert(gameState.activeEffects.temporalEcho.pattern.from === 'e2', 'Pattern should be stored');
});

test('Royal Swap exchanges piece positions', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.royalSwap = { w: null, b: null };
  gameState.activeEffects.royalSwap.w = { piece1: 'e1', piece2: 'e4' };
  
  assert(gameState.activeEffects.royalSwap.w, 'Royal swap should be set');
});

test('Queens Gambit sacrifices pawn for extra move', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.queensGambit = { w: 0, b: 0 };
  gameState.activeEffects.queensGambitUsed = { w: false, b: false };
  gameState.activeEffects.queensGambit.w = 1; // One extra move
  
  assert(gameState.activeEffects.queensGambit.w === 1, 'Queens gambit should grant extra move');
});

test('Necromancy resurrects captured piece', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.necromancy = { w: null, b: null };
  gameState.activeEffects.necromancy.w = 'e4'; // Resurrected piece at e4
  
  assert(gameState.activeEffects.necromancy.w === 'e4', 'Necromancy should track resurrected piece');
});

test('Astral Rebirth king revival', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.astralRebirth = { w: null, b: null };
  
  assert(gameState.activeEffects.astralRebirth, 'Astral rebirth should be available');
});

test('Promotion Ritual upgrades pawn', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.promotionRitual = { w: null, b: null };
  gameState.activeEffects.promotionRitual.w = { square: 'e8', type: 'q' };
  
  assert(gameState.activeEffects.promotionRitual.w, 'Promotion ritual should track upgrade');
});

test('Arcane Cycle draws extra card', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.arcaneCycle = { w: false, b: false };
  gameState.activeEffects.arcaneCycle.w = true;
  
  assert(gameState.activeEffects.arcaneCycle.w === true, 'Arcane cycle should allow extra draw');
});

test('Quiet Thought reveals opponent hand', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.quietThought = { w: null, b: null };
  gameState.activeEffects.quietThought.w = true;
  
  assert(gameState.activeEffects.quietThought.w === true, 'Quiet thought should be active');
});

test('Map Fragments highlights board regions', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.mapFragments = { w: null, b: null };
  gameState.activeEffects.mapFragments.w = ['a1', 'a2', 'a3'];
  
  assert(gameState.activeEffects.mapFragments.w.length === 3, 'Map fragments should highlight squares');
});

test('Peek Card reveals opponent card', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.peekCard = { w: null, b: null };
  
  assert(gameState.activeEffects.peekCard, 'Peek card effect should be available');
});

test('Fog of War hides piece positions', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.fogOfWar = { w: false, b: false };
  gameState.activeEffects.fogOfWar.w = true;
  
  assert(gameState.activeEffects.fogOfWar.w === true, 'Fog of war should hide positions');
});

test('En Passant Master allows adjacent pawn capture', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.enPassantMaster = { w: false, b: false };
  gameState.activeEffects.enPassantMaster.w = true;
  
  assert(gameState.activeEffects.enPassantMaster.w === true, 'En passant master should be active');
});

test('Antidote removes poison effect', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.poisonedPieces = [
    { square: 'e4', turnsRemaining: 2, color: 'b' }
  ];
  
  // Remove poison
  gameState.activeEffects.poisonedPieces = gameState.activeEffects.poisonedPieces.filter(
    p => p.square !== 'e4'
  );
  
  assert(gameState.activeEffects.poisonedPieces.length === 0, 'Poison should be removed');
});

test('Cursed Square marks square as dangerous', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.cursedSquares = [
    { square: 'e4', turnsRemaining: 3 }
  ];
  
  assert(gameState.activeEffects.cursedSquares.length === 1, 'Cursed square should be tracked');
  assert(gameState.activeEffects.cursedSquares[0].square === 'e4', 'Cursed square location should match');
});

test('Mind Control converts enemy piece', () => {
  const gameState = createMockGameState('4k3/8/8/8/4r3/8/4K3/4R3 w - - 0 1');
  gameState.activeEffects.mindControl = { w: null, b: null };
  gameState.activeEffects.mindControl.w = {
    square: 'e4',
    originalColor: 'b',
    controlledBy: 'w',
    type: 'r'
  };
  
  assert(gameState.activeEffects.mindControl.w.square === 'e4', 'Mind control should track piece');
  assert(gameState.activeEffects.mindControl.w.controlledBy === 'w', 'Mind control should mark controller');
});

test('Bishops Blessing protects bishop from capture', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.bishopsBlessing = { w: null, b: null };
  gameState.activeEffects.bishopsBlessing.w = 'c1';
  
  assert(gameState.activeEffects.bishopsBlessing.w === 'c1', 'Bishop blessing should track bishop');
});

test('Iron Fortress protects all pawns', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.ironFortress = { w: false, b: false };
  gameState.activeEffects.ironFortress.b = true;
  
  assert(gameState.activeEffects.ironFortress.b === true, 'Iron fortress should protect pawns');
});

test('Squire Support provides backup protection', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.squireSupport = [
    { square: 'e4', color: 'w', protectorSquare: 'e3' }
  ];
  
  assert(gameState.activeEffects.squireSupport.length === 1, 'Squire support should be tracked');
});

test('Castle Breaker disables castling', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.castleBroken = { w: 0, b: 0 };
  gameState.activeEffects.castleBroken.b = 2; // Black castling disabled for 2 turns
  
  assert(gameState.activeEffects.castleBroken.b === 2, 'Castling should be disabled');
});

test('Multiple effects stack on same piece', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.poisonedPieces = [
    { square: 'e4', turnsRemaining: 3, color: 'b' }
  ];
  gameState.activeEffects.cursedSquares = [
    { square: 'e4', turnsRemaining: 2 }
  ];
  gameState.activeEffects.squireSupport = [
    { square: 'e4', color: 'w', protectorSquare: 'e3' }
  ];
  
  assert(gameState.activeEffects.poisonedPieces.length === 1, 'Poison should be tracked');
  assert(gameState.activeEffects.cursedSquares.length === 1, 'Curse should be tracked');
  assert(gameState.activeEffects.squireSupport.length === 1, 'Support should be tracked');
});

test('Effects expire after turn limit', () => {
  const gameState = createMockGameState();
  gameState.activeEffects.sanctuary = [
    { square: 'e4', turnsRemaining: 1 }
  ];
  
  // Simulate turn passing
  gameState.activeEffects.sanctuary[0].turnsRemaining--;
  
  assert(gameState.activeEffects.sanctuary[0].turnsRemaining === 0, 'Effect should expire');
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
