/**
 * Cutscene Effect Definitions
 * 
 * Standard implementations for gold-standard cutscene cards:
 * - Execution: Guillotine fall + FOV pulse + piece destruction
 * - Time Freeze: Monochrome overlay + freeze effect
 * - Time Travel: Reverse animation + color restoration
 * - Divine Intervention: Pawn spawn + light burst
 * - Mind Control: Color flash + mind control aura
 * - Astral Rebirth: Piece materializes + glow effect
 */

export const executionCutscene = {
  id: 'execution',
  duration: 1800,
  config: {
    camera: {
      targetZoom: 1.8,
      duration: 800,
      holdDuration: 1000,
      easing: 'easeInOutCubic',
    },
    overlay: {
      // Screen flash on execution
      effect: 'flash',
      color: '#ff6b6b',
      duration: 300,
      intensity: 0.8,
      fadeIn: 100,
      hold: 100,
      fadeOut: 100,
    },
    vfx: {
      // Guillotine visual + piece destruction
      guillotineDuration: 600,
      destructionParticles: 24,
      destructionIntensity: 1.0,
    },
    sound: {
      guillotine: 'arcana:execution_guillotine',
      destroy: 'arcana:execution_destroy',
      complete: 'arcana:execution_complete',
    },
    phases: [
      // Phase 1: Camera moves to target (0-800ms)
      {
        name: 'camera_focus',
        duration: 800,
        actions: ['camera_move', 'sound_guillotine'],
      },
      // Phase 2: Hold on target (800-1800ms)
      {
        name: 'execution',
        duration: 1000,
        actions: ['vfx_guillotine', 'vfx_destruction', 'overlay_flash', 'sound_destroy'],
        delay: 400, // Guillotine falls after camera settles
      },
      // Phase 3: Return (implicit)
      {
        name: 'camera_return',
        duration: 800,
        actions: ['sound_complete'],
      },
    ],
  },
};

export const timeFrozenCutscene = {
  id: 'time_freeze',
  duration: 2000,
  config: {
    camera: {
      targetZoom: 1.3,
      duration: 400,
      holdDuration: 1800,
      easing: 'easeInOutCubic',
    },
    overlay: {
      // Monochrome effect for frozen state
      effect: 'monochrome',
      duration: 2000,
      intensity: 0.85,
      fadeIn: 400,
      hold: 1200,
      fadeOut: 400,
    },
    vfx: {
      // Subtle ice particle effect
      snowParticles: 32,
      particleVelocity: 0.5,
      glow: true,
      glowColor: '#4db8ff',
      glowIntensity: 0.6,
    },
    sound: {
      freeze: 'arcana:time_freeze_freeze',
      ambient: 'arcana:time_freeze_ambient', // Continuous during hold
      unfreeze: 'arcana:time_freeze_unfreeze',
    },
    phases: [
      {
        name: 'camera_focus',
        duration: 400,
        actions: ['camera_move', 'sound_freeze'],
      },
      {
        name: 'frozen_state',
        duration: 1200,
        actions: ['vfx_particles', 'overlay_monochrome', 'sound_ambient_loop'],
        delay: 0,
      },
      {
        name: 'camera_return',
        duration: 800,
        actions: ['sound_unfreeze'],
      },
    ],
  },
};

export const timeTravelCutscene = {
  id: 'time_travel',
  duration: 2500,
  config: {
    camera: {
      targetZoom: 1.5,
      duration: 600,
      holdDuration: 1300,
      easing: 'easeInOutCubic',
    },
    overlay: [
      // Fade to monochrome (color drains)
      {
        effect: 'color-fade',
        color: '#2c3e50',
        duration: 600,
        intensity: 0.9,
        fadeIn: 200,
        hold: 200,
        fadeOut: 200,
        phase: 'rewind',
      },
      // Hold monochrome while rewinding
      {
        effect: 'monochrome',
        duration: 1000,
        intensity: 1.0,
        fadeIn: 0,
        hold: 1000,
        fadeOut: 0,
        phase: 'rewound',
      },
      // Fade back to color
      {
        effect: 'color-fade',
        color: '#2ecc71',
        duration: 600,
        intensity: 0.7,
        fadeIn: 0,
        hold: 0,
        fadeOut: 600,
        phase: 'return',
      },
    ],
    vfx: {
      // Reverse animation trails
      rewindParticles: 48,
      rewindTrail: true,
      glowColor: '#3498db',
      glowIntensity: 0.8,
    },
    sound: {
      rewind: 'arcana:time_travel_rewind',
      ambient: 'arcana:time_travel_ambient',
      complete: 'arcana:time_travel_complete',
    },
    phases: [
      {
        name: 'camera_focus',
        duration: 600,
        actions: ['camera_move', 'sound_rewind'],
      },
      {
        name: 'rewind',
        duration: 600,
        actions: [
          'vfx_rewind_trails',
          'overlay_monochrome_fade',
          'sound_ambient_loop',
          'move_reverse_animation', // Special: animate pieces in reverse
        ],
        delay: 200,
      },
      {
        name: 'rewound',
        duration: 700,
        actions: ['sound_ambient_continue'],
      },
      {
        name: 'camera_return',
        duration: 800,
        actions: ['overlay_color_restore', 'sound_complete'],
      },
    ],
  },
};

export const divineInterventionCutscene = {
  id: 'divine_intervention',
  duration: 2200,
  config: {
    camera: {
      targetZoom: 2.0,
      duration: 800,
      holdDuration: 1400,
      easing: 'easeOutCubic',
    },
    overlay: {
      // Golden light burst
      effect: 'flash',
      color: '#ffd700',
      duration: 800,
      intensity: 0.9,
      fadeIn: 200,
      hold: 400,
      fadeOut: 200,
    },
    vfx: {
      // Angelic glow + pawn spawn
      pawnSpawnParticles: 32,
      glowColor: '#ffeb3b',
      glowIntensity: 1.0,
      haloEffect: true,
    },
    sound: {
      divine: 'arcana:divine_intervention_divine',
      spawn: 'arcana:divine_intervention_spawn',
      complete: 'arcana:divine_intervention_complete',
    },
    phases: [
      {
        name: 'camera_focus',
        duration: 800,
        actions: ['camera_move', 'sound_divine'],
      },
      {
        name: 'spawn',
        duration: 600,
        actions: ['vfx_spawn_particles', 'overlay_divine_flash', 'sound_spawn'],
        delay: 400,
      },
      {
        name: 'hold',
        duration: 800,
        actions: [],
      },
      {
        name: 'camera_return',
        duration: 800,
        actions: ['sound_complete'],
      },
    ],
  },
};

export const mindControlCutscene = {
  id: 'mind_control',
  duration: 1500,
  config: {
    camera: {
      targetZoom: 1.4,
      duration: 600,
      holdDuration: 900,
      easing: 'easeInOutCubic',
    },
    overlay: {
      // Purple mind control flash
      effect: 'flash',
      color: '#9c27b0',
      duration: 1000,
      intensity: 0.7,
      fadeIn: 200,
      hold: 600,
      fadeOut: 200,
    },
    vfx: {
      // Mind control aura around piece
      auraDuration: 1500,
      auraColor: '#9c27b0',
      auraIntensity: 0.8,
      controlParticles: 16,
    },
    sound: {
      control: 'arcana:mind_control_take',
      ambient: 'arcana:mind_control_ambient',
      complete: 'arcana:mind_control_release',
    },
    phases: [
      {
        name: 'camera_focus',
        duration: 600,
        actions: ['camera_move', 'sound_control'],
      },
      {
        name: 'control',
        duration: 600,
        actions: ['vfx_mind_aura', 'overlay_mind_flash', 'sound_ambient'],
        delay: 200,
      },
      {
        name: 'hold',
        duration: 300,
        actions: [],
      },
      {
        name: 'camera_return',
        duration: 600,
        actions: ['sound_complete'],
      },
    ],
  },
};

export const astralRebirthCutscene = {
  id: 'astral_rebirth',
  duration: 2000,
  config: {
    camera: {
      targetZoom: 1.6,
      duration: 600,
      holdDuration: 1400,
      easing: 'easeInOutCubic',
    },
    overlay: {
      // Subtle cyan glow
      effect: 'color-fade',
      color: '#00bcd4',
      duration: 1800,
      intensity: 0.6,
      fadeIn: 400,
      hold: 1000,
      fadeOut: 400,
    },
    vfx: {
      // Piece materializes with glow
      materializeDuration: 1000,
      glowColor: '#00bcd4',
      glowIntensity: 0.9,
      rebornParticles: 32,
    },
    sound: {
      materialize: 'arcana:astral_rebirth_materialize',
      glow: 'arcana:astral_rebirth_glow',
      complete: 'arcana:astral_rebirth_complete',
    },
    phases: [
      {
        name: 'camera_focus',
        duration: 600,
        actions: ['camera_move', 'sound_materialize'],
      },
      {
        name: 'materialize',
        duration: 1000,
        actions: ['vfx_materialize', 'vfx_glow_particles', 'overlay_astral_glow', 'sound_glow'],
        delay: 200,
      },
      {
        name: 'hold',
        duration: 400,
        actions: [],
      },
      {
        name: 'camera_return',
        duration: 600,
        actions: ['sound_complete'],
      },
    ],
  },
};

/**
 * Get cutscene config by card ID
 */
export function getCutsceneConfig(cardId) {
  const configs = {
    execution: executionCutscene,
    time_freeze: timeFrozenCutscene,
    time_travel: timeTravelCutscene,
    divine_intervention: divineInterventionCutscene,
    mind_control: mindControlCutscene,
    astral_rebirth: astralRebirthCutscene,
  };
  return configs[cardId];
}

/**
 * Validate cutscene config structure
 */
export function validateCutsceneConfig(config) {
  const required = ['id', 'duration', 'config'];
  const configRequired = ['camera', 'vfx', 'sound', 'phases'];
  
  const missing = required.filter(key => !config[key]);
  const configMissing = configRequired.filter(key => !config.config[key]);
  
  if (missing.length > 0) {
    console.warn(`Cutscene config missing: ${missing.join(', ')}`);
    return false;
  }
  if (configMissing.length > 0) {
    console.warn(`Cutscene.config missing: ${configMissing.join(', ')}`);
    return false;
  }
  
  return true;
}
