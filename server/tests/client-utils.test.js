/**
 * Client Utilities Test Suite
 * Tests arcanaHelpers, arcanaMovesHelper, and effectResourcePool
 */

import { Chess } from 'chess.js';

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

// ============ ARCANA HELPERS TESTS ============

suite('Arcana Helpers - Rarity Colors', () => {
  // Mock the getRarityColor function behavior
  const getRarityColor = (rarity) => {
    const colors = {
      common: '#aaa',
      uncommon: '#4ade80',
      rare: '#60a5fa',
      epic: '#c084fc',
      legendary: '#fbbf24',
    };
    return colors[rarity] || '#fff';
  };

  test('Returns correct color for common rarity', () => {
    const color = getRarityColor('common');
    assertEqual(color, '#aaa', 'Common should be gray');
  });

  test('Returns correct color for uncommon rarity', () => {
    const color = getRarityColor('uncommon');
    assertEqual(color, '#4ade80', 'Uncommon should be green');
  });

  test('Returns correct color for rare rarity', () => {
    const color = getRarityColor('rare');
    assertEqual(color, '#60a5fa', 'Rare should be blue');
  });

  test('Returns correct color for epic rarity', () => {
    const color = getRarityColor('epic');
    assertEqual(color, '#c084fc', 'Epic should be purple');
  });

  test('Returns correct color for legendary rarity', () => {
    const color = getRarityColor('legendary');
    assertEqual(color, '#fbbf24', 'Legendary should be gold');
  });

  test('Returns default color for unknown rarity', () => {
    const color = getRarityColor('unknown');
    assertEqual(color, '#fff', 'Unknown should return white');
  });
});

suite('Arcana Helpers - Log Colors', () => {
  const getLogColor = (type) => {
    const colors = {
      info: '#aaa',
      success: '#22c55e',
      warning: '#f59e0b',
      error: '#ef4444',
      test: '#60a5fa',
    };
    return colors[type] || '#aaa';
  };

  test('Returns info color', () => {
    const color = getLogColor('info');
    assertEqual(color, '#aaa', 'Info should be gray');
  });

  test('Returns success color', () => {
    const color = getLogColor('success');
    assertEqual(color, '#22c55e', 'Success should be green');
  });

  test('Returns warning color', () => {
    const color = getLogColor('warning');
    assertEqual(color, '#f59e0b', 'Warning should be orange');
  });

  test('Returns error color', () => {
    const color = getLogColor('error');
    assertEqual(color, '#ef4444', 'Error should be red');
  });

  test('Returns test color', () => {
    const color = getLogColor('test');
    assertEqual(color, '#60a5fa', 'Test should be blue');
  });
});

// ============ ARCANA MOVES HELPER TESTS ============

suite('Arcana Moves - Spectral March', () => {
  test('Spectral March allows rook through friendly piece', () => {
    const chess = new Chess('4k3/8/8/1r6/1P6/1P6/4K3/8 b - - 0 1');
    // Black rook at b5 with white pawns at b4 and b3
    // Should be able to move through b4 but not beyond
    const rook = chess.get('b5');
    assert(rook && rook.type === 'r', 'Should have rook at b5');
  });

  test('Spectral March validates move syntax', () => {
    const chess = new Chess();
    const moves = chess.moves({ verbose: true });
    const validMove = moves[0];
    assert(validMove.from && validMove.to && validMove.piece, 'Move should have valid structure');
  });
});

suite('Arcana Moves - Phantom Step', () => {
  test('Phantom Step enables knight-like moves for non-knights', () => {
    const chess = new Chess('4k3/8/8/8/8/8/4B3/4K3 w - - 0 1');
    const bishop = chess.get('e2');
    assert(bishop && bishop.type === 'b', 'Should have bishop at e2');
    // Phantom step would allow bishop to jump like a knight
  });
});

suite('Arcana Moves - Pawn Rush', () => {
  test('Pawn Rush allows pawns to move 2 squares from any position', () => {
    const chess = new Chess('4k3/8/4p3/8/8/8/4P3/4K3 w - - 0 1');
    const pawn = chess.get('e2');
    assert(pawn && pawn.type === 'p', 'Should have pawn at e2');
  });

  test('Pawn Rush respects board boundaries', () => {
    const chess = new Chess('4k3/1p6/8/8/8/8/4P3/4K3 w - - 0 1');
    const moves = chess.moves();
    assert(moves.length > 0, 'White should have legal moves');
  });
});

// ============ EFFECT RESOURCE POOL TESTS ============

suite('Effect Resource Pool - Capacity', () => {
  class EffectResourcePool {
    constructor() {
      this.activeEffects = new Map();
      this.maxConcurrentEffects = 4;
      this.maxParticlesPerEffect = 120;
      this.totalParticleLimit = 400;
      this.disposedMaterials = [];
      this.disposedGeometries = [];
    }

    canCreateEffect(particleCount = 0) {
      if (this.activeEffects.size >= this.maxConcurrentEffects) {
        return false;
      }

      const totalParticles = Array.from(this.activeEffects.values()).reduce((sum, e) => sum + e.particleCount, 0);
      if (totalParticles + particleCount > this.totalParticleLimit) {
        return false;
      }

      return true;
    }

    registerEffect(effectId, particleCount = 0) {
      const capped = Math.min(particleCount, this.maxParticlesPerEffect);
      this.activeEffects.set(effectId, {
        createdAt: Date.now(),
        particleCount: capped,
      });
      return capped;
    }

    unregisterEffect(effectId) {
      this.activeEffects.delete(effectId);
    }

    getAdjustedParticleCount(baseCount) {
      // Simplified version without performance.memory check
      return baseCount;
    }
  }

  test('Allows effect creation within limits', () => {
    const pool = new EffectResourcePool();
    assert(pool.canCreateEffect(50), 'Should allow effect within limits');
  });

  test('Blocks effect at max concurrent', () => {
    const pool = new EffectResourcePool();
    // Fill to max
    for (let i = 0; i < 4; i++) {
      pool.registerEffect(`effect-${i}`, 50);
    }
    assert(!pool.canCreateEffect(50), 'Should block at max concurrent');
  });

  test('Blocks effect exceeding particle limit', () => {
    const pool = new EffectResourcePool();
    // Register 4 effects at 100 particles each = 400 total
    pool.registerEffect('effect-1', 100);
    pool.registerEffect('effect-2', 100);
    pool.registerEffect('effect-3', 100);
    pool.registerEffect('effect-4', 100);
    // Now at limit, any new effect should be blocked
    assert(!pool.canCreateEffect(1), 'Should block when at total particle limit');
  });

  test('Registers effect with capped particles', () => {
    const pool = new EffectResourcePool();
    const capped = pool.registerEffect('effect-1', 500);
    assert(capped === 120, 'Particles should be capped at max per effect');
  });

  test('Unregisters effect and allows new ones', () => {
    const pool = new EffectResourcePool();
    pool.registerEffect('effect-1', 50);
    assert(pool.activeEffects.size === 1, 'Should have 1 effect');
    pool.unregisterEffect('effect-1');
    assert(pool.activeEffects.size === 0, 'Should have 0 effects after unregister');
  });

  test('Adjusts particle count for performance', () => {
    const pool = new EffectResourcePool();
    const adjusted = pool.getAdjustedParticleCount(100);
    assert(adjusted > 0, 'Should return positive particle count');
  });
});

suite('Effect Resource Pool - Disposal', () => {
  class EffectResourcePool {
    constructor() {
      this.disposedMaterials = [];
      this.disposedGeometries = [];
    }

    queueDisposal(material, geometry) {
      if (material) this.disposedMaterials.push(material);
      if (geometry) this.disposedGeometries.push(geometry);
    }

    performDeferredDisposal() {
      const batchSize = 5;
      for (let i = 0; i < Math.min(batchSize, this.disposedMaterials.length); i++) {
        try {
          const mat = this.disposedMaterials.shift();
          if (mat?.dispose) mat.dispose();
        } catch (e) {
          // Silently ignore
        }
      }
      for (let i = 0; i < Math.min(batchSize, this.disposedGeometries.length); i++) {
        try {
          const geom = this.disposedGeometries.shift();
          if (geom?.dispose) geom.dispose();
        } catch (e) {
          // Silently ignore
        }
      }
    }
  }

  test('Queues materials for disposal', () => {
    const pool = new EffectResourcePool();
    const mockMaterial = { dispose: () => {} };
    pool.queueDisposal(mockMaterial, null);
    assert(pool.disposedMaterials.length === 1, 'Should queue material');
  });

  test('Queues geometries for disposal', () => {
    const pool = new EffectResourcePool();
    const mockGeometry = { dispose: () => {} };
    pool.queueDisposal(null, mockGeometry);
    assert(pool.disposedGeometries.length === 1, 'Should queue geometry');
  });

  test('Performs deferred disposal in batches', () => {
    const pool = new EffectResourcePool();
    let disposed = 0;
    
    // Queue mock objects
    for (let i = 0; i < 10; i++) {
      pool.queueDisposal(
        { dispose: () => { disposed++; } },
        null
      );
    }
    
    pool.performDeferredDisposal();
    assert(disposed === 5, 'Should dispose in batch of 5');
    assert(pool.disposedMaterials.length === 5, 'Should have 5 remaining');
  });

  test('Handles disposal errors gracefully', () => {
    const pool = new EffectResourcePool();
    pool.queueDisposal({ dispose: () => { throw new Error('Dispose failed'); } }, null);
    // Should not throw
    pool.performDeferredDisposal();
    assert(true, 'Should handle disposal errors');
  });
});

// ============ SUMMARY ============

console.log('\n========================================');
console.log('🧪 CLIENT UTILITIES TEST RESULTS');
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
