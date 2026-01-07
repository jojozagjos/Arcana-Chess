/**
 * 2D Particle Overlay Component
 * Renders tsparticles effects for UI overlays (card draw/use screens)
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Particles from '@tsparticles/react';
import { loadSlim } from '@tsparticles/slim';
import {
  cardDrawPreset,
  cardUsePreset,
  energyRingPreset,
  dissolvePreset,
  confettiPreset,
  rarityColors,
} from './particlePresets.js';

// Track if engine is initialized
let engineInitialized = false;
let initPromise = null;

/**
 * Initialize the tsparticles engine (call once at app startup)
 */
export async function initParticleEngine(engine) {
  if (engineInitialized) return;
  await loadSlim(engine);
  engineInitialized = true;
}

/**
 * 2D Particle Overlay for card animations
 */
export function ParticleOverlay({
  type = 'draw', // 'draw', 'use', 'ring', 'dissolve', 'confetti'
  rarity = 'common',
  active = true,
  style = {},
  density = 1, // 0.5=low, 1=normal, 1.5=high
  onComplete,
}) {
  const [isReady, setIsReady] = useState(engineInitialized);
  const idRef = useRef(`particles-${Math.random().toString(36).slice(2, 9)}`);

  // Get color based on rarity
  const color = rarityColors[rarity]?.primary || rarityColors.common.primary;

  // Select preset based on type (memoized to avoid recreating options each render)
  const baseOptions = useMemo(() => {
    switch (type) {
      case 'draw':
        return cardDrawPreset(color);
      case 'use':
        return cardUsePreset(color);
      case 'ring':
        return energyRingPreset(color);
      case 'dissolve':
        return dissolvePreset(color);
      case 'confetti':
        return confettiPreset();
      default:
        return cardDrawPreset(color);
    }
  }, [type, color]);

  // Apply density scaling to emitter quantities (non-destructive copy)
  const options = useMemo(() => {
    const opt = JSON.parse(JSON.stringify(baseOptions));
    const f = Math.max(0.2, Math.min(3, Number(density) || 1));
    if (Array.isArray(opt.emitters)) {
      opt.emitters.forEach((em) => {
        if (em?.rate && typeof em.rate.quantity === 'number') {
          em.rate.quantity = Math.max(1, Math.round(em.rate.quantity * f));
        }
      });
    }
    return opt;
  }, [baseOptions, density]);

  // Initialize engine on mount
  const particlesInit = useCallback(async (engine) => {
    if (!engineInitialized) {
      if (!initPromise) {
        initPromise = initParticleEngine(engine);
      }
      await initPromise;
      setIsReady(true);
    }
  }, []);

  // Handle particle animation completion
  useEffect(() => {
    if (active && onComplete) {
      // Estimate animation duration based on type
      const durations = {
        draw: 1200,
        use: 800,
        ring: 600,
        dissolve: 1500,
        confetti: 2000,
      };
      const timeout = setTimeout(onComplete, durations[type] || 1000);
      return () => clearTimeout(timeout);
    }
  }, [active, type, onComplete]);

  if (!active) return null;

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1,
        ...style,
      }}
    >
      <Particles
        id={idRef.current}
        init={particlesInit}
        options={options}
        style={{
          position: 'absolute',
          inset: 0,
        }}
      />
    </div>
  );
}

export default ParticleOverlay;
