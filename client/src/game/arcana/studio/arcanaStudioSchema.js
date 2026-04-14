export const ARCANA_STUDIO_CARD_VERSION = 1;

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampTimeMs(value) {
  return Math.max(0, Math.floor(toFiniteNumber(value, 0)));
}

function cloneObject(value, fallback = {}) {
  try {
    return JSON.parse(JSON.stringify(value ?? fallback));
  } catch {
    return fallback;
  }
}

function normalizeVec3(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [toFiniteNumber(value[0], fallback[0]), toFiniteNumber(value[1], fallback[1]), toFiniteNumber(value[2], fallback[2])];
}

function stableSerialize(value) {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
}

function normalizeCameraKey(key, defaultTime = 0) {
  return {
    id: key?.id || uid('camkey'),
    timeMs: clampTimeMs(key?.timeMs ?? key?.time ?? defaultTime),
    position: normalizeVec3(key?.position, [0, 7, 7]),
    target: normalizeVec3(key?.target, [0, 0, 0]),
    rotation: normalizeVec3(key?.rotation, [0, 0, 0]),
    fov: Math.max(5, Math.min(140, toFiniteNumber(key?.fov, 55))),
    easing: key?.easing || 'easeInOutCubic',
    bezier: Array.isArray(key?.bezier) && key.bezier.length === 4 ? key.bezier.map((v, idx) => toFiniteNumber(v, [0.25, 0.1, 0.25, 1][idx])) : [0.25, 0.1, 0.25, 1],
    blendMode: key?.blendMode || 'curve',
  };
}

function normalizeTransformKey(key, defaultTime = 0) {
  return {
    id: key?.id || uid('objkey'),
    timeMs: clampTimeMs(key?.timeMs ?? key?.time ?? defaultTime),
    position: normalizeVec3(key?.position, [0, 0, 0]),
    rotation: normalizeVec3(key?.rotation, [0, 0, 0]),
    scale: normalizeVec3(key?.scale, [1, 1, 1]),
    easing: key?.easing || 'easeInOutCubic',
    bezier: Array.isArray(key?.bezier) && key.bezier.length === 4 ? key.bezier.map((v, idx) => toFiniteNumber(v, [0.25, 0.1, 0.25, 1][idx])) : [0.25, 0.1, 0.25, 1],
  };
}

function normalizeParticleTrack(track = {}) {
  const style = String(track.params?.renderStyle || '').trim();
  const normalizedStyle = ['orb', 'spark', 'shard', 'streak', 'smoke'].includes(style) ? style : 'orb';
  return {
    id: track.id || uid('pt'),
    name: track.name || 'Emitter',
    attach: {
      mode: track.attach?.mode || 'follow',
      targetId: track.attach?.targetId || null,
      parentId: track.attach?.parentId || null,
      offset: normalizeVec3(track.attach?.offset, [0, 0, 0]),
      parenting: track.attach?.parenting ?? true,
    },
    params: {
      emissionRate: toFiniteNumber(track.params?.emissionRate, 32),
      burstCount: toFiniteNumber(track.params?.burstCount, 0),
      velocityMin: toFiniteNumber(track.params?.velocityMin, 0.4),
      velocityMax: toFiniteNumber(track.params?.velocityMax, 1.8),
      lifetimeMin: toFiniteNumber(track.params?.lifetimeMin, 0.35),
      lifetimeMax: toFiniteNumber(track.params?.lifetimeMax, 1.2),
      sizeOverLife: Array.isArray(track.params?.sizeOverLife) ? track.params.sizeOverLife : [1, 0.7, 0],
      colorOverLife: Array.isArray(track.params?.colorOverLife) ? track.params.colorOverLife : ['#ffffff', '#88ccff', '#0044ff'],
      gravity: normalizeVec3(track.params?.gravity, [0, -9.81, 0]),
      drag: toFiniteNumber(track.params?.drag, 0.08),
      spawnShape: track.params?.spawnShape || 'sphere',
      spawnRadius: toFiniteNumber(track.params?.spawnRadius, 0.35),
      noiseStrength: toFiniteNumber(track.params?.noiseStrength, 0.2),
      noiseFrequency: toFiniteNumber(track.params?.noiseFrequency, 1.5),
      renderStyle: normalizedStyle,
      stretch: toFiniteNumber(track.params?.stretch, 0.35),
      brightness: toFiniteNumber(track.params?.brightness, 1.2),
      spinRate: toFiniteNumber(track.params?.spinRate, 0.8),
      rotationJitter: toFiniteNumber(track.params?.rotationJitter, 0.45),
      material: {
        additive: track.params?.material?.additive ?? true,
        softParticles: track.params?.material?.softParticles ?? true,
      },
      subemitters: Array.isArray(track.params?.subemitters) ? track.params.subemitters : [],
    },
    keys: (Array.isArray(track.keys) ? track.keys : []).map((key, idx) => ({
      id: key?.id || uid('ptk'),
      timeMs: clampTimeMs(key?.timeMs ?? key?.time ?? idx * 500),
      enabled: key?.enabled ?? true,
      seed: Number.isInteger(key?.seed) ? key.seed : 1337,
      easing: key?.easing || 'linear',
      overrides: typeof key?.overrides === 'object' && key.overrides ? key.overrides : {},
    })).sort((a, b) => a.timeMs - b.timeMs),
  };
}

function normalizeOverlayTrack(track = {}) {
  return {
    id: track.id || uid('ov'),
    name: track.name || 'Overlay',
    type: track.type || 'text',
    space: track.space || 'screen',
    parentId: track.parentId || null,
    layer: Number.isFinite(track.layer) ? track.layer : 0,
    content: track.content || 'New overlay text',
    style: {
      color: track.style?.color || '#ffffff',
      fontSize: toFiniteNumber(track.style?.fontSize, 36),
      fontFamily: track.style?.fontFamily || 'Georgia, serif',
      weight: track.style?.weight || 700,
      align: track.style?.align || 'center',
      imageUrl: track.style?.imageUrl || '',
      background: track.style?.background || 'rgba(0,0,0,0)',
      width: toFiniteNumber(track.style?.width, 100),
      height: toFiniteNumber(track.style?.height, 100),
      borderRadius: toFiniteNumber(track.style?.borderRadius, 0),
    },
    keys: (Array.isArray(track.keys) ? track.keys : []).map((key, idx) => ({
      id: key?.id || uid('ovk'),
      timeMs: clampTimeMs(key?.timeMs ?? key?.time ?? idx * 500),
      x: toFiniteNumber(key?.x, 50),
      y: toFiniteNumber(key?.y, 50),
      opacity: Math.max(0, Math.min(1, toFiniteNumber(key?.opacity, 1))),
      scale: toFiniteNumber(key?.scale, 1),
      rotation: toFiniteNumber(key?.rotation, 0),
      easing: key?.easing || 'easeInOutCubic',
      text: key?.text ?? null,
    })).sort((a, b) => a.timeMs - b.timeMs),
  };
}

function normalizeSoundTrack(track = {}) {
  const deduped = new Set();
  return {
    id: track.id || uid('snd'),
    name: track.name || 'Sound Track',
    keys: (Array.isArray(track.keys) ? track.keys : [])
      .map((key, idx) => ({
        id: key?.id || uid('sndk'),
        timeMs: clampTimeMs(key?.timeMs ?? key?.time ?? idx * 500),
        soundId: key?.soundId || '',
        volume: Math.max(0, Math.min(2, toFiniteNumber(key?.volume, 1))),
        loop: Boolean(key?.loop),
        pitch: Math.max(0.25, Math.min(4, toFiniteNumber(key?.pitch, 1))),
      }))
      .filter((key) => {
        const token = `${key.timeMs}|${key.soundId}|${key.volume}|${key.pitch}|${key.loop}`;
        if (deduped.has(token)) return false;
        deduped.add(token);
        return true;
      })
      .sort((a, b) => a.timeMs - b.timeMs),
  };
}

function normalizeLegacyEventType(type = '', payload = {}) {
  const eventType = String(type || '').toLowerCase();
  if (!eventType) return { type: 'custom', payload };

  if (eventType.startsWith('sound_')) {
    return {
      type: 'sound_play',
      payload: {
        ...payload,
        soundId: payload.soundId || payload.sound || payload.id || '',
      },
    };
  }

  if (eventType.startsWith('camera_')) {
    return {
      type: 'camera:focus',
      payload: {
        ...payload,
        anchor: payload.anchor || 'target',
      },
    };
  }

  if (eventType.startsWith('overlay_')) {
    const token = eventType.slice('overlay_'.length);
    if (token.includes('monochrome')) return { type: 'overlay:monochrome', payload: { ...payload } };
    if (token.includes('color_restore')) return { type: 'overlay:color-fade', payload: { ...payload } };
    if (token.includes('vignette')) return { type: 'overlay:vignette', payload: { ...payload } };
    return { type: 'overlay:flash', payload: { ...payload } };
  }

  if (eventType.startsWith('vfx_')) {
    return {
      type: 'vfx:play',
      payload: {
        ...payload,
        effect: payload.effect || eventType.slice('vfx_'.length),
      },
    };
  }

  return { type: type || 'custom', payload };
}

function normalizeEventTrack(track = {}) {
  const deduped = new Set();
  return {
    id: track.id || uid('evt'),
    name: track.name || 'Event Track',
    keys: (Array.isArray(track.keys) ? track.keys : [])
      .map((key, idx) => {
        const keyPayload = typeof key?.payload === 'object' && key.payload ? key.payload : {};
        const normalized = normalizeLegacyEventType(key?.type || 'custom', keyPayload);
        return {
          id: key?.id || uid('evtk'),
          timeMs: clampTimeMs(key?.timeMs ?? key?.time ?? idx * 500),
          type: normalized.type,
          delayMs: clampTimeMs(key?.delayMs ?? key?.delay ?? 0),
          payload: normalized.payload,
        };
      })
      .filter((key) => {
        const token = `${key.timeMs}|${key.delayMs}|${key.type}|${stableSerialize(key.payload || {})}`;
        if (deduped.has(token)) return false;
        deduped.add(token);
        return true;
      })
      .sort((a, b) => a.timeMs - b.timeMs),
  };
}

export function createEmptyArcanaStudioCard(id = 'new_cutscene') {
  return {
    version: ARCANA_STUDIO_CARD_VERSION,
    id,
    name: id.replace(/_/g, ' '),
    durationMs: 4000,
    settings: {
      autoKey: true,
      fps: 60,
      timelineSnapMs: 50,
      randomSeed: 1337,
      seedLocked: true,
    },
    board: {
      fen: '8/8/8/8/8/8/8/8 w - - 0 1',
      focusSquare: null,
    },
    tracks: {
      camera: [
        {
          id: uid('cam'),
          name: 'Main Camera',
          keys: [
            normalizeCameraKey({ timeMs: 0, position: [0, 7, 7], target: [0, 0, 0], fov: 55, easing: 'linear' }, 0),
          ],
        },
      ],
      objects: [],
      particles: [],
      overlays: [],
      sounds: [normalizeSoundTrack({ id: uid('snd'), name: 'SFX' })],
      events: [normalizeEventTrack({ id: uid('evt'), name: 'Events' })],
    },
    meta: {
      source: 'arcana-studio',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      usedPieces: [],
    },
  };
}

export function migrateArcanaStudioCard(input, fallbackId = 'legacy_cutscene') {
  const base = createEmptyArcanaStudioCard(fallbackId);
  const raw = typeof input === 'object' && input ? input : {};

  const card = {
    ...base,
    ...raw,
    version: ARCANA_STUDIO_CARD_VERSION,
    id: raw.id || fallbackId,
    name: raw.name || raw.id || fallbackId,
    durationMs: clampTimeMs(raw.durationMs ?? raw.duration ?? base.durationMs),
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      autoKey: (raw.settings?.autoKey ?? base.settings.autoKey) !== false,
      fps: Math.max(1, Math.min(240, toFiniteNumber(raw.settings?.fps, base.settings.fps))),
      timelineSnapMs: Math.max(1, clampTimeMs(raw.settings?.timelineSnapMs ?? base.settings.timelineSnapMs)),
      randomSeed: Number.isInteger(raw.settings?.randomSeed) ? raw.settings.randomSeed : base.settings.randomSeed,
      seedLocked: raw.settings?.seedLocked ?? base.settings.seedLocked,
    },
    board: {
      fen: raw.board?.fen || base.board.fen,
      focusSquare: raw.board?.focusSquare || null,
    },
    tracks: {
      camera: (Array.isArray(raw.tracks?.camera) ? raw.tracks.camera : base.tracks.camera).map((cam, idx) => {
        const rawKeys = (Array.isArray(cam?.keys) ? cam.keys : [normalizeCameraKey({ timeMs: 0 }, 0)])
          .map((key, keyIdx) => normalizeCameraKey(key, keyIdx * 500));
        const keyByTime = new Map();
        rawKeys.forEach((key) => {
          keyByTime.set(key.timeMs, key);
        });
        return {
          id: cam?.id || uid('cam'),
          name: cam?.name || `Camera ${idx + 1}`,
          keys: [...keyByTime.values()].sort((a, b) => a.timeMs - b.timeMs),
        };
      }),
      objects: (Array.isArray(raw.tracks?.objects) ? raw.tracks.objects : []).map((track, idx) => ({
        id: track?.id || uid('obj'),
        name: track?.name || `Object ${idx + 1}`,
        type: track?.type || 'piece',
        pieceSquare: track?.pieceSquare || null,
        previewPlayAnimation: track?.previewPlayAnimation || false,
        attach: {
          mode: track?.attach?.mode || 'follow',
          targetId: track?.attach?.targetId || null,
          parentId: track?.attach?.parentId || null,
          offset: normalizeVec3(track?.attach?.offset, [0, 0, 0]),
          parenting: track?.attach?.parenting ?? true,
        },
        keys: (Array.isArray(track?.keys) ? track.keys : []).map((key, keyIdx) => normalizeTransformKey(key, keyIdx * 500)).sort((a, b) => a.timeMs - b.timeMs),
      })),
      particles: (Array.isArray(raw.tracks?.particles) ? raw.tracks.particles : []).map((track) => normalizeParticleTrack(track)),
      overlays: (Array.isArray(raw.tracks?.overlays) ? raw.tracks.overlays : []).map((track) => normalizeOverlayTrack(track)),
      sounds: (Array.isArray(raw.tracks?.sounds) ? raw.tracks.sounds : base.tracks.sounds).map((track) => normalizeSoundTrack(track)),
      events: (Array.isArray(raw.tracks?.events) ? raw.tracks.events : []).map((track) => normalizeEventTrack(track)),
    },
    meta: {
      ...base.meta,
      ...(raw.meta || {}),
      updatedAt: Date.now(),
    },
  };

  return card;
}

