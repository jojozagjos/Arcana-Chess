/**
 * WebGL Resource Monitor
 * Helps track and prevent WebGL context loss by monitoring resource usage
 */

export class WebGLMonitor {
  constructor(gl, canvas = null) {
    this.gl = gl;
    this.canvas = canvas;
    this.isContextLost = false;
    this.warningThreshold = 0.8; // Warn at 80% of limits

    // Bound handlers so we can remove them later
    this._boundHandleContextLost = null;
    this._boundHandleContextRestored = null;
  }

  /**
   * Check current resource usage
   */
  checkResources() {
    if (!this.gl) return null;

    const info = {
      maxTextures: this.gl.getParameter(this.gl.MAX_TEXTURE_IMAGE_UNITS),
      maxVertexAttribs: this.gl.getParameter(this.gl.MAX_VERTEX_ATTRIBS),
      maxVaryingVectors: this.gl.getParameter(this.gl.MAX_VARYING_VECTORS),
      maxVertexUniformVectors: this.gl.getParameter(this.gl.MAX_VERTEX_UNIFORM_VECTORS),
      maxFragmentUniformVectors: this.gl.getParameter(this.gl.MAX_FRAGMENT_UNIFORM_VECTORS),
      maxCombinedTextureImageUnits: this.gl.getParameter(this.gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS),
      contextLost: this.gl.isContextLost(),
    };

    // Check if context is lost
    if (info.contextLost && !this.isContextLost) {
      this.isContextLost = true;
      console.error('WebGL context has been lost!');
    } else if (!info.contextLost && this.isContextLost) {
      this.isContextLost = false;
      console.log('WebGL context has been restored.');
    }

    return info;
  }

  /**
   * Log resource limits (useful for debugging)
   */
  logLimits() {
    const info = this.checkResources();
    if (info) {
      console.log('WebGL Resource Limits:', info);
    }
  }

  /**
   * Set up context loss/restore handlers
   */
  setupContextHandlers(canvas, onLost, onRestored) {
    this.canvas = canvas;

    // store bound handlers so we can remove them in dispose()
    this._boundHandleContextLost = (e) => {
      try { e.preventDefault(); } catch (err) {}
      this.isContextLost = true;
      console.warn('WebGL context lost. Preventing default behavior.');
      if (onLost) onLost(e);
    };

    this._boundHandleContextRestored = (e) => {
      this.isContextLost = false;
      console.log('WebGL context restored.');
      if (onRestored) onRestored(e);
    };

    canvas.addEventListener('webglcontextlost', this._boundHandleContextLost, false);
    canvas.addEventListener('webglcontextrestored', this._boundHandleContextRestored, false);
  }

  /**
   * Clean up event listeners
   */
  dispose(canvas) {
    const c = canvas || this.canvas;
    if (c) {
      if (this._boundHandleContextLost) c.removeEventListener('webglcontextlost', this._boundHandleContextLost);
      if (this._boundHandleContextRestored) c.removeEventListener('webglcontextrestored', this._boundHandleContextRestored);
    }
    this._boundHandleContextLost = null;
    this._boundHandleContextRestored = null;
  }
}

/**
 * Helper function to create a monitor for a THREE renderer
 */
export function createWebGLMonitor(renderer) {
  if (!renderer) {
    console.warn('Invalid renderer provided to createWebGLMonitor');
    return null;
  }

  // Try to obtain GL context and canvas from common Three renderer shapes
  const gl = (typeof renderer.getContext === 'function') ? renderer.getContext() : (renderer.getContext ? renderer.getContext : null) || (renderer.context || null);
  const canvas = renderer.domElement || null;
  const monitor = new WebGLMonitor(gl, canvas);
  if (canvas) monitor.setupContextHandlers(canvas);
  return monitor;
}

/**
 * Best practices to avoid context loss:
 * 1. Dispose of unused geometries, materials, and textures
 * 2. Limit the number of active textures
 * 3. Use texture atlases when possible
 * 4. Reduce shader complexity
 * 5. Avoid creating too many WebGL contexts
 * 6. Use power-efficient rendering settings
 */
