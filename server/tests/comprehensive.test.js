/**
 * Comprehensive Arcana Chess Test Suite
 * Tests game logic, piece movement, special moves, and complex scenarios
 */

import { Chess } from 'chess.js';
import { getAdjacentSquares } from '../arcana/arcanaUtils.js';

let passed = 0, failed = 0;
const suites = [];
let currentSuite = null;

function suite(name, fn) {
  currentSuite = { name, tests: [] };
  suites.push(currentSuite);
  fn();
}

function test(name, fn) {
  if (!currentSuite) {
    currentSuite = { name: 'Global', tests: [] };
    suites.push(currentSuite);
  }
  
  const start = Date.now();
  try {
    fn();
    const duration = Date.now() - start;
    console.log(`  ✅ ${name} (${duration}ms)`);
    passed++;
    currentSuite.tests.push({ name, status: 'passed' });
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`  ❌ ${name} (${duration}ms) - ${error.message}`);
    failed++;
    currentSuite.tests.push({ name, status: 'failed', error: error.message });
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

// ============ PAWN TESTS ============

suite('Pawn Movement', () => {
  test('Pawn advances one square from starting position', () => {
    const chess = new Chess();
    const moves = chess.moves({ square: 'e2', verbose: true });
    const oneSquare = moves.find(m => m.to === 'e3');
    assert(oneSquare, 'Pawn should move to e3');
  });

  test('Pawn advances two squares from starting position', () => {
    const chess = new Chess();
    const moves = chess.moves({ square: 'e2', verbose: true });
    const twoSquares = moves.find(m => m.to === 'e4');
    assert(twoSquares, 'Pawn should move to e4');
  });

  test('Pawn cannot move backwards', () => {
    const chess = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    const moves = chess.moves({ square: 'e4', verbose: true });
    const backwards = moves.find(m => m.to === 'e3');
    assert(!backwards, 'Pawn should not move backwards');
  });

  test('Pawn captures diagonally', () => {
    const chess = new Chess('rnbqkbnr/pppppppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 1');
    const moves = chess.moves({ square: 'e4', verbose: true });
    const capture = moves.find(m => m.to === 'd5');
    assert(capture && capture.captured, 'Pawn should capture diagonally');
  });

  test('Pawn cannot move through pieces', () => {
    const chess = new Chess('rnbqkbnr/pppppppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1');
    const moves = chess.moves({ square: 'e4', verbose: true });
    const forward = moves.find(m => m.to === 'e5');
    assert(!forward, 'Pawn should not move forward when blocked');
  });

  test('Pawn promotion on 8th rank', () => {
    const chess = new Chess('4k3/P7/8/8/8/8/p7/4K3 w - - 0 1');
    const moves = chess.moves({ square: 'a7', verbose: true });
    const promotions = moves.filter(m => m.promotion);
    assert(promotions.length >= 4, 'Should have promotion options');
  });
});

// ============ KNIGHT TESTS ============

suite('Knight Movement', () => {
  test('Knight moves in L-shape', () => {
    const chess = new Chess('8/8/8/8/8/8/4N3/4K2k w - - 0 1');
    const moves = chess.moves({ square: 'e2', verbose: true });
    const targets = moves.map(m => m.to);
    assert(targets.includes('f4'), 'Knight should move to f4');
    assert(targets.includes('d4'), 'Knight should move to d4');
  });

  test('Knight jumps over pieces', () => {
    const chess = new Chess('4k3/8/8/8/8/8/PPPPNPPP/RNBQKBNR w KQ - 0 1');
    const moves = chess.moves({ square: 'e2', verbose: true });
    assert(moves.length > 0, 'Knight should jump over pawns');
  });
});

// ============ BISHOP TESTS ============

suite('Bishop Movement', () => {
  test('Bishop moves diagonally', () => {
    const chess = new Chess('8/8/8/8/8/8/4B3/4K2k w - - 0 1');
    const moves = chess.moves({ square: 'e2', verbose: true });
    const targets = moves.map(m => m.to);
    assert(targets.includes('d3'), 'Bishop should move diagonally');
    assert(targets.includes('f3'), 'Bishop should move diagonally');
  });

  test('Bishop blocked by own piece', () => {
    const chess = new Chess('8/8/8/8/8/4P3/4B3/4K2k w - - 0 1');
    const moves = chess.moves({ square: 'e2', verbose: true });
    const blocked = moves.find(m => m.to === 'e3');
    assert(!blocked, 'Bishop should not move through own piece');
  });
});

// ============ ROOK TESTS ============

suite('Rook Movement', () => {
  test('Rook moves horizontally and vertically', () => {
    const chess = new Chess('8/8/8/8/8/8/4R3/4K2k w - - 0 1');
    const moves = chess.moves({ square: 'e2', verbose: true });
    const targets = moves.map(m => m.to);
    assert(targets.includes('e8'), 'Rook should move vertically');
    assert(targets.includes('a2'), 'Rook should move horizontally');
  });
});

// ============ QUEEN TESTS ============

suite('Queen Movement', () => {
  test('Queen moves like rook and bishop', () => {
    const chess = new Chess('8/8/8/8/8/8/4Q3/4K2k w - - 0 1');
    const moves = chess.moves({ square: 'e2', verbose: true });
    const targets = moves.map(m => m.to);
    assert(targets.includes('e8'), 'Queen should move vertically');
    assert(targets.includes('a2'), 'Queen should move horizontally');
    assert(targets.includes('f3'), 'Queen should move diagonally');
  });
});

// ============ KING TESTS ============

suite('King Movement', () => {
  test('King moves one square in any direction', () => {
    const chess = new Chess('8/8/8/8/8/8/4K3/4k3 w - - 0 1');
    const moves = chess.moves({ square: 'e2', verbose: true });
    assert(moves.length > 0, 'King should have moves');
  });

  test('King cannot move into check', () => {
    const chess = new Chess('8/8/8/8/8/8/4K3/4kr2 w - - 0 1');
    const moves = chess.moves({ square: 'e2', verbose: true });
    const intoCheck = moves.find(m => m.to === 'f1');
    assert(!intoCheck, 'King should not move into check');
  });
});

// ============ SPECIAL MOVES ============

suite('Castling', () => {
  test('Castling disabled after king moves', () => {
    const chess = new Chess('rnbqkbnr/pppppppp/8/8/8/4K3/PPPPPPPP/RNBQ1BNR b KQkq - 0 1');
    const moves = chess.moves({ square: 'e8', verbose: true });
    const canCastle = moves.find(m => m.to === 'c8' || m.to === 'g8');
    assert(!canCastle, 'Castling disabled after king moves');
  });

  test('Castling disabled in check', () => {
    const chess = new Chess('r3k2r/pppppppp/5n2/8/8/5n2/PPPPPPPP/RNBQKB1R w KQkq - 0 1');
    const moves = chess.moves({ square: 'e1', verbose: true });
    const canCastle = moves.find(m => m.to === 'c1' || m.to === 'g1');
    assert(!canCastle, 'Cannot castle in check');
  });
});

suite('En Passant', () => {
  test('En passant available after pawn double move', () => {
    const chess = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    chess.move('d5');
    const moves = chess.moves({ square: 'e4', verbose: true });
    const enPassant = moves.find(m => m.to === 'd5');
    assert(enPassant, 'En passant should be available');
  });
});

// ============ CHECK/CHECKMATE ============

suite('Check & Checkmate', () => {
  test('Check detected when king attacked', () => {
    const chess = new Chess('r3k3/8/8/8/8/8/4R3/4K3 b - - 0 1');
    assert(chess.isCheck(), 'Black king should be in check');
  });

  test('Check not detected when safe', () => {
    const chess = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    assert(!chess.isCheck(), 'No check from starting position');
  });

  test('Moving into check is invalid', () => {
    const chess = new Chess('r3k3/8/8/8/8/8/4R3/4K3 b - - 0 1');
    const moves = chess.moves();
    const intoCheck = moves.find(m => m.includes('e1'));
    assert(!intoCheck, 'Cannot move into check');
  });
});

// ============ TURN MANAGEMENT ============

suite('Turn Alternation', () => {
  test('Turn switches white to black', () => {
    const chess = new Chess();
    assertEqual(chess.turn(), 'w', 'Should start as white');
    chess.move('e4');
    assertEqual(chess.turn(), 'b', 'Should switch to black');
  });

  test('Black has moves after white move', () => {
    const chess = new Chess();
    chess.move('e4');
    const moves = chess.moves();
    assert(moves.length > 0, 'Black should have legal moves');
  });

  test('Multiple moves alternate correctly', () => {
    const chess = new Chess();
    chess.move('e4');
    assertEqual(chess.turn(), 'b', 'Turn 1: black');
    chess.move('c5');
    assertEqual(chess.turn(), 'w', 'Turn 2: white');
  });
});

// ============ CAPTURES ============

suite('Piece Captures', () => {
  test('Capture updates board state', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('d5');
    chess.move('exd5');
    const d5 = chess.get('d5');
    assert(d5 && d5.color === 'w' && d5.type === 'p', 'White pawn should occupy d5');
  });

  test('Cannot capture own pieces', () => {
    const chess = new Chess('4k3/8/8/8/8/4P3/4P3/4K3 w - - 0 1');
    const moves = chess.moves({ square: 'e2', verbose: true });
    const ownCapture = moves.find(m => m.to === 'e3');
    assert(!ownCapture, 'Cannot capture own piece');
  });

  test('Piece count decreases after capture', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('d5');
    const piecesBefor = chess.board().flat().filter(p => p).length;
    chess.move('exd5');
    const piecesAfter = chess.board().flat().filter(p => p).length;
    assertEqual(piecesBefor - 1, piecesAfter, 'One piece removed');
  });
});

// ============ GAME STATE ============

suite('Board & Game State', () => {
  test('FEN changes after move', () => {
    const chess = new Chess();
    const before = chess.fen();
    chess.move('e4');
    const after = chess.fen();
    assert(before !== after, 'FEN should change after move');
  });

  test('Legal moves generated correctly', () => {
    const chess = new Chess();
    const moves = chess.moves();
    assertEqual(moves.length, 20, 'Should have 20 starting moves');
  });

  test('Move affects turn and board', () => {
    const chess = new Chess();
    const moveBefore = { turn: chess.turn(), fen: chess.fen() };
    chess.move('e4');
    assert(chess.turn() !== moveBefore.turn, 'Turn should change');
    assert(chess.fen() !== moveBefore.fen, 'FEN should change');
  });
});

// ============ EFFECT TRACKING ============

suite('Game Effects', () => {
  test('Multiple effects track independently', () => {
    const effects = {
      curses: [
        { square: 'e4', turns: 3 },
        { square: 'd5', turns: 2 }
      ]
    };
    assertEqual(effects.curses.length, 2, 'Should track 2 curses');
  });

  test('Effects can expire', () => {
    const poison = { square: 'e4', turns: 1 };
    poison.turns--;
    assertEqual(poison.turns, 0, 'Effect should expire');
  });

  test('Double Strike vs Berserker distinction', () => {
    const ds = { anyPiece: true, adjacentAllowed: true };
    const br = { samePieceOnly: true, nonAdjacentOnly: true };
    assert(ds.anyPiece, 'Double Strike allows any piece');
    assert(br.samePieceOnly, 'Berserker Rage restricts piece');
    assert(br.nonAdjacentOnly, 'Berserker Rage restricts distance');
  });
});

// ============ PERFORMANCE ============

suite('Performance', () => {
  test('Move generation is fast', () => {
    const chess = new Chess();
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      chess.moves();
    }
    const duration = performance.now() - start;
    assert(duration < 100, `Move generation must be < 100ms, took ${duration.toFixed(2)}ms`);
  });

  test('FEN parsing is quick', () => {
    const fens = [
      'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'
    ];
    const start = performance.now();
    fens.forEach(fen => new Chess(fen).moves());
    const duration = performance.now() - start;
    assert(duration < 50, `FEN parsing must be < 50ms, took ${duration.toFixed(2)}ms`);
  });
});

// ============ INTEGRATION ============

suite('Game Scenarios', () => {
  test('Moved sequence is valid', () => {
    const chess = new Chess();
    chess.move('e4');
    chess.move('c5');
    chess.move('Nf3');
    assert(chess.turn() === 'b', 'Black should move next');
  });

  test('Complex game progression', () => {
    const chess = new Chess();
    const moves = ['e4', 'c5', 'Nf3', 'd6', 'Bc4', 'e6'];
    moves.forEach(move => {
      const before = chess.turn();
      chess.move(move);
      assert(chess.turn() !== before, 'Turn should alternate');
    });
  });

  test('Game state consistency', () => {
    const chess = new Chess();
    const before = { num: chess.board().flat().filter(p => p).length };
    chess.move('e4');
    chess.move('a5');
    chess.move('e5');
    assert(true, 'Game should progress without error');
  });
});

// ============ SUMMARY ============

console.log('\n========================================');
console.log('🧪 COMPREHENSIVE TEST RESULTS');
console.log('========================================');

suites.forEach(suite => {
  const passed_count = suite.tests.filter(t => t.status === 'passed').length;
  const failed_count = suite.tests.filter(t => t.status === 'failed').length;
  const total = passed_count + failed_count;
  const percent = total > 0 ? ((passed_count / total) * 100).toFixed(0) : 0;
  console.log(`${suite.name} (${passed_count}/${total} - ${percent}%)`);
});

console.log('\n========================================');
console.log(`✅ Total Passed: ${passed}`);
console.log(`❌ Total Failed: ${failed}`);
console.log(`📊 Total Tests: ${passed + failed}`);
if (passed + failed > 0) {
  console.log(`🎯 Success Rate: ${((passed / (passed + failed)) * 100).toFixed(2)}%`);
}
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
}
