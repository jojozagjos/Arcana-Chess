/**
 * 2D Particle Overlay Component
 * Renders tsparticles effects for UI overlays (card draw/use screens)
 */

import React, { useCallback, useEffect, useState } from 'react';
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
        id={`particles-${type}-${Date.now()}`}
        init={particlesInit}
        options={getOptions()}
        style={{
          position: 'absolute',
          inset: 0,
        }}
      />
    </div>
  );
}

/**
 * Card Draw Particles - sparkles and rising energy
 */
export function CardDrawParticles({ rarity = 'common', active = true, onComplete }) {
  return (
    <ParticleOverlay
      type="draw"
      rarity={rarity}
      active={active}
      onComplete={onComplete}
    />
  );
}

/**
 * Card Use Particles - radial burst effect
 */
export function CardUseParticles({ rarity = 'common', active = true, onComplete }) {
  return (
    <ParticleOverlay
      type="use"
      rarity={rarity}
      active={active}
      onComplete={onComplete}
    />
  );
}

/**
 * Energy Ring Particles - expanding wave effect
 */
export function EnergyRingParticles({ rarity = 'common', active = true, onComplete }) {
  return (
    <ParticleOverlay
      type="ring"
      rarity={rarity}
      active={active}
      onComplete={onComplete}
    />
  );
}

/**
 * Dissolve Particles - scatter and fade effect
 */
export function DissolveParticles({ rarity = 'common', active = true, onComplete }) {
  return (
    <ParticleOverlay
      type="dissolve"
      rarity={rarity}
      active={active}
      onComplete={onComplete}
    />
  );
}

/**
 * Confetti Particles - celebration effect
 */
export function ConfettiParticles({ active = true, onComplete }) {
  return (
    <ParticleOverlay
      type="confetti"
      active={active}
      onComplete={onComplete}
    />
  );
}

export default ParticleOverlay;
