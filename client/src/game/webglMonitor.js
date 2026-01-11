/**
 * WebGL Resource Monitor
 * Helps track and prevent WebGL context loss by monitoring resource usage
 */

export class WebGLMonitor {
  constructor(gl) {
    this.gl = gl;
    this.isContextLost = false;
    this.warningThreshold = 0.8; // Warn at 80% of limits
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
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.isContextLost = true;
      console.warn('WebGL context lost. Preventing default behavior.');
      if (onLost) onLost(e);
    }, false);

    canvas.addEventListener('webglcontextrestored', (e) => {
      this.isContextLost = false;
      console.log('WebGL context restored.');
      if (onRestored) onRestored(e);
    }, false);
  }

  /**
   * Clean up event listeners
   */
  dispose(canvas) {
    if (canvas) {
      canvas.removeEventListener('webglcontextlost', this.handleContextLost);
      canvas.removeEventListener('webglcontextrestored', this.handleContextRestored);
    }
  }
}

/**
 * Helper function to create a monitor for a THREE renderer
 */
export function createWebGLMonitor(renderer) {
  if (!renderer || !renderer.getContext) {
    console.warn('Invalid renderer provided to createWebGLMonitor');
    return null;
  }

  const gl = renderer.getContext();
  return new WebGLMonitor(gl);
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
