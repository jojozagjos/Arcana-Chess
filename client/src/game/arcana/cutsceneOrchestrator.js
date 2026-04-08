/**
 * Cutscene Orchestrator
 * 
 * Coordinates camera, overlay, VFX, and sound effects for smooth cutscenes.
 * Handles timing, sequencing, and cleanup.
 */

import { getCutsceneConfig } from './cutsceneDefinitions.js';

/**
 * Orchestrate a complete cutscene
 * @param {Object} params
 * @param {string} params.arcanaId - Card ID (e.g., 'execution')
 * @param {Object} params.cameraRef - Ref to CameraCutscene component
 * @param {Object} params.overlayRef - Ref to CutsceneOverlay component
 * @param {Object} params.soundManager - Sound manager instance
 * @param {string} params.targetSquare - Board square (e.g., 'e4')
 * @param {Function} params.onVFXTrigger - Callback to trigger VFX (e.g., ExecutionEffect)
 * @param {Function} params.onComplete - Callback when cutscene finishes
 */
export function orchestrateCutscene(params) {
  const {
    arcanaId,
    cameraRef,
    overlayRef,
    soundManager,
    targetSquare,
    onVFXTrigger,
    onComplete,
  } = params;

  // Get cutscene config
  const cutsceneConfig = getCutsceneConfig(arcanaId);
  if (!cutsceneConfig) {
    console.warn(`No cutscene config found for ${arcanaId}`);
    onComplete?.();
    return;
  }

  const { config, duration } = cutsceneConfig;
  const { camera, overlay, vfx, sound, phases } = config;
  const eventParams = params?.eventParams || params?.params || {};
  const focusSquare =
    targetSquare ||
    eventParams?.targetSquare ||
    eventParams?.square ||
    eventParams?.kingTo ||
    eventParams?.rebornSquare ||
    null;

  // Timeline trackers
  const effectTimers = [];
  let currentPhaseIndex = 0;

  // Start camera movement or script
  if (cameraRef?.current && camera) {
    try {
      const trigger = cameraRef.current.triggerCutscene;
      if (typeof trigger === 'function' && focusSquare) {
        const shots = Array.isArray(camera.shots) && camera.shots.length
          ? camera.shots
          : [{
              square: focusSquare,
              zoom: camera.targetZoom || 1.0,
              holdDuration: camera.holdDuration || 1500,
              duration: camera.duration || 650,
              returnDuration: camera.returnDuration || camera.duration || 650,
              offset: camera.offset || null,
              lookAtYOffset: camera.lookAtYOffset || 0,
            }];

        let shotDelay = 0;
        shots.forEach((shot) => {
          const isFirst = shotDelay === 0;
          const isLast = shot === shots[shots.length - 1];
          const shotSquare = resolveShotSquare(shot, eventParams, focusSquare) || focusSquare;
          const timer = setTimeout(() => {
            trigger(shotSquare, {
              zoom: shot.zoom ?? camera.targetZoom ?? 1.0,
              holdDuration: shot.holdDuration ?? 1000,
              duration: shot.duration ?? camera.duration ?? 650,
              returnDuration: shot.returnDuration ?? shot.duration ?? camera.returnDuration ?? camera.duration ?? 650,
              offset: shot.offset || camera.offset || null,
              lookAtYOffset: shot.lookAtYOffset ?? camera.lookAtYOffset ?? 0,
              sequenceStart: isFirst,
              sequenceEnd: isLast,
              holdPosition: !isLast,
            });
          }, shotDelay);
          effectTimers.push(timer);
          shotDelay += (shot.duration || 650) + (shot.holdDuration || 1000) + (shot.returnDuration || shot.duration || 650);
        });
      }
    } catch (err) {
      console.warn('Failed to trigger camera cutscene:', err);
    }
  }

  // Play overlay effects
  if (overlayRef?.current && overlay) {
    try {
      // Single overlay effect
      if (overlay.effect) {
        overlayRef.current.playEffect({
          effect: overlay.effect,
          color: overlay.color,
          duration: overlay.duration,
          intensity: overlay.intensity,
          fadeIn: overlay.fadeIn,
          hold: overlay.hold,
          fadeOut: overlay.fadeOut,
        });
      }
      // Multiple overlay effects (e.g., time_travel)
      else if (Array.isArray(overlay)) {
        overlay.forEach((overlayConfig) => {
          const phaseDelay = getPhaseDelay(overlayConfig.phase, phases);
          const delay = typeof overlayConfig.delay === 'number' ? overlayConfig.delay : phaseDelay;
          const timer = setTimeout(() => {
            overlayRef.current.playEffect({
              effect: overlayConfig.effect,
              color: overlayConfig.color,
              duration: overlayConfig.duration,
              intensity: overlayConfig.intensity,
              fadeIn: overlayConfig.fadeIn,
              hold: overlayConfig.hold,
              fadeOut: overlayConfig.fadeOut,
            });
          }, delay);
          effectTimers.push(timer);
        });
      }
    } catch (err) {
      console.warn('Failed to play overlay effect:', err);
    }
  }

  // Execute phase actions
  if (phases && Array.isArray(phases)) {
    let elapsedTime = 0;
    phases.forEach((phase) => {
      const phaseDelay = elapsedTime + (phase.delay || 0);

      phase.actions?.forEach((action) => {
        const timer = setTimeout(() => {
          executeAction(action, {
            arcanaId,
            soundManager,
            sound,
            onVFXTrigger,
            targetSquare: focusSquare,
          });
        }, phaseDelay);
        effectTimers.push(timer);
      });

      elapsedTime += phase.duration || 0;
    });
  }

  // Play completion callback
  const completionTimer = setTimeout(() => {
    // Cleanup
    effectTimers.forEach(clearTimeout);
    onComplete?.();
  }, duration);
  effectTimers.push(completionTimer);

  // Return cleanup function
  return () => {
    effectTimers.forEach(clearTimeout);
  };
}

/**
 * Execute a single action within a cutscene phase
 */
function executeAction(action, context) {
  const { arcanaId, soundManager, sound, onVFXTrigger, targetSquare } = context;

  if (typeof action !== 'string') {
    return;
  }

  const normalizedAction = action.trim().toLowerCase();
  if (!normalizedAction) {
    return;
  }

  if (normalizedAction.startsWith('sound_')) {
    const soundKey = normalizedAction.slice('sound_'.length);
    const soundTrack = resolveSoundTrack(sound, soundKey);
    if (soundTrack) {
      const shouldLoop = soundKey === 'ambient' || soundKey === 'ambient_loop' || soundKey === 'ambient_continue';
      soundManager?.play(soundTrack, shouldLoop ? { loop: true } : undefined);
    }
    return;
  }

  if (normalizedAction.startsWith('vfx_')) {
    onVFXTrigger?.(resolveVfxPayload(normalizedAction, { arcanaId, targetSquare }));
    return;
  }

  if (normalizedAction.startsWith('overlay_') || normalizedAction.startsWith('camera_')) {
    return;
  }

  switch (normalizedAction) {
    // Sound actions
    case 'sound_guillotine':
      soundManager?.play(sound?.guillotine);
      break;
    case 'sound_destroy':
      soundManager?.play(sound?.destroy);
      break;
    case 'sound_complete':
      soundManager?.play(sound?.complete);
      break;
    case 'sound_freeze':
      soundManager?.play(sound?.freeze);
      break;
    case 'sound_ambient':
    case 'sound_ambient_loop':
    case 'sound_ambient_continue':
      soundManager?.play(sound?.ambient, { loop: true });
      break;
    case 'sound_unfreeze':
      soundManager?.play(sound?.unfreeze);
      break;
    case 'sound_rewind':
      soundManager?.play(sound?.rewind);
      break;

    // VFX actions
    case 'vfx_guillotine':
    case 'vfx_destruction':
      onVFXTrigger?.({ type: 'execution', targetSquare });
      break;
    case 'vfx_particles':
      onVFXTrigger?.({ type: 'particles', arcanaId, targetSquare });
      break;
    case 'vfx_spawn_particles':
      onVFXTrigger?.({ type: 'spawn', targetSquare });
      break;
    case 'vfx_mind_aura':
      onVFXTrigger?.({ type: 'mind-control', targetSquare });
      break;
    case 'vfx_materialize':
      onVFXTrigger?.({ type: 'materialize', targetSquare });
      break;
    case 'vfx_rewind_trails':
      onVFXTrigger?.({ type: 'rewind', targetSquare });
      break;
    case 'vfx_glow_particles':
      onVFXTrigger?.({ type: 'glow', targetSquare });
      break;

    // Move animation actions
    case 'move_reverse_animation':
      onVFXTrigger?.({ type: 'reverse-moves' });
      break;

    // Overlay actions
    case 'overlay_flash':
    case 'overlay_monochrome':
    case 'overlay_divine_flash':
    case 'overlay_astral_glow':
    case 'overlay_mind_flash':
    case 'overlay_monochrome_fade':
    case 'overlay_color_restore':
      // Already handled by playEffect calls above
      break;

    // Camera actions
    case 'camera_move':
    case 'camera_focus':
    case 'camera_return':
      // Already handled by triggerCutscene call above
      break;

    default:
      console.warn(`Unknown cutscene action: ${action}`);
  }
}

function resolveSoundTrack(sound, soundKey) {
  if (!sound || !soundKey) return null;

  const normalizedKey = soundKey.replace(/[^a-z0-9]+/g, '_');
  const compactKey = normalizedKey.replace(/_/g, '');

  const candidates = [
    sound[normalizedKey],
    sound[soundKey],
    sound[compactKey],
  ];

  return candidates.find(Boolean) || null;
}

function resolveVfxPayload(action, context) {
  const { arcanaId, targetSquare } = context;

  switch (action) {
    case 'vfx_guillotine':
    case 'vfx_destruction':
      return { type: 'execution', arcanaId, targetSquare };
    case 'vfx_particles':
      return { type: 'particles', arcanaId, targetSquare };
    case 'vfx_spawn_particles':
      return { type: 'spawn', arcanaId, targetSquare };
    case 'vfx_mind_aura':
      return { type: 'mind-control', arcanaId, targetSquare };
    case 'vfx_materialize':
      return { type: 'materialize', arcanaId, targetSquare };
    case 'vfx_rewind_trails':
      return { type: 'rewind', arcanaId, targetSquare };
    case 'vfx_glow_particles':
      return { type: 'glow', arcanaId, targetSquare };
    default:
      return { type: action.replace(/^vfx_/, '').replace(/_/g, '-'), arcanaId, targetSquare };
  }
}

/**
 * Calculate delay for a phase by name
 */
function getPhaseDelay(phaseName, phases) {
  if (!phaseName) return 0;
  let delay = 0;
  for (const phase of phases || []) {
    if (phase.name === phaseName) {
      return delay;
    }
    delay += phase.duration || 0;
  }
  // If phase label doesn't exist, default to immediate instead of end-of-cutscene.
  return 0;
}

function resolveShotSquare(shot, eventParams, fallbackSquare) {
  if (shot?.square) return shot.square;
  const anchor = shot?.anchor;
  if (!anchor) return fallbackSquare || null;

  if (anchor === 'target') {
    return eventParams?.targetSquare || eventParams?.square || fallbackSquare || null;
  }

  const dashMatch = /^dash(\d+)$/i.exec(anchor);
  if (dashMatch) {
    const idx = parseInt(dashMatch[1], 10) - 1;
    if (Array.isArray(eventParams?.dashPath) && idx >= 0) {
      return eventParams.dashPath[idx] || fallbackSquare || null;
    }
    return fallbackSquare || null;
  }

  const displacedMatch = /^displaced(\d+)$/i.exec(anchor);
  if (displacedMatch) {
    const idx = parseInt(displacedMatch[1], 10) - 1;
    const displaced = Array.isArray(eventParams?.displaced) ? eventParams.displaced : [];
    if (displaced[idx]?.to) return displaced[idx].to;
    return fallbackSquare || null;
  }

  return fallbackSquare || null;
}

/**
 * Create cutscene context hook for GameScene
 * Returns orchestration functions and refs
 */
export function useCutsceneOrchestration() {
  const cameraRef = React.useRef();
  const overlayRef = React.useRef();

  const triggerCutscene = (arcanaId, targetSquare, options = {}) => {
    return orchestrateCutscene({
      arcanaId,
      cameraRef,
      overlayRef,
      targetSquare,
      ...options,
    });
  };

  return {
    cameraRef,
    overlayRef,
    triggerCutscene,
  };
}
