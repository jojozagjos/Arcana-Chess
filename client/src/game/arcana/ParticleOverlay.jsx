/**
 * 2D Particle Overlay Component
 * Renders tsparticles effects for UI overlays (card draw/use screens)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  onComplete,
}) {
  const [isReady, setIsReady] = useState(engineInitialized);
  const [instanceId] = useState(() => `particles-${type}-${Math.random().toString(36).slice(2)}`);

  // Get color based on rarity
  const color = rarityColors[rarity]?.primary || rarityColors.common.primary;

  // Select preset based on type
  const getOptions = useCallback(() => {
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

  // Memoize options to avoid recreating and remounting the particle system every render
  const options = useMemo(() => getOptions(), [getOptions]);

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
        id={instanceId}
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
