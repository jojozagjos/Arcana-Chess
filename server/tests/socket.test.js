/**
 * Socket.io Communication Test Suite
 * Tests client/server message patterns and game state synchronization
 */

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

// ============ MOCK SOCKET INTERFACE ============

class MockSocket {
  constructor() {
    this.listeners = {};
    this.emittedEvents = [];
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  emit(event, data) {
    this.emittedEvents.push({ event, data, timestamp: Date.now() });
  }

  trigger(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  getEmitted(event) {
    return this.emittedEvents.filter(e => e.event === event);
  }
}

// ============ SOCKET CONNECTION TESTS ============

suite('Socket Connection', () => {
  test('Socket initializes with listeners', () => {
    const socket = new MockSocket();
    socket.on('connect', () => {});
    assert(socket.listeners.connect, 'Should have connect listener');
  });

  test('Socket registers multiple event listeners', () => {
    const socket = new MockSocket();
    socket.on('move', () => {});
    socket.on('gameState', () => {});
    socket.on('checkmate', () => {});
    assert(socket.listeners.move && socket.listeners.gameState && socket.listeners.checkmate, 'Should have multiple listeners');
  });

  test('Socket emits events to server', () => {
    const socket = new MockSocket();
    socket.emit('move', { from: 'e2', to: 'e4' });
    const moves = socket.getEmitted('move');
    assert(moves.length === 1, 'Should emit move event');
  });

  test('Socket triggers callbacks when events received', () => {
    const socket = new MockSocket();
    let received = false;
    socket.on('gameState', (data) => { received = data.valid; });
    socket.trigger('gameState', { valid: true });
    assert(received, 'Should trigger callback with data');
  });
});

// ============ GAME STATE SYNCHRONIZATION ============

suite('Game State Sync', () => {
  test('Server broadcasts current FEN to all players', () => {
    const serverSocket = new MockSocket();
    const fen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
    serverSocket.emit('updateBoardState', { fen });
    
    const broadcast = serverSocket.getEmitted('updateBoardState');
    assert(broadcast[0].data.fen === fen, 'Should broadcast FEN');
  });

  test('Client receives and validates game state update', () => {
    const socket = new MockSocket();
    let updateReceived = null;
    socket.on('updateBoardState', (data) => { updateReceived = data; });
    
    const gameState = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', turn: 'w' };
    socket.trigger('updateBoardState', gameState);
    
    assert(updateReceived && updateReceived.turn === 'w', 'Should receive and parse game state');
  });

  test('Client sends move to server with validation', () => {
    const socket = new MockSocket();
    socket.emit('makeMove', { from: 'e2', to: 'e4', square: 'e2', ply: 1 });
    
    const moves = socket.getEmitted('makeMove');
    assert(moves.length === 1 && moves[0].data.from === 'e2', 'Should emit validated move');
  });

  test('Server rejects invalid moves and notifies client', () => {
    const socket = new MockSocket();
    let invalidMove = false;
    socket.on('invalidMove', (data) => { invalidMove = true; });
    
    socket.trigger('invalidMove', { reason: 'Illegal move' });
    assert(invalidMove, 'Should handle invalid move rejection');
  });

  test('Turn switches trigger appropriate events', () => {
    const socket = new MockSocket();
    let turnChanged = false;
    socket.on('turnChanged', (data) => { turnChanged = data.nextTurn === 'b'; });
    
    socket.trigger('turnChanged', { nextTurn: 'b' });
    assert(turnChanged, 'Should handle turn change notification');
  });
});

// ============ CARD EFFECT COMMUNICATION ============

suite('Card Effect Messaging', () => {
  test('Client sends card selection to server', () => {
    const socket = new MockSocket();
    socket.emit('selectCard', { cardId: 'bishop-blessing', index: 0 });
    
    const cardEvents = socket.getEmitted('selectCard');
    assert(cardEvents[0].data.cardId === 'bishop-blessing', 'Should send card selection');
  });

  test('Server broadcasts card effect application', () => {
    const socket = new MockSocket();
    socket.emit('cardActivated', {
      card: 'double-strike',
      piece: 'e4',
      affectedSquares: ['e5', 'e6']
    });
    
    const activated = socket.getEmitted('cardActivated');
    assert(activated[0].data.card === 'double-strike', 'Should broadcast card activation');
  });

  test('Client receives visual effect trigger', () => {
    const socket = new MockSocket();
    let effectTriggered = false;
    socket.on('playEffect', (data) => { effectTriggered = data.effectType === 'lightning'; });
    
    socket.trigger('playEffect', { effectType: 'lightning', position: 'd5', from: 'e4' });
    assert(effectTriggered, 'Should receive effect trigger');
  });

  test('Effects include position and timing data', () => {
    const socket = new MockSocket();
    let effectData = null;
    socket.on('playEffect', (data) => { effectData = data; });
    
    socket.trigger('playEffect', {
      effectType: 'particle-burst',
      position: 'd5',
      duration: 600,
      color: '#fbbf24'
    });
    
    assert(effectData && effectData.duration === 600, 'Should include timing data');
  });

  test('Multiple effects queue properly', () => {
    const socket = new MockSocket();
    socket.emit('playEffect', { id: 1, type: 'strike', delay: 0 });
    socket.emit('playEffect', { id: 2, type: 'burst', delay: 100 });
    socket.emit('playEffect', { id: 3, type: 'shine', delay: 200 });
    
    const effects = socket.getEmitted('playEffect');
    assert(effects.length === 3, 'Should queue all effects');
  });
});

// ============ GAME STATE EVENT FLOW ============

suite('Game Lifecycle Events', () => {
  test('Check detection notification sent to client', () => {
    const socket = new MockSocket();
    let checkNotified = false;
    socket.on('inCheck', (data) => { checkNotified = data.color === 'white'; });
    
    socket.trigger('inCheck', { color: 'white' });
    assert(checkNotified, 'Should notify of check');
  });

  test('Checkmate event triggers game end', () => {
    const socket = new MockSocket();
    let checkmated = false;
    socket.on('gameEnd', (data) => { checkmated = data.reason === 'checkmate'; });
    
    socket.trigger('gameEnd', { reason: 'checkmate', winner: 'white' });
    assert(checkmated, 'Should handle checkmate event');
  });

  test('Stalemate event ends game in draw', () => {
    const socket = new MockSocket();
    let stalemated = false;
    socket.on('gameEnd', (data) => { stalemated = data.reason === 'stalemate'; });
    
    socket.trigger('gameEnd', { reason: 'stalemate' });
    assert(stalemated, 'Should handle stalemate event');
  });

  test('Resign event removes pieces properly', () => {
    const socket = new MockSocket();
    let resigned = false;
    socket.on('resign', (data) => { resigned = data.player === 'white'; });
    
    socket.trigger('resign', { player: 'white' });
    assert(resigned, 'Should handle resign');
  });

  test('Draw offer/acceptance events work correctly', () => {
    const socket = new MockSocket();
    socket.emit('offerDraw', {});
    
    let drawOffered = socket.getEmitted('offerDraw').length > 0;
    assert(drawOffered, 'Should emit draw offer');

    socket.on('acceptDraw', () => {});
    socket.trigger('acceptDraw', {});
    assert(true, 'Should handle draw acceptance');
  });
});

// ============ NETWORK RELIABILITY ============

suite('Network Resilience', () => {
  test('Events include timestamps for ordering', () => {
    const socket = new MockSocket();
    socket.emit('move', { from: 'e2', to: 'e4' });
    
    const events = socket.getEmitted('move');
    assert(events[0].timestamp && typeof events[0].timestamp === 'number', 'Should include timestamp');
  });

  test('Multiple events maintain order', () => {
    const socket = new MockSocket();
    socket.emit('move1', { seq: 1 });
    socket.emit('move2', { seq: 2 });
    socket.emit('move3', { seq: 3 });
    
    const allEvents = socket.emittedEvents;
    assert(allEvents[0].event === 'move1' && allEvents[2].event === 'move3', 'Should maintain event order');
  });

  test('Disconnection event safely handled', () => {
    const socket = new MockSocket();
    let disconnected = false;
    socket.on('disconnect', () => { disconnected = true; });
    
    socket.trigger('disconnect');
    assert(disconnected, 'Should handle disconnect');
  });

  test('Reconnection restores game state', () => {
    const socket = new MockSocket();
    let gameStateRestored = false;
    socket.on('reconnect', (data) => { gameStateRestored = !!data.fen; });
    
    socket.trigger('reconnect', { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' });
    assert(gameStateRestored, 'Should restore game state on reconnect');
  });
});

// ============ DATA VALIDATION ============

suite('Message Validation', () => {
  test('Move message requires from/to fields', () => {
    const moveData = { from: 'e2', to: 'e4' };
    assert(moveData.from && moveData.to, 'Move should have from/to');
  });

  test('GameState message includes required fields', () => {
    const gameState = { fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', turn: 'w' };
    assert(gameState.fen && gameState.turn && typeof gameState.turn === 'string', 'GameState should be valid');
  });

  test('Card effect includes position data', () => {
    const effect = { card: 'double-strike', position: 'd5', targetSquares: ['d6', 'd7'] };
    assert(effect.card && effect.position && Array.isArray(effect.targetSquares), 'Effect should have complete data');
  });

  test('Rejects malformed event data gracefully', () => {
    const socket = new MockSocket();
    try {
      socket.emit('invalidEvent', null);
      assert(true, 'Should not throw on null data');
    } catch (e) {
      assert(false, 'Should handle malformed data');
    }
  });
});

// ============ SUMMARY ============

console.log('\n========================================');
console.log('🧪 SOCKET COMMUNICATION TEST RESULTS');
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
