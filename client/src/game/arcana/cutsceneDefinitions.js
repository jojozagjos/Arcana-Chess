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
  duration: 2500,
  config: {
    camera: {
      targetZoom: 1.8,
      duration: 600,
      holdDuration: 1900,
      easing: 'easeInOutCubic',
    },
    overlay: {
      // Red flash when blade falls
      effect: 'flash',
      color: '#ff3333',
      duration: 400,
      intensity: 0.9,
      fadeIn: 150,
      hold: 100,
      fadeOut: 150,
    },
    vfx: {
      // Blade slice + blood explosion
      bladeDuration: 600,
      bloodExplosionDelay: 2000, // After holding for blood impact
      bloodParticles: 48,
      destructionIntensity: 1.2,
    },
    sound: {
      blade: 'arcana:execution_blade',
      impact: 'arcana:execution_blood',
      complete: 'arcana:execution_complete',
    },
    phases: [
      {
        name: 'camera_focus',
        duration: 600,
        actions: ['camera_move', 'sound_blade'],
      },
      {
        name: 'slice',
        duration: 600,
        actions: ['vfx_blade_slice', 'overlay_flash'],
        delay: 200,
      },
      {
        name: 'hold',
        duration: 1300,
        actions: ['sound_impact'],
        delay: 600, // Blood erupts after slice settles
      },
      {
        name: 'explosion',
        duration: 400,
        actions: ['vfx_blood_explosion'],
        delay: 0,
      },
      {
        name: 'camera_return',
        duration: 600,
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
  duration: 3200,
  config: {
    camera: {
      targetZoom: 0.8, // Pull way back and up for full board view
      duration: 800,
      holdDuration: 2000,
      easing: 'easeInOutCubic',
      cameraHeight: 25, // Elevated view of board from above
    },
    overlay: [
      // Fade to monochrome as time stops
      {
        effect: 'monochrome',
        duration: 2000,
        intensity: 1.0,
        fadeIn: 600,
        hold: 800,
        fadeOut: 600,
        phase: 'rewind',
      },
      // Color rush back in
      {
        effect: 'color-burst',
        color: '#2ecc71',
        duration: 600,
        intensity: 0.8,
        fadeIn: 0,
        hold: 0,
        fadeOut: 600,
        phase: 'restore',
      },
    ],
    vfx: {
      // Afterimages as pieces rewind
      afterimageTrails: true,
      afterimageCount: 8,
      trailColor: '#3498db',
      trailOpacity: 0.6,
      rewindParticles: 64,
      glowColor: '#3498db',
      glowIntensity: 0.7,
    },
    sound: {
      timewarp: 'arcana:time_travel_warp',
      rewind: 'arcana:time_travel_rewind',
      complete: 'arcana:time_travel_complete',
    },
    phases: [
      {
        name: 'camera_ascend',
        duration: 800,
        actions: ['camera_move', 'sound_timewarp'],
      },
      {
        name: 'rewind_pieces',
        duration: 1600,
        actions: [
          'vfx_afterimage_trails',
          'vfx_rewind_animation',
          'overlay_monochrome',
          'sound_rewind',
        ],
        delay: 400, // Pieces start rewinding as camera settles
      },
      {
        name: 'color_restore',
        duration: 800,
        actions: ['overlay_color_restore'],
        delay: 0,
      },
      {
        name: 'camera_return',
        duration: 800,
        actions: ['sound_complete'],
      },
    ],
  },
};

export const divineInterventionCutscene = {
  id: 'divine_intervention',
  duration: 2500,
  config: {
    camera: {
      targetZoom: 2.0,
      duration: 700,
      holdDuration: 1800,
      easing: 'easeOutCubic',
    },
    overlay: {
      // Golden heavenly light burst
      effect: 'flash',
      color: '#ffd700',
      duration: 1000,
      intensity: 0.8,
      fadeIn: 300,
      hold: 400,
      fadeOut: 300,
    },
    vfx: {
      // Pawn falling from heaven with radiant light
      pawnDescent: true,
      descentDuration: 1200,
      glowColor: '#ffd700',
      glowIntensity: 1.1,
      heavenParticles: 48,
      lightBeamIntensity: 0.9,
    },
    sound: {
      divine: 'arcana:divine_intervention_divine',
      descent: 'arcana:divine_intervention_descent',
      impact: 'arcana:divine_intervention_impact',
      complete: 'arcana:divine_intervention_complete',
    },
    phases: [
      {
        name: 'camera_focus',
        duration: 700,
        actions: ['camera_move', 'sound_divine'],
      },
      {
        name: 'descent',
        duration: 1200,
        actions: ['vfx_pawn_descent', 'vfx_heaven_particles', 'vfx_light_beam', 'overlay_heaven_flash', 'sound_descent'],
        delay: 300,
      },
      {
        name: 'impact',
        duration: 600,
        actions: ['sound_impact'],
        delay: 0,
      },
      {
        name: 'camera_return',
        duration: 700,
        actions: ['sound_complete'],
      },
    ],
  },
};

export const mindControlCutscene = {
  id: 'mind_control',
  duration: 1200,
  config: {
    camera: {
      // No camera movement for mind control - player controls piece on their side
      doNotMove: true,
    },
    overlay: {
      // Purple vignette for opponent during control
      effect: 'vignette',
      color: '#9c27b0',
      duration: 1200,
      intensity: 0.6,
      fadeIn: 300,
      hold: 600,
      fadeOut: 300,
    },
    vfx: {
      // Purple aura around controlled piece
      auraColor: '#9c27b0',
      auraIntensity: 0.9,
      auraDuration: 1200,
      controlParticles: 24,
      pulseEffect: true,
    },
    sound: {
      control: 'arcana:mind_control_take',
      release: 'arcana:mind_control_release',
    },
    phases: [
      {
        name: 'control_activate',
        duration: 600,
        actions: ['vfx_purple_aura', 'overlay_vignette', 'sound_control'],
        delay: 0,
      },
      {
        name: 'control_active',
        duration: 600,
        actions: [],
        delay: 0,
      },
    ],
  },
};

export const astralRebirthCutscene = {
  id: 'astral_rebirth',
  duration: 2200,
  config: {
    camera: {
      targetZoom: 1.6,
      duration: 600,
      holdDuration: 1600,
      easing: 'easeInOutCubic',
    },
    overlay: {
      // Faint yellow flash for astral energy
      effect: 'flash',
      color: '#ffeb3b',
      duration: 1200,
      intensity: 0.5,
      fadeIn: 300,
      hold: 600,
      fadeOut: 300,
    },
    vfx: {
      // Rich astral particles + golden glow
      astralParticles: 64,
      glowColor: '#ffeb3b',
      glowIntensity: 1.2,
      materializeDuration: 1000,
      spiralEffect: true,
    },
    sound: {
      materialize: 'arcana:astral_rebirth_materialize',
      glow: 'arcana:astral_rebirth_energy',
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
        actions: ['vfx_astral_particles', 'vfx_spiral_glow', 'overlay_yellow_flash', 'sound_glow'],
        delay: 200,
      },
      {
        name: 'hold',
        duration: 600,
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

export const promotionRitualCutscene = {
  id: 'promotion_ritual',
  duration: 2200,
  config: {
    camera: {
      targetZoom: 1.5,
      duration: 600,
      holdDuration: 1600,
      easing: 'easeInOutCubic',
    },
    overlay: {
      // "Za Warudo" effect - monochrome time stop
      effect: 'monochrome',
      duration: 2200,
      intensity: 0.9,
      fadeIn: 400,
      hold: 1400,
      fadeOut: 400,
    },
    vfx: {
      // Divine light beam striking pawn
      lightBeam: true,
      beamDuration: 800,
      beamColor: '#ffeb3b',
      beamIntensity: 1.3,
      promotionFlash: true,
      promotionParticles: 40,
      glowColor: '#ffeb3b',
      glowIntensity: 1.2,
    },
    sound: {
      lightImpact: 'arcana:promotion_ritual_light',
      transform: 'arcana:promotion_ritual_transform',
      complete: 'arcana:promotion_ritual_complete',
    },
    phases: [
      {
        name: 'camera_focus',
        duration: 600,
        actions: ['camera_move'],
      },
      {
        name: 'light_strike',
        duration: 800,
        actions: ['vfx_light_beam', 'overlay_monochrome', 'sound_light_impact'],
        delay: 200,
      },
      {
        name: 'promotion',
        duration: 600,
        actions: ['vfx_promotion_flash', 'vfx_promotion_glow', 'sound_transform'],
        delay: 0,
      },
      {
        name: 'hold',
        duration: 800,
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
    promotion_ritual: promotionRitualCutscene,
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
