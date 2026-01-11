# WebGL Context Loss Fixes

## Overview
This document describes the fixes implemented to prevent and handle WebGL context loss errors in Arcana Chess.

## Problem
The error `THREE.WebGLRenderer: Context Lost` can occur when:
- Too many GPU resources are allocated
- Browser/GPU runs out of memory
- Tab is backgrounded for too long
- GPU driver crashes or resets
- Multiple WebGL contexts compete for resources

## Solutions Implemented

### 1. Context Loss Event Handlers
**Files Modified:**
- `client/src/components/GameScene.jsx`
- `client/src/components/IntroScreen.jsx`

**Changes:**
Added `onCreated` callback to Canvas components to handle context loss/restore events:
```javascript
<Canvas
  onCreated={({ gl }) => {
    gl.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost. Preventing default.');
    });
    gl.domElement.addEventListener('webglcontextrestored', () => {
      console.log('WebGL context restored.');
    });
  }}
>
```

**Benefits:**
- Prevents default browser behavior that might reload the page
- Logs context loss/restore for debugging
- Allows graceful degradation instead of crashes

### 2. Resource Cleanup
**Files Modified:**
- `client/src/game/arcana/particleSystem.jsx`

**Changes:**
Added proper disposal of Three.js geometries on component unmount:
```javascript
useEffect(() => {
  return () => {
    if (geometry) {
      geometry.dispose();
    }
  };
}, [geometry]);
```

**Benefits:**
- Prevents memory leaks from undisposed geometries
- Reduces GPU memory pressure
- Allows garbage collection of Three.js resources

### 3. WebGL Resource Monitor
**Files Created:**
- `client/src/game/webglMonitor.js`

**Features:**
- Monitor WebGL resource limits and usage
- Track context lost/restored state
- Provide debugging utilities
- Set up context handlers programmatically

**Usage Example:**
```javascript
import { createWebGLMonitor } from './game/webglMonitor.js';

// In Canvas onCreated callback
const monitor = createWebGLMonitor(gl);
monitor.logLimits(); // Log resource limits for debugging
monitor.setupContextHandlers(gl.domElement, onLost, onRestored);
```

## Best Practices to Prevent Context Loss

### 1. Dispose Resources Properly
Always dispose of Three.js objects when no longer needed:
```javascript
geometry.dispose();
material.dispose();
texture.dispose();
renderTarget.dispose();
```

### 2. Limit Active Resources
- Reduce number of simultaneous textures
- Use texture atlases when possible
- Minimize shader complexity
- Reuse materials and geometries

### 3. Use Efficient Rendering Settings
- Enable frustum culling: `<mesh frustumCulled={true}>`
- Use appropriate texture sizes (power of 2)
- Enable mipmaps for textures
- Use lower-resolution shadows if needed

### 4. Handle Background Tabs
React Three Fiber automatically pauses rendering when tab is backgrounded, but you can also:
- Reduce frame rate when not visible
- Dispose of non-essential resources
- Implement visibility change handlers

### 5. Monitor Performance
- Use browser DevTools Performance tab
- Check GPU memory usage
- Monitor console for warnings
- Test on lower-end devices

## Testing

### Manual Testing
1. Play the game normally - should work without errors
2. Background the tab for 5+ minutes, then return - should restore
3. Open multiple tabs with the game - should handle multiple contexts
4. Play on lower-end GPU - should degrade gracefully

### Simulated Context Loss
For debugging, you can force context loss:
```javascript
const ext = gl.getExtension('WEBGL_lose_context');
ext.loseContext(); // Force context loss
setTimeout(() => ext.restoreContext(), 1000); // Restore after 1s
```

## Known Limitations

1. **Visual Glitches During Restore**: Some visual effects may flicker or reset when context is restored
2. **State Loss**: Current shader state may need to be recompiled
3. **Texture Reupload**: Textures need to be reuploaded to GPU

## Future Improvements

1. Implement texture atlasing to reduce texture count
2. Add object pooling for frequently created/destroyed geometries
3. Implement LOD (Level of Detail) for pieces
4. Add GPU memory usage monitoring in production
5. Implement progressive resource loading

## Resources

- [WebGL Context Loss Handling](https://www.khronos.org/webgl/wiki/HandlingContextLost)
- [Three.js Memory Management](https://threejs.org/docs/#manual/en/introduction/How-to-dispose-of-objects)
- [React Three Fiber Best Practices](https://docs.pmnd.rs/react-three-fiber/advanced/pitfalls)
