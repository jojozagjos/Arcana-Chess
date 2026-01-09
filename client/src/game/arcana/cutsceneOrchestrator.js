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

  // Timeline trackers
  const effectTimers = [];
  let currentPhaseIndex = 0;

  // Start camera movement
  if (cameraRef?.current && camera) {
    try {
      cameraRef.current.triggerCutscene({
        targetPosition: camera.targetPosition || [0, 3, 5],
        targetLookAt: camera.targetLookAt || [0, 0, 0],
        zoom: camera.targetZoom || 1.0,
        duration: camera.duration || 1000,
        holdDuration: camera.holdDuration || 1500,
        easing: camera.easing || 'easeInOutCubic',
      });
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
          const delay = getPhaseDelay(overlayConfig.phase, phases);
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
            targetSquare,
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

  switch (action) {
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

/**
 * Calculate delay for a phase by name
 */
function getPhaseDelay(phaseName, phases) {
  let delay = 0;
  for (const phase of phases || []) {
    if (phase.name === phaseName) {
      return delay;
    }
    delay += phase.duration || 0;
  }
  return delay;
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
