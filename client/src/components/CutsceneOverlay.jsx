import React, { useRef, useEffect, useState } from 'react';
import '../components/styles/CutsceneOverlay.css';

/**
 * CutsceneOverlay Component
 * 
 * Provides visual overlay effects for cutscenes:
 * - Monochrome/grayscale fading
 * - Color vignette/darkening
 * - Flash/light burst effects
 * - Smooth transitions
 * 
 * Usage:
 * ```jsx
 * const overlayRef = useRef();
 * 
 * overlayRef.current.playEffect({
 *   effect: 'monochrome',
 *   duration: 500,
 *   intensity: 1.0,
 * });
 * ```
 */

export const CutsceneOverlay = React.forwardRef((props, ref) => {
  const containerRef = useRef(null);
  const [effects, setEffects] = useState([]);

  const playEffect = (config) => {
    const {
      effect = 'flash', // 'monochrome', 'flash', 'vignette', 'color-fade'
      duration = 1000,
      intensity = 1.0,
      color = '#000000',
      fadeIn = duration * 0.2,
      hold = duration * 0.6,
      fadeOut = duration * 0.2,
      onComplete = null,
    } = config;

    const id = `effect-${Date.now()}-${Math.random()}`;
    const startTime = performance.now();

    const effectElement = document.createElement('div');
    effectElement.className = `cutscene-overlay cutscene-${effect}`;
    effectElement.id = id;
    effectElement.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 9999;
    `;

    // Effect-specific styling
    switch (effect) {
      case 'monochrome':
        effectElement.style.cssText += `
          background: linear-gradient(rgba(100, 100, 100, ${intensity * 0.7}), rgba(100, 100, 100, ${intensity * 0.7}));
          mix-blend-mode: multiply;
          opacity: 0;
        `;
        break;
      case 'flash':
        effectElement.style.cssText += `
          background: ${color};
          opacity: 0;
        `;
        break;
      case 'vignette':
        effectElement.style.cssText += `
          background: radial-gradient(ellipse at center, transparent 0%, ${color} 100%);
          opacity: 0;
        `;
        break;
      case 'color-fade':
        effectElement.style.cssText += `
          background: ${color};
          opacity: 0;
        `;
        break;
    }

    if (containerRef.current) {
      containerRef.current.appendChild(effectElement);
    }

    setEffects(prev => [...prev, { id, startTime, config }]);

    // Cleanup timer
    const timeoutId = setTimeout(() => {
      setEffects(prev => prev.filter(e => e.id !== id));
      if (effectElement.parentNode) {
        effectElement.parentNode.removeChild(effectElement);
      }
      onComplete?.();
    }, duration + 100);

    return () => {
      clearTimeout(timeoutId);
      if (effectElement.parentNode) {
        effectElement.parentNode.removeChild(effectElement);
      }
      setEffects(prev => prev.filter(e => e.id !== id));
    };
  };

  // Animate effects every frame
  useEffect(() => {
    if (effects.length === 0) return;

    const animateFrame = () => {
      const now = performance.now();

      effects.forEach(({ id, startTime, config }) => {
        const element = document.getElementById(id);
        if (!element) return;

        const elapsed = now - startTime;
        const { duration, fadeIn, hold, fadeOut, intensity } = config;
        let opacity = 0;

        if (elapsed < fadeIn) {
          // Fade in phase
          opacity = (elapsed / fadeIn) * intensity;
        } else if (elapsed < fadeIn + hold) {
          // Hold phase
          opacity = intensity;
        } else {
          // Fade out phase
          const fadeOutElapsed = elapsed - fadeIn - hold;
          opacity = Math.max(0, intensity - (fadeOutElapsed / fadeOut) * intensity);
        }

        element.style.opacity = opacity;
      });

      animationFrameId = requestAnimationFrame(animateFrame);
    };

    let animationFrameId = requestAnimationFrame(animateFrame);
    return () => cancelAnimationFrame(animationFrameId);
  }, [effects]);

  React.useImperativeHandle(ref, () => ({
    playEffect,
  }));

  return <div ref={containerRef} className="cutscene-overlay-container" />;
});

CutsceneOverlay.displayName = 'CutsceneOverlay';

export default CutsceneOverlay;
