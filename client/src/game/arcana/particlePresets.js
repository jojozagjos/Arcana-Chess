/**
 * 2D Particle Presets for UI Overlays (tsparticles)
 * Used for card draw/use animations in the overlay screens
 */

// ============================================================================
// TSPARTICLES PRESET CONFIGURATIONS
// ============================================================================

/**
 * Card draw effect - celebratory sparkles and energy
 */
export const cardDrawPreset = (color = '#88c0d0') => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 60,
  particles: {
    number: {
      value: 0, // Start with none, emit via emitter
    },
    color: {
      value: [color, '#ffffff', '#e1f5fe'],
    },
    shape: {
      type: ['circle', 'star'],
    },
    opacity: {
      value: { min: 0.4, max: 1 },
      animation: {
        enable: true,
        speed: 1,
        minimumValue: 0,
        sync: false,
        destroy: 'min',
      },
    },
    size: {
      value: { min: 2, max: 6 },
      animation: {
        enable: true,
        speed: 3,
        minimumValue: 0.5,
        sync: false,
      },
    },
    move: {
      enable: true,
      speed: { min: 2, max: 6 },
      direction: 'none',
      random: true,
      straight: false,
      outModes: { default: 'destroy' },
      gravity: {
        enable: true,
        acceleration: 2,
      },
    },
    life: {
      duration: { value: 2 },
      count: 1,
    },
  },
  emitters: [
    {
      direction: 'top',
      position: { x: 50, y: 60 },
      rate: { quantity: 8, delay: 0.05 },
      life: { duration: 0.4, count: 1 },
      size: { width: 60, height: 10 },
      particles: {
        move: {
          speed: { min: 8, max: 15 },
          direction: 'top',
          outModes: { default: 'destroy' },
        },
      },
    },
  ],
});

/**
 * Card use effect - radial burst with energy waves
 */
export const cardUsePreset = (color = '#88c0d0') => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 60,
  particles: {
    number: { value: 0 },
    color: {
      value: [color, '#ffffff'],
    },
    shape: {
      type: 'circle',
    },
    opacity: {
      value: 1,
      animation: {
        enable: true,
        speed: 2,
        minimumValue: 0,
        sync: false,
        destroy: 'min',
      },
    },
    size: {
      value: { min: 3, max: 8 },
      animation: {
        enable: true,
        speed: 5,
        minimumValue: 0,
        sync: false,
        destroy: 'min',
      },
    },
    move: {
      enable: true,
      speed: { min: 5, max: 12 },
      direction: 'outside',
      random: false,
      straight: false,
      outModes: { default: 'destroy' },
    },
    life: {
      duration: { value: 0.8 },
      count: 1,
    },
  },
  emitters: [
    {
      direction: 'none',
      position: { x: 50, y: 45 },
      rate: { quantity: 30, delay: 0 },
      life: { duration: 0.1, count: 1 },
      size: { width: 0, height: 0 },
      particles: {
        move: {
          direction: 'outside',
          speed: { min: 8, max: 20 },
        },
      },
    },
  ],
});

/**
 * Energy ring effect - expanding circular wave
 */
export const energyRingPreset = (color = '#88c0d0') => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 60,
  particles: {
    number: { value: 0 },
    color: { value: color },
    shape: { type: 'circle' },
    opacity: {
      value: 0.8,
      animation: {
        enable: true,
        speed: 1.5,
        minimumValue: 0,
        sync: false,
        destroy: 'min',
      },
    },
    size: {
      value: { min: 2, max: 4 },
    },
    move: {
      enable: true,
      speed: 15,
      direction: 'outside',
      outModes: { default: 'destroy' },
    },
    life: {
      duration: { value: 0.6 },
      count: 1,
    },
  },
  emitters: [
    {
      direction: 'none',
      position: { x: 50, y: 45 },
      rate: { quantity: 60, delay: 0 },
      life: { duration: 0.05, count: 3, delay: 0.15 },
      size: { width: 0, height: 0 },
    },
  ],
});

/**
 * Sparkle confetti - celebratory effect
 */
export const confettiPreset = (colors = ['#88c0d0', '#ffd54f', '#ce93d8', '#a3be8c']) => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 60,
  particles: {
    number: { value: 0 },
    color: { value: colors },
    shape: {
      type: ['circle', 'square', 'star'],
    },
    opacity: {
      value: { min: 0.6, max: 1 },
      animation: {
        enable: true,
        speed: 0.5,
        minimumValue: 0,
        sync: false,
      },
    },
    size: {
      value: { min: 3, max: 7 },
    },
    rotate: {
      value: { min: 0, max: 360 },
      direction: 'random',
      animation: {
        enable: true,
        speed: 30,
      },
    },
    move: {
      enable: true,
      speed: { min: 3, max: 8 },
      direction: 'top',
      random: true,
      straight: false,
      outModes: { default: 'destroy' },
      gravity: {
        enable: true,
        acceleration: 5,
      },
    },
    life: {
      duration: { value: 3 },
      count: 1,
    },
    tilt: {
      enable: true,
      value: { min: 0, max: 360 },
      animation: { enable: true, speed: 30 },
    },
    wobble: {
      enable: true,
      distance: 20,
      speed: 10,
    },
  },
  emitters: [
    {
      direction: 'top',
      position: { x: 50, y: 100 },
      rate: { quantity: 5, delay: 0.1 },
      life: { duration: 0.5, count: 1 },
      size: { width: 100, height: 0 },
    },
  ],
});

/**
 * Magic dust - subtle ambient particles
 */
export const magicDustPreset = (color = '#88c0d0') => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 60,
  particles: {
    number: { value: 30 },
    color: { value: [color, '#ffffff'] },
    shape: { type: 'circle' },
    opacity: {
      value: { min: 0.1, max: 0.5 },
      animation: {
        enable: true,
        speed: 0.5,
        minimumValue: 0.1,
        sync: false,
      },
    },
    size: {
      value: { min: 1, max: 3 },
      animation: {
        enable: true,
        speed: 1,
        minimumValue: 0.5,
        sync: false,
      },
    },
    move: {
      enable: true,
      speed: 0.5,
      direction: 'none',
      random: true,
      straight: false,
      outModes: { default: 'bounce' },
    },
    twinkle: {
      particles: {
        enable: true,
        frequency: 0.05,
        opacity: 1,
      },
    },
  },
});

/**
 * Dissolve effect - particles scatter and fade
 */
export const dissolvePreset = (color = '#88c0d0') => ({
  fullScreen: false,
  background: { color: { value: 'transparent' } },
  fpsLimit: 60,
  particles: {
    number: { value: 0 },
    color: { value: [color, '#ffffff'] },
    shape: { type: 'circle' },
    opacity: {
      value: 1,
      animation: {
        enable: true,
        speed: 1,
        minimumValue: 0,
        sync: false,
        destroy: 'min',
      },
    },
    size: {
      value: { min: 2, max: 6 },
      animation: {
        enable: true,
        speed: 3,
        minimumValue: 0,
        sync: false,
        destroy: 'min',
      },
    },
    move: {
      enable: true,
      speed: { min: 2, max: 8 },
      direction: 'outside',
      random: true,
      straight: false,
      outModes: { default: 'destroy' },
    },
    life: {
      duration: { value: 1.5 },
      count: 1,
    },
  },
  emitters: [
    {
      direction: 'none',
      position: { x: 50, y: 45 },
      rate: { quantity: 50, delay: 0 },
      life: { duration: 0.2, count: 1 },
      size: { width: 80, height: 100 },
    },
  ],
});

// ============================================================================
// RARITY-BASED COLORS
// ============================================================================

export const rarityColors = {
  common: {
    primary: '#c8c8c8',
    secondary: '#e0e0e0',
    glow: 'rgba(200, 200, 200, 0.8)',
  },
  uncommon: {
    primary: '#4caf50',
    secondary: '#81c784',
    glow: 'rgba(76, 175, 80, 0.8)',
  },
  rare: {
    primary: '#2196f3',
    secondary: '#64b5f6',
    glow: 'rgba(33, 150, 243, 0.8)',
  },
  epic: {
    primary: '#9c27b0',
    secondary: '#ba68c8',
    glow: 'rgba(156, 39, 176, 0.8)',
  },
  legendary: {
    primary: '#ffc107',
    secondary: '#ffd54f',
    glow: 'rgba(255, 193, 7, 0.9)',
  },
};

/**
 * Get particle preset based on card rarity
 */
export function getCardDrawPreset(rarity = 'common') {
  const colors = rarityColors[rarity] || rarityColors.common;
  return cardDrawPreset(colors.primary);
}

export function getCardUsePreset(rarity = 'common') {
  const colors = rarityColors[rarity] || rarityColors.common;
  return cardUsePreset(colors.primary);
}

export function getEnergyRingPreset(rarity = 'common') {
  const colors = rarityColors[rarity] || rarityColors.common;
  return energyRingPreset(colors.primary);
}

export default {
  cardDrawPreset,
  cardUsePreset,
  energyRingPreset,
  confettiPreset,
  magicDustPreset,
  dissolvePreset,
  rarityColors,
  getCardDrawPreset,
  getCardUsePreset,
  getEnergyRingPreset,
};
