import { createEmptyArcanaStudioCard, migrateArcanaStudioCard } from './arcanaStudioSchema.js';

function normalizeOverlayArray(overlay) {
  if (!overlay) return [];
  return Array.isArray(overlay) ? overlay : [overlay];
}

function computePhaseTimeline(phases = []) {
  const result = [];
  let elapsed = 0;
  phases.forEach((phase) => {
    const delay = Number(phase?.delay || 0);
    const phaseStart = elapsed + Math.max(0, delay);
    result.push({
      name: phase?.name || 'phase',
      startMs: phaseStart,
      durationMs: Number(phase?.duration || 0),
      actions: Array.isArray(phase?.actions) ? phase.actions : [],
    });
    elapsed += Number(phase?.duration || 0);
  });
  return result;
}

function normalizeLegacyToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveLegacySoundFromAction(action, soundMap = {}) {
  if (typeof action !== 'string' || !action.startsWith('sound_')) return '';

  const token = action.slice('sound_'.length);
  if (!token) return '';

  if (soundMap[token]) return soundMap[token];

  const normalizedToken = normalizeLegacyToken(token);
  const entries = Object.entries(soundMap || {});

  for (const [key, value] of entries) {
    const normalizedKey = normalizeLegacyToken(key);
    if (!normalizedKey) continue;
    if (normalizedKey === normalizedToken || normalizedKey.includes(normalizedToken) || normalizedToken.includes(normalizedKey)) {
      return value;
    }
  }

  return '';
}

function clampFov(value, fallback = 55) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(5, Math.min(140, parsed));
}

function mapLegacyOverlayType(action = '') {
  const token = String(action || '').toLowerCase().replace(/^overlay_/, '');
  if (!token) return 'overlay:flash';
  if (token === 'flash' || token.endsWith('_flash')) return 'overlay:flash';
  if (token.includes('monochrome')) return 'overlay:monochrome';
  if (token.includes('color_restore')) return 'overlay:color-fade';
  if (token.includes('vignette')) return 'overlay:vignette';
  return 'overlay:flash';
}

function mapLegacyPhaseAction(action, context = {}) {
  const actionType = String(action || '').toLowerCase();
  const { soundId, phase, camera, cardId } = context;

  if (actionType.startsWith('sound_')) {
    return {
      type: 'sound_play',
      payload: {
        soundId: soundId || '',
        volume: 1,
        pitch: 1,
        loop: false,
      },
    };
  }

  if (actionType.startsWith('camera_')) {
    return {
      type: 'camera:focus',
      payload: {
        anchor: 'target',
        duration: Number(camera?.duration || 600),
        holdDuration: Number(camera?.holdDuration || 1000),
        returnDuration: Number(camera?.returnDuration || camera?.duration || 600),
        lookAtYOffset: Number(camera?.shots?.[0]?.lookAtYOffset || 0),
      },
    };
  }

  if (actionType.startsWith('overlay_')) {
    return {
      type: mapLegacyOverlayType(actionType),
      payload: {
        duration: Math.max(100, Number(phase?.duration || 700)),
      },
    };
  }

  if (actionType.startsWith('vfx_')) {
    return {
      type: 'vfx:play',
      payload: {
        effect: actionType.slice('vfx_'.length),
        cardId,
        durationMs: Math.max(100, Number(phase?.duration || 900)),
      },
    };
  }

  return {
    type: action,
    payload: {
      legacyAction: action,
    },
  };
}

export function legacyCutsceneToArcanaStudioCard(legacyCutscene, options = {}) {
  if (!legacyCutscene || typeof legacyCutscene !== 'object') {
    return createEmptyArcanaStudioCard(options.id || 'legacy_cutscene');
  }

  const id = legacyCutscene.id || options.id || 'legacy_cutscene';
  const card = createEmptyArcanaStudioCard(id);
  const config = legacyCutscene.config || {};
  const camera = config.camera || {};
  const phases = computePhaseTimeline(config.phases || []);

  card.id = id;
  card.name = options.name || id.replace(/_/g, ' ');
  card.durationMs = Number(legacyCutscene.duration || card.durationMs);
  card.meta = {
    ...card.meta,
    source: options.source || 'legacy-import',
    legacyId: legacyCutscene.id,
    legacyImportedAt: Date.now(),
    legacyConfigSnapshot: legacyCutscene,
  };

  const cameraTrack = {
    id: 'cam_main',
    name: 'Main Camera',
    keys: [],
  };

  const shots = Array.isArray(camera.shots) && camera.shots.length > 0
    ? camera.shots
    : [{
        zoom: camera.targetZoom || 1.5,
        duration: camera.duration || 500,
        holdDuration: camera.holdDuration || 1000,
        returnDuration: camera.returnDuration || camera.duration || 500,
        offset: camera.offset || [2, 4, 2],
      }];

  let shotStart = 0;
  shots.forEach((shot, index) => {
    const derivedFov = Math.max(20, Math.min(120, Math.round(60 / Math.max(0.4, Number(shot.zoom || 1)))));
    const shotFov = typeof shot?.fov === 'number' ? clampFov(shot.fov, derivedFov) : derivedFov;
    cameraTrack.keys.push({
      id: `cam_key_${index}`,
      timeMs: shotStart,
      position: [shot.offset?.[0] || 0, shot.offset?.[1] || 6, shot.offset?.[2] || 6],
      target: [0, shot.lookAtYOffset || 0, 0],
      fov: shotFov,
      easing: camera.easing || 'easeInOutCubic',
      blendMode: 'curve',
    });
    shotStart += Number(shot.duration || 0) + Number(shot.holdDuration || 0) + Number(shot.returnDuration || 0);
  });

  card.tracks.camera = [cameraTrack];

  const sounds = config.sound || {};
  const soundTrack = {
    id: 'legacy_sound',
    name: 'Legacy Sound',
    keys: [],
  };
  Object.values(sounds).forEach((soundId, idx) => {
    if (!soundId) return;
    const phaseStart = phases[idx]?.startMs || idx * 300;
    soundTrack.keys.push({ id: `snd_${idx}`, timeMs: phaseStart, soundId, volume: 1, pitch: 1, loop: false });
  });
  if (soundTrack.keys.length) {
    card.tracks.sounds = [soundTrack];
  }

  const eventTrack = {
    id: 'legacy_events',
    name: 'Legacy Events',
    keys: [],
  };
  let emittedCardVfx = false;
  phases.forEach((phase, idx) => {
    phase.actions.forEach((action, actionIndex) => {
      const resolvedSoundId = resolveLegacySoundFromAction(action, sounds);
      let mapped = mapLegacyPhaseAction(action, {
        soundId: resolvedSoundId,
        phase,
        camera,
        cardId: id,
      });
      if (mapped.type === 'vfx:play') {
        if (emittedCardVfx) {
          mapped = {
            type: 'overlay:flash',
            payload: {
              duration: Math.max(100, Number(phase?.duration || 420)),
            },
          };
        } else {
          emittedCardVfx = true;
        }
      }
      eventTrack.keys.push({
        id: `evt_${idx}_${actionIndex}`,
        timeMs: phase.startMs,
        type: mapped.type,
        delayMs: 0,
        payload: {
          phase: phase.name,
          cardId: id,
          legacyAction: action,
          ...(mapped.payload || {}),
          soundId: resolvedSoundId || undefined,
          soundMap: sounds,
        },
      });
    });
  });
  card.tracks.events = [eventTrack];

  card.tracks.particles = [];
  card.tracks.overlays = [];

  return migrateArcanaStudioCard(card, id);
}

export function arcanaStudioCardToLegacyCutscene(cardInput) {
  const card = migrateArcanaStudioCard(cardInput, cardInput?.id || 'unnamed');
  const snapshot = card.meta?.legacyConfigSnapshot;
  const duration = Number(card.durationMs || 0);

  const cameraTrack = card.tracks.camera?.[0];
  const cameraKeys = Array.isArray(cameraTrack?.keys) ? cameraTrack.keys : [];
  const cameraShots = cameraKeys.map((key, idx) => {
    const nextTime = cameraKeys[idx + 1]?.timeMs ?? duration;
    const segment = Math.max(200, nextTime - key.timeMs);
    const zoom = Math.max(0.2, 60 / Math.max(1, Number(key.fov || 55)));
    const fov = clampFov(key.fov, 55);
    return {
      fov,
      zoom,
      duration: Math.max(100, Math.floor(segment * 0.25)),
      holdDuration: Math.max(100, Math.floor(segment * 0.5)),
      returnDuration: Math.max(100, Math.floor(segment * 0.25)),
      offset: key.position || [0, 6, 6],
      lookAtYOffset: key.target?.[1] || 0,
      blendMode: key.blendMode || 'curve',
    };
  });

  const soundTrack = card.tracks.sounds?.[0];
  const sound = {};
  (soundTrack?.keys || []).forEach((key, idx) => {
    sound[`cue_${idx + 1}`] = key.soundId;
  });

  const phaseBuckets = new Map();
  (card.tracks.events || []).forEach((track) => {
    (track.keys || []).forEach((key) => {
      const bucketKey = `${key.timeMs}`;
      if (!phaseBuckets.has(bucketKey)) {
        phaseBuckets.set(bucketKey, {
          name: key.payload?.phase || `phase_${phaseBuckets.size + 1}`,
          timeMs: key.timeMs,
          delay: key.delayMs || 0,
          actions: [],
        });
      }
      phaseBuckets.get(bucketKey).actions.push(key.type);
    });
  });

  const phases = [...phaseBuckets.values()]
    .sort((a, b) => a.timeMs - b.timeMs)
    .map((phase, idx, arr) => {
      const nextTime = arr[idx + 1]?.timeMs ?? duration;
      return {
        name: phase.name || `phase_${idx + 1}`,
        duration: Math.max(100, nextTime - phase.timeMs),
        actions: phase.actions,
        delay: phase.delay,
      };
    });

  const vfx = {
    ...(snapshot?.config?.vfx || {}),
  };

  return {
    id: card.id,
    duration,
    config: {
      camera: {
        targetZoom: cameraShots[0]?.zoom || snapshot?.config?.camera?.targetZoom || 1.5,
        duration: cameraShots[0]?.duration || snapshot?.config?.camera?.duration || 500,
        holdDuration: cameraShots[0]?.holdDuration || snapshot?.config?.camera?.holdDuration || 1000,
        easing: cameraKeys[0]?.easing || snapshot?.config?.camera?.easing || 'easeInOutCubic',
        shots: cameraShots.length ? cameraShots : (snapshot?.config?.camera?.shots || []),
      },
      overlay: null,
      vfx,
      sound: Object.keys(sound).length ? sound : (snapshot?.config?.sound || {}),
      phases: phases.length ? phases : (snapshot?.config?.phases || []),
    },
  };
}
