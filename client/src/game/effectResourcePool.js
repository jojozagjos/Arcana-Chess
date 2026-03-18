/**
 * Effect Resource Pool
 * Manages GPU resources and prevents context loss by limiting concurrent effects
 */

class EffectResourcePool {
  constructor() {
    this.activeEffects = new Map(); // Map<effectId, { createdAt, particleCount }>
    this.defaultMaxConcurrentEffects = 4;
    this.defaultMaxParticlesPerEffect = 120;
    this.defaultTotalParticleLimit = 400;
    this.maxConcurrentEffects = this.defaultMaxConcurrentEffects; // Max effects at once
    this.maxParticlesPerEffect = this.defaultMaxParticlesPerEffect; // Reduced to avoid GPU saturation
    this.totalParticleLimit = this.defaultTotalParticleLimit; // Max particles across all active effects
    this.disposedMaterials = [];
    this.disposedGeometries = [];
  }

  /**
   * Check if a new effect can be created
   */
  canCreateEffect(particleCount = 0) {
    if (this.activeEffects.size >= this.maxConcurrentEffects) {
      console.warn(`[EffectPool] Max concurrent effects (${this.maxConcurrentEffects}) reached, queuing new effect`);
      return false;
    }

    const totalParticles = Array.from(this.activeEffects.values()).reduce((sum, e) => sum + e.particleCount, 0);
    if (totalParticles + particleCount > this.totalParticleLimit) {
      console.warn(`[EffectPool] Total particle limit (${this.totalParticleLimit}) would be exceeded`);
      return false;
    }

    return true;
  }

  /**
   * Register an active effect
   */
  registerEffect(effectId, particleCount = 0) {
    const capped = Math.min(particleCount, this.maxParticlesPerEffect);
    this.activeEffects.set(effectId, {
      createdAt: Date.now(),
      particleCount: capped,
    });
    return capped; // Return capped particle count
  }

  /**
   * Unregister a completed effect
   */
  unregisterEffect(effectId) {
    this.activeEffects.delete(effectId);
  }

  /**
   * Get adjusted particle count based on device conditions
   */
  getAdjustedParticleCount(baseCount) {
    // Check device memory if available
    if (performance?.memory) {
      const { jsHeapSizeLimit, totalJSHeapSize } = performance.memory;
      const memoryUsageRatio = totalJSHeapSize / jsHeapSizeLimit;
      
      if (memoryUsageRatio > 0.85) {
        // High memory usage, reduce particles
        return Math.floor(baseCount * 0.5);
      } else if (memoryUsageRatio > 0.7) {
        return Math.floor(baseCount * 0.75);
      }
    }

    return baseCount;
  }

  /**
   * Queue material/geometry for lazy disposal to avoid frame stalls
   */
  queueDisposal(material, geometry) {
    if (material) this.disposedMaterials.push(material);
    if (geometry) this.disposedGeometries.push(geometry);
  }

  /**
   * Perform deferred disposal on next frame when safe
   */
  performDeferredDisposal() {
    // Dispose in batches to avoid frame rate spikes
    const batchSize = 5;

    for (let i = 0; i < Math.min(batchSize, this.disposedMaterials.length); i++) {
      try {
        const mat = this.disposedMaterials.shift();
        if (mat?.dispose) mat.dispose();
      } catch (e) {
        // Silently ignore disposal errors
      }
    }

    for (let i = 0; i < Math.min(batchSize, this.disposedGeometries.length); i++) {
      try {
        const geom = this.disposedGeometries.shift();
        if (geom?.dispose) geom.dispose();
      } catch (e) {
        // Silently ignore disposal errors
      }
    }
  }

  /**
   * Get pool status
   */
  getStatus() {
    const totalParticles = Array.from(this.activeEffects.values()).reduce((sum, e) => sum + e.particleCount, 0);
    return {
      activeEffects: this.activeEffects.size,
      totalParticles,
      pendingDisposals: this.disposedMaterials.length + this.disposedGeometries.length,
      memoryPressure: performance?.memory
        ? (performance.memory.totalJSHeapSize / performance.memory.jsHeapSizeLimit).toFixed(2)
        : 'N/A',
    };
  }

  /**
   * Hard reset after context loss: clear active tracking/disposal queues and
   * lower limits based on repeated loss count.
   */
  hardResetForContextLoss(lossCount = 1) {
    const level = Math.max(1, Number(lossCount) || 1);
    this.activeEffects.clear();
    this.disposedMaterials.length = 0;
    this.disposedGeometries.length = 0;

    const steppedPenalty = Math.min(3, level);
    this.maxConcurrentEffects = Math.max(1, this.defaultMaxConcurrentEffects - steppedPenalty);
    this.maxParticlesPerEffect = Math.max(48, this.defaultMaxParticlesPerEffect - steppedPenalty * 22);
    this.totalParticleLimit = Math.max(140, this.defaultTotalParticleLimit - steppedPenalty * 95);
  }

  /**
   * Restore normal limits after the context has stabilized.
   */
  restoreDefaults() {
    this.maxConcurrentEffects = this.defaultMaxConcurrentEffects;
    this.maxParticlesPerEffect = this.defaultMaxParticlesPerEffect;
    this.totalParticleLimit = this.defaultTotalParticleLimit;
  }
}

export const effectResourcePool = new EffectResourcePool();
