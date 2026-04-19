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

import { legacyCutsceneToArcanaStudioCard as cutsceneConfigToArcanaStudioCard, arcanaStudioCardToLegacyCutscene as arcanaStudioCardToCutsceneConfig } from './studio/arcanaStudioBridge.js';
import { ARCANA_DEFINITIONS } from '../arcanaDefinitions.js';
import { migrateArcanaStudioCard } from './studio/arcanaStudioSchema.js';
import { STUDIO_CARD_OVERRIDES } from '../../../../shared/arcana/studio/studioCutsceneOverrides.js';

export const executionCutscene = {
  id: 'execution',
  duration: 3900,
  config: {
    camera: {
      targetZoom: 1.8,
      duration: 600,
      holdDuration: 1900,
      easing: 'easeInOutCubic',
      shots: [
        { zoom: 2.55, duration: 260, holdDuration: 220, returnDuration: 220, offset: [2.3, 2.2, 0.5], lookAtYOffset: 0.38 },
        { zoom: 2.2, duration: 300, holdDuration: 260, returnDuration: 240, offset: [-2.2, 2.5, -0.7], lookAtYOffset: 0.25 },
        { zoom: 2.75, duration: 220, holdDuration: 260, returnDuration: 220, offset: [0.0, 3.5, 0.0], lookAtYOffset: 0.15 },
      ],
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
  duration: 4300,
  config: {
    camera: {
      targetZoom: 1.3,
      duration: 400,
      holdDuration: 1800,
      easing: 'easeInOutCubic',
      shots: [
        { zoom: 1.45, duration: 520, holdDuration: 620, returnDuration: 500, offset: [3.4, 5.0, 3.1], lookAtYOffset: 0.12 },
        { zoom: 1.15, duration: 560, holdDuration: 760, returnDuration: 520, offset: [0.2, 6.1, 0.3], lookAtYOffset: 0.08 },
        { zoom: 1.35, duration: 460, holdDuration: 520, returnDuration: 460, offset: [-3.0, 4.7, -2.7], lookAtYOffset: 0.12 },
      ],
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
  duration: 6100,
  config: {
    camera: {
      targetZoom: 0.8, // Pull way back and up for full board view
      duration: 800,
      holdDuration: 2000,
      easing: 'easeInOutCubic',
      cameraHeight: 25, // Elevated view of board from above
      shots: [
        { zoom: 1.18, duration: 420, holdDuration: 340, returnDuration: 380, offset: [5.0, 6.2, 3.9], lookAtYOffset: 0.1 },
        { zoom: 0.98, duration: 520, holdDuration: 520, returnDuration: 420, offset: [-4.7, 6.0, -4.3], lookAtYOffset: 0.1 },
        { zoom: 0.82, duration: 600, holdDuration: 860, returnDuration: 540, offset: [0.1, 8.6, 0.2], lookAtYOffset: 0.05 },
        { zoom: 1.08, duration: 420, holdDuration: 420, returnDuration: 360, offset: [3.6, 6.0, -4.0], lookAtYOffset: 0.1 },
      ],
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
  duration: 5200,
  config: {
    camera: {
      targetZoom: 2.0,
      duration: 700,
      holdDuration: 1800,
      easing: 'easeOutCubic',
      shots: [
        { zoom: 2.2, duration: 360, holdDuration: 300, returnDuration: 320, offset: [2.3, 3.8, 2.2], lookAtYOffset: 0.42 },
        { zoom: 2.0, duration: 420, holdDuration: 420, returnDuration: 360, offset: [-2.4, 3.7, -2.3], lookAtYOffset: 0.38 },
        { zoom: 1.75, duration: 520, holdDuration: 620, returnDuration: 420, offset: [0.0, 6.4, 0.0], lookAtYOffset: 0.56 },
        { zoom: 2.35, duration: 360, holdDuration: 380, returnDuration: 320, offset: [2.8, 4.0, -1.6], lookAtYOffset: 0.34 },
      ],
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
  duration: 3400,
  config: {
    camera: {
      targetZoom: 2.2,
      duration: 320,
      holdDuration: 1200,
      easing: 'easeInOutCubic',
      shots: [
        { zoom: 2.65, duration: 220, holdDuration: 200, returnDuration: 220, offset: [1.2, 2.2, 0.8], lookAtYOffset: 0.28 },
        { zoom: 2.45, duration: 260, holdDuration: 260, returnDuration: 220, offset: [-1.1, 2.3, -0.7], lookAtYOffset: 0.28 },
        { zoom: 2.7, duration: 220, holdDuration: 240, returnDuration: 220, offset: [0.2, 2.6, 0.0], lookAtYOffset: 0.32 },
      ],
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
  duration: 4700,
  config: {
    camera: {
      targetZoom: 1.6,
      duration: 600,
      holdDuration: 1600,
      easing: 'easeInOutCubic',
      shots: [
        { zoom: 1.95, duration: 380, holdDuration: 320, returnDuration: 320, offset: [2.5, 3.3, 1.9], lookAtYOffset: 0.34 },
        { zoom: 1.7, duration: 460, holdDuration: 520, returnDuration: 380, offset: [-2.3, 3.5, -1.8], lookAtYOffset: 0.3 },
        { zoom: 1.45, duration: 520, holdDuration: 680, returnDuration: 460, offset: [0.0, 5.2, 0.1], lookAtYOffset: 0.28 },
      ],
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
  duration: 5000,
  config: {
    camera: {
      targetZoom: 1.5,
      duration: 600,
      holdDuration: 1600,
      easing: 'easeInOutCubic',
      shots: [
        { zoom: 2.05, duration: 340, holdDuration: 280, returnDuration: 300, offset: [2.0, 3.6, 1.0], lookAtYOffset: 0.38 },
        { zoom: 1.65, duration: 520, holdDuration: 520, returnDuration: 420, offset: [0.0, 6.2, 0.0], lookAtYOffset: 0.3 },
        { zoom: 1.9, duration: 420, holdDuration: 460, returnDuration: 360, offset: [-2.4, 3.8, -1.3], lookAtYOffset: 0.34 },
        { zoom: 2.2, duration: 320, holdDuration: 300, returnDuration: 300, offset: [1.7, 4.2, -1.8], lookAtYOffset: 0.24 },
      ],
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

export const breakingPointCutscene = {
  id: 'breaking_point',
  duration: 6200,
  config: {
    camera: {
      targetZoom: 2.05,
      duration: 1000,
      holdDuration: 3600,
      easing: 'easeInOutCubic',
      shots: [
        {
          anchor: 'target',
          zoom: 2.2,
          duration: 520,
          holdDuration: 460,
          returnDuration: 420,
          offset: [2.8, 3.1, 1.5],
          lookAtYOffset: 0.2,
        },
        {
          anchor: 'displaced1',
          zoom: 1.95,
          duration: 560,
          holdDuration: 640,
          returnDuration: 460,
          offset: [-2.4, 2.9, -1.2],
          lookAtYOffset: 0.16,
        },
        {
          anchor: 'displaced2',
          zoom: 2.35,
          duration: 420,
          holdDuration: 520,
          returnDuration: 420,
          offset: [0.4, 4.1, 0.1],
          lookAtYOffset: 0.08,
        },
      ],
    },
    overlay: [
      {
        effect: 'monochrome',
        duration: 2200,
        intensity: 0.92,
        fadeIn: 420,
        hold: 1280,
        fadeOut: 500,
        phase: 'pressure_rise',
      },
      {
        effect: 'flash',
        color: '#ff2a2a',
        duration: 1500,
        intensity: 1.0,
        fadeIn: 260,
        hold: 640,
        fadeOut: 600,
        phase: 'rupture',
      },
      {
        effect: 'color-fade',
        color: '#9be7ff',
        duration: 1200,
        intensity: 0.75,
        fadeIn: 120,
        hold: 220,
        fadeOut: 860,
        phase: 'aftershock',
      },
    ],
    vfx: {
      psychicPressure: true,
      pressureRings: 8,
      pressureColor: '#ff4d4d',
      fractureBolts: 44,
      fractureColor: '#8de3ff',
      shardBurst: 156,
      ripplePasses: 4,
      aftershockDuration: 1900,
      mobStyleStressLines: true,
    },
    sound: {
      buildup: 'arcana:breaking_point_buildup',
      rupture: 'arcana:breaking_point_rupture',
      collapse: 'arcana:breaking_point_collapse',
      resolve: 'arcana:breaking_point_resolve',
    },
    phases: [
      {
        name: 'camera_lock',
        duration: 1000,
        actions: ['camera_move', 'sound_buildup'],
      },
      {
        name: 'pressure_rise',
        duration: 1500,
        actions: ['overlay_monochrome', 'vfx_psychic_pressure'],
        delay: 0,
      },
      {
        name: 'rupture',
        duration: 1100,
        actions: ['vfx_fracture_bolts', 'vfx_shard_burst', 'overlay_flash', 'sound_rupture'],
        delay: 100,
      },
      {
        name: 'aftershock',
        duration: 1400,
        actions: ['vfx_aftershock_ripples', 'sound_collapse'],
        delay: 0,
      },
      {
        name: 'camera_return',
        duration: 1000,
        actions: ['overlay_color_restore', 'sound_resolve'],
      },
    ],
  },
};

export const edgerunnerOverdriveCutscene = {
  id: 'edgerunner_overdrive',
  duration: 5200,
  config: {
    camera: {
      targetZoom: 2.1,
      duration: 700,
      holdDuration: 2600,
      easing: 'easeInOutCubic',
      shots: [
        {
          anchor: 'target',
          zoom: 2.6,
          duration: 300,
          holdDuration: 260,
          returnDuration: 250,
          offset: [2.2, 2.1, 0.6],
          lookAtYOffset: 0.36,
        },
        {
          anchor: 'dash1',
          zoom: 2.1,
          duration: 340,
          holdDuration: 320,
          returnDuration: 300,
          offset: [-2.1, 2.4, -1.1],
          lookAtYOffset: 0.26,
        },
        {
          anchor: 'dash2',
          zoom: 2.45,
          duration: 300,
          holdDuration: 280,
          returnDuration: 260,
          offset: [0.2, 3.4, 2.2],
          lookAtYOffset: 0.24,
        },
        {
          anchor: 'dash3',
          zoom: 2.75,
          duration: 280,
          holdDuration: 240,
          returnDuration: 240,
          offset: [-0.4, 3.2, -2.1],
          lookAtYOffset: 0.22,
        },
      ],
    },
    overlay: [
      {
        effect: 'color-fade',
        color: '#30ff71',
        duration: 2600,
        intensity: 0.98,
        fadeIn: 150,
        hold: 1800,
        fadeOut: 650,
        phase: 'overdrive',
      },
    ],
    vfx: {
      greenOverlay: true,
      afterimages: 14,
    },
    sound: {
      activation: 'arcana:edgerunner_overdrive_activation',
      rush: 'arcana:edgerunner_overdrive_rush',
      hitstop: 'arcana:edgerunner_overdrive_hitstop',
      release: 'arcana:edgerunner_overdrive_release',
    },
    phases: [
      {
        name: 'lock_on',
        duration: 700,
        actions: ['camera_move', 'sound_activation'],
      },
      {
        name: 'overdrive',
        duration: 2600,
        actions: ['sound_rush'],
        delay: 0,
      },
      {
        name: 'snapback',
        duration: 1100,
        actions: ['overlay_color_restore', 'sound_release'],
      },
    ],
  },
};

const BASE_CUTSCENE_CONFIGS = {
  execution: executionCutscene,
  time_freeze: timeFrozenCutscene,
  time_travel: timeTravelCutscene,
  divine_intervention: divineInterventionCutscene,
  mind_control: mindControlCutscene,
  astral_rebirth: astralRebirthCutscene,
  promotion_ritual: promotionRitualCutscene,
  breaking_point: breakingPointCutscene,
};

function normalizeRuntimeCardId(cardId = '') {
  if (cardId === 'arcane_cycle' || cardId === 'filtered_cycle') return 'filtered_cycle';
  return cardId;
}

function getProjectOverrideCardMap() {
  return STUDIO_CARD_OVERRIDES && typeof STUDIO_CARD_OVERRIDES === 'object'
    ? STUDIO_CARD_OVERRIDES
    : {};
}

function isStudioCardOverride(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && value.tracks
    && typeof value.tracks === 'object'
    && Number.isFinite(Number(value.durationMs)),
  );
}

function getStoredStudioCard(cardId) {
  const normalized = normalizeRuntimeCardId(cardId);
  const overrides = getProjectOverrideCardMap();
  const stored = overrides?.[normalized];
  if (!stored || typeof stored !== 'object') return null;

  if (isStudioCardOverride(stored)) {
    return migrateArcanaStudioCard({
      ...stored,
      id: normalized,
      meta: {
        ...(stored.meta || {}),
        source: 'arcana-studio',
      },
    }, normalized);
  }

  return migrateArcanaStudioCard(cutsceneConfigToArcanaStudioCard(stored, { id: normalized, source: 'arcana-studio' }), normalized);
}

function definitionCutsceneIdSet() {
  return new Set(
    (ARCANA_DEFINITIONS || [])
      .filter((entry) => Boolean(entry?.visual?.cutscene))
      .map((entry) => normalizeRuntimeCardId(entry.id)),
  );
}

function isLikelyCutsceneCard(card) {
  if (!card || typeof card !== 'object') return false;
  const cameraKeys = Array.isArray(card?.tracks?.camera)
    ? card.tracks.camera.reduce((acc, track) => acc + ((track?.keys || []).length || 0), 0)
    : 0;
  const objectKeys = Array.isArray(card?.tracks?.objects)
    ? card.tracks.objects.reduce((acc, track) => acc + ((track?.keys || []).length || 0), 0)
    : 0;
  const eventKeys = Array.isArray(card?.tracks?.events)
    ? card.tracks.events.reduce((acc, track) => acc + ((track?.keys || []).length || 0), 0)
    : 0;
  const soundKeys = Array.isArray(card?.tracks?.sounds)
    ? card.tracks.sounds.reduce((acc, track) => acc + (track?.keys || []).filter((key) => typeof key?.soundId === 'string' && key.soundId.trim().length > 0).length, 0)
    : 0;

    const hasMeaningfulCameraTimeline = cameraKeys > 0;
    const hasObjectAnimation = objectKeys > 0;
    return hasMeaningfulCameraTimeline || hasObjectAnimation || eventKeys > 0 || soundKeys > 0;
}

function getStoredCutsceneConfig(cardId) {
  const normalized = normalizeRuntimeCardId(cardId);
  const overrides = getProjectOverrideCardMap();
  const direct = overrides?.[normalized];
  if (!direct || typeof direct !== 'object') return null;
  if (isStudioCardOverride(direct)) {
    return arcanaStudioCardToCutsceneConfig(migrateArcanaStudioCard(direct, normalized));
  }
  return direct;
}

export function getAllCutsceneConfigs() {
  const result = { ...BASE_CUTSCENE_CONFIGS };
  const overrides = getProjectOverrideCardMap();
  Object.entries(overrides || {}).forEach(([rawId, rawValue]) => {
    if (!rawValue || typeof rawValue !== 'object') return;
    const id = normalizeRuntimeCardId(rawId);
    result[id] = isStudioCardOverride(rawValue)
      ? arcanaStudioCardToCutsceneConfig(migrateArcanaStudioCard(rawValue, id))
      : rawValue;
  });
  return result;
}

export function getCutsceneCard(cardId) {
  const normalized = normalizeRuntimeCardId(cardId);
  const stored = getStoredStudioCard(normalized);
  if (stored && isLikelyCutsceneCard(stored)) {
    return {
      ...stored,
      id: normalized,
      meta: {
        ...(stored.meta || {}),
        source: stored.meta?.source || 'arcana-studio',
        isCutscene: true,
      },
    };
  }

  const baseConfig = BASE_CUTSCENE_CONFIGS[normalized];
  if (!baseConfig) return null;
  return cutsceneConfigToArcanaStudioCard(baseConfig, { id: normalized });
}

export function getAllCutsceneCards() {
  const cards = {};
  const cutsceneDefinitionIds = definitionCutsceneIdSet();

  Object.entries(BASE_CUTSCENE_CONFIGS).forEach(([id, config]) => {
    cards[id] = cutsceneConfigToArcanaStudioCard(config, { id });
  });

  const overrideMap = getProjectOverrideCardMap();
  Object.entries(overrideMap || {}).forEach(([rawId, rawValue]) => {
    const id = normalizeRuntimeCardId(rawId);
    const card = isStudioCardOverride(rawValue)
      ? migrateArcanaStudioCard({
          ...rawValue,
          id,
          meta: {
            ...(rawValue.meta || {}),
            source: 'arcana-studio',
          },
        }, id)
      : migrateArcanaStudioCard(cutsceneConfigToArcanaStudioCard(rawValue, { id, source: 'arcana-studio' }), id);
    const hasPlayableData = isLikelyCutsceneCard(card);
    if (!hasPlayableData && cards[id]) return;
    if (!hasPlayableData && !cutsceneDefinitionIds.has(id) && !cards[id]) return;

    cards[id] = {
      ...card,
      id,
      meta: {
        ...(card.meta || {}),
        source: card.meta?.source || 'arcana-studio',
        isCutscene: true,
      },
    };
  });

  return cards;
}

export function buildLegacyCutsceneFromCard(cardInput) {
  return arcanaStudioCardToCutsceneConfig(cardInput);
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
