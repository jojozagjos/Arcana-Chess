export const ARCANA_STUDIO_CARD_VERSION = 2;
export const ARCANA_STUDIO_STORAGE_KEY = 'arcana.arcanaStudio.cards.v2';
const LEGACY_STORAGE_KEYS = ['arcana.arcanaStudio.cards.v1'];

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function toFinite(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clampMs(value, fallback = 0) {
  return Math.max(0, Math.floor(toFinite(value, fallback)));
}

function vec3(value, fallback = [0, 0, 0]) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [toFinite(value[0], fallback[0]), toFinite(value[1], fallback[1]), toFinite(value[2], fallback[2])];
}

function sortedKeys(keys) {
  return keys.slice().sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
}

function normalizeEasing(value) {
  const valid = new Set([
    'linear',
    'easeInQuad',
    'easeOutQuad',
    'easeInOutQuad',
    'easeInCubic',
    'easeOutCubic',
    'easeInOutCubic',
    'customBezier',
  ]);
  return valid.has(value) ? value : 'easeInOutCubic';
}

function normalizeBezier(input) {
  const base = [0.25, 0.1, 0.25, 1];
  if (!Array.isArray(input) || input.length !== 4) return base;
  return input.map((v, i) => toFinite(v, base[i]));
}

function normalizeCameraKey(key = {}, idx = 0) {
  return {
    id: key.id || uid('camk'),
    timeMs: clampMs(key.timeMs ?? key.time ?? idx * 500),
    position: vec3(key.position, [0, 7, 7]),
    target: vec3(key.target, [0, 0, 0]),
    fov: Math.max(5, Math.min(140, toFinite(key.fov, 55))),
    easing: normalizeEasing(key.easing),
    bezier: normalizeBezier(key.bezier),
    blendMode: key.blendMode === 'cut' ? 'cut' : 'curve',
  };
}

function normalizeObjectKey(key = {}, idx = 0) {
  return {
    id: key.id || uid('objk'),
    timeMs: clampMs(key.timeMs ?? key.time ?? idx * 500),
    position: vec3(key.position, [0, 0, 0]),
    rotation: vec3(key.rotation, [0, 0, 0]),
    scale: vec3(key.scale, [1, 1, 1]),
    easing: normalizeEasing(key.easing),
    bezier: normalizeBezier(key.bezier),
  };
}

function normalizeOverlayKey(key = {}, idx = 0) {
  return {
    id: key.id || uid('ovk'),
    timeMs: clampMs(key.timeMs ?? key.time ?? idx * 500),
    x: toFinite(key.x, 50),
    y: toFinite(key.y, 50),
    opacity: Math.max(0, Math.min(1, toFinite(key.opacity, 1))),
    scale: toFinite(key.scale, 1),
    rotation: toFinite(key.rotation, 0),
    easing: normalizeEasing(key.easing),
    bezier: normalizeBezier(key.bezier),
    text: key.text ?? null,
  };
}

function normalizeParticleKey(key = {}, idx = 0) {
  return {
    id: key.id || uid('ptk'),
    timeMs: clampMs(key.timeMs ?? key.time ?? idx * 500),
    enabled: key.enabled !== false,
    seed: Number.isInteger(key.seed) ? key.seed : 1337,
    easing: normalizeEasing(key.easing || 'linear'),
    bezier: normalizeBezier(key.bezier),
    overrides: typeof key.overrides === 'object' && key.overrides ? key.overrides : {},
  };
}

function normalizeSoundKey(key = {}, idx = 0) {
  return {
    id: key.id || uid('sdk'),
    timeMs: clampMs(key.timeMs ?? key.time ?? idx * 500),
    soundId: String(key.soundId || key.sound || ''),
    volume: Math.max(0, Math.min(2, toFinite(key.volume, 1))),
    pitch: Math.max(0.25, Math.min(4, toFinite(key.pitch, 1))),
    loop: Boolean(key.loop),
  };
}

function normalizeEventKey(key = {}, idx = 0) {
  return {
    id: key.id || uid('evk'),
    timeMs: clampMs(key.timeMs ?? key.time ?? idx * 500),
    type: String(key.type || 'custom'),
    delayMs: clampMs(key.delayMs ?? key.delay ?? 0),
    payload: typeof key.payload === 'object' && key.payload ? key.payload : {},
  };
}

function normalizeTrackCollection(arr, mapper) {
  return (Array.isArray(arr) ? arr : []).map(mapper);
}

export function createEmptyArcanaStudioCard(id = 'new_cutscene') {
  const now = Date.now();
  return {
    version: ARCANA_STUDIO_CARD_VERSION,
    id,
    name: id.replace(/_/g, ' '),
    description: '',
    durationMs: 4000,
    board: {
      fen: '8/8/8/8/8/8/8/8 w - - 0 1',
      focusSquare: null,
    },
    settings: {
      autoKey: true,
      fps: 60,
      timelineSnapMs: 50,
      randomSeed: 1337,
      seedLocked: true,
      previewMode: 'plane',
      loopPlayback: true,
    },
    tracks: {
      camera: [
        {
          id: uid('cam'),
          name: 'Main Camera',
          keys: [normalizeCameraKey({ timeMs: 0, position: [7, 8, 7], target: [0, 0, 0], fov: 55, easing: 'easeInOutCubic' })],
        },
      ],
      objects: [],
      particles: [],
      overlays: [],
      sounds: [{ id: uid('snd'), name: 'Audio', keys: [] }],
      events: [{ id: uid('evt'), name: 'Events', keys: [] }],
    },
    meta: {
      source: 'arcana-studio-v2',
      createdAt: now,
      updatedAt: now,
      usedPieces: [],
      cardPiecePreview: null,
      tags: [],
    },
  };
}

export function migrateArcanaStudioCard(input, fallbackId = 'legacy_cutscene') {
  const base = createEmptyArcanaStudioCard(fallbackId);
  const raw = typeof input === 'object' && input ? input : {};

  const cameraTracks = normalizeTrackCollection(raw.tracks?.camera || base.tracks.camera, (track, idx) => ({
    id: track?.id || uid('cam'),
    name: track?.name || `Camera ${idx + 1}`,
    keys: sortedKeys(normalizeTrackCollection(track?.keys, (key, keyIdx) => normalizeCameraKey(key, keyIdx))),
  }));

  const objectTracks = normalizeTrackCollection(raw.tracks?.objects, (track, idx) => ({
    id: track?.id || uid('obj'),
    name: track?.name || `Piece ${idx + 1}`,
    type: ['piece', 'mesh', 'part'].includes(track?.type) ? track.type : 'piece',
    pieceSquare: track?.pieceSquare || null,
    assetUri: track?.assetUri || '',
    clipName: track?.clipName || null,
    clipOffsetMs: clampMs(track?.clipOffsetMs ?? 0),
    clipLoop: track?.clipLoop !== false,
    previewPlayAnimation: Boolean(track?.previewPlayAnimation),
    attach: {
      mode: ['follow', 'attach-offset', 'world-space'].includes(track?.attach?.mode) ? track.attach.mode : 'follow',
      targetId: track?.attach?.targetId || null,
      parentId: track?.attach?.parentId || null,
      offset: vec3(track?.attach?.offset, [0, 0, 0]),
      parenting: track?.attach?.parenting !== false,
    },
    rig: {
      rootBone: track?.rig?.rootBone || null,
      skeletonName: track?.rig?.skeletonName || null,
      notes: track?.rig?.notes || '',
    },
    keys: sortedKeys(normalizeTrackCollection(track?.keys, (key, keyIdx) => normalizeObjectKey(key, keyIdx))),
  }));

  const particleTracks = normalizeTrackCollection(raw.tracks?.particles, (track, idx) => ({
    id: track?.id || uid('pt'),
    name: track?.name || `Particle ${idx + 1}`,
    attach: {
      mode: ['follow', 'attach-offset', 'world-space'].includes(track?.attach?.mode) ? track.attach.mode : 'follow',
      targetId: track?.attach?.targetId || null,
      parentId: track?.attach?.parentId || null,
      offset: vec3(track?.attach?.offset, [0, 0, 0]),
      parenting: track?.attach?.parenting !== false,
    },
    params: {
      emissionRate: toFinite(track?.params?.emissionRate, 20),
      burstCount: toFinite(track?.params?.burstCount, 0),
      velocityMin: toFinite(track?.params?.velocityMin, 0.4),
      velocityMax: toFinite(track?.params?.velocityMax, 2.2),
      lifetimeMin: toFinite(track?.params?.lifetimeMin, 0.25),
      lifetimeMax: toFinite(track?.params?.lifetimeMax, 1.4),
      sizeOverLife: Array.isArray(track?.params?.sizeOverLife) ? track.params.sizeOverLife : [1, 0.6, 0],
      colorOverLife: Array.isArray(track?.params?.colorOverLife) ? track.params.colorOverLife : ['#aef4ff', '#63d5ff', '#1c7aff'],
      gravity: vec3(track?.params?.gravity, [0, -7.5, 0]),
      drag: toFinite(track?.params?.drag, 0.08),
      spawnShape: track?.params?.spawnShape || 'sphere',
      spawnRadius: toFinite(track?.params?.spawnRadius, 0.35),
      noiseStrength: toFinite(track?.params?.noiseStrength, 0.2),
      noiseFrequency: toFinite(track?.params?.noiseFrequency, 1.4),
      material: {
        additive: track?.params?.material?.additive !== false,
        softParticles: track?.params?.material?.softParticles !== false,
      },
      subemitters: Array.isArray(track?.params?.subemitters) ? track.params.subemitters : [],
    },
    keys: sortedKeys(normalizeTrackCollection(track?.keys, (key, keyIdx) => normalizeParticleKey(key, keyIdx))),
  }));

  const overlayTracks = normalizeTrackCollection(raw.tracks?.overlays, (track, idx) => ({
    id: track?.id || uid('ov'),
    name: track?.name || `Overlay ${idx + 1}`,
    type: ['text', 'panel', 'image'].includes(track?.type) ? track.type : 'text',
    space: track?.space === 'world' ? 'world' : 'screen',
    content: track?.content || 'New overlay',
    pieceSquare: track?.pieceSquare || null,
    attach: {
      mode: ['follow', 'attach-offset', 'world-space'].includes(track?.attach?.mode) ? track.attach.mode : 'follow',
      targetId: track?.attach?.targetId || null,
      offset: vec3(track?.attach?.offset, [0, 0, 0]),
    },
    style: {
      color: track?.style?.color || '#ffffff',
      fontSize: toFinite(track?.style?.fontSize, 36),
      fontFamily: track?.style?.fontFamily || 'Georgia, serif',
      weight: track?.style?.weight || 700,
      align: track?.style?.align || 'center',
      imageUrl: track?.style?.imageUrl || '',
      background: track?.style?.background || 'transparent',
    },
    keys: sortedKeys(normalizeTrackCollection(track?.keys, (key, keyIdx) => normalizeOverlayKey(key, keyIdx))),
  }));

  const soundTracks = normalizeTrackCollection(raw.tracks?.sounds || base.tracks.sounds, (track, idx) => ({
    id: track?.id || uid('snd'),
    name: track?.name || `Audio ${idx + 1}`,
    keys: sortedKeys(normalizeTrackCollection(track?.keys, (key, keyIdx) => normalizeSoundKey(key, keyIdx))),
  }));

  const eventTracks = normalizeTrackCollection(raw.tracks?.events || base.tracks.events, (track, idx) => ({
    id: track?.id || uid('evt'),
    name: track?.name || `Events ${idx + 1}`,
    keys: sortedKeys(normalizeTrackCollection(track?.keys, (key, keyIdx) => normalizeEventKey(key, keyIdx))),
  }));

  const normalized = {
    ...base,
    ...raw,
    version: ARCANA_STUDIO_CARD_VERSION,
    id: raw.id || fallbackId,
    name: raw.name || raw.id || fallbackId,
    description: raw.description || '',
    durationMs: clampMs(raw.durationMs ?? raw.duration ?? base.durationMs),
    board: {
      fen: raw.board?.fen || base.board.fen,
      focusSquare: raw.board?.focusSquare || null,
    },
    settings: {
      ...base.settings,
      ...(raw.settings || {}),
      autoKey: (raw.settings?.autoKey ?? base.settings.autoKey) !== false,
      fps: Math.max(1, Math.min(240, toFinite(raw.settings?.fps, base.settings.fps))),
      timelineSnapMs: Math.max(1, clampMs(raw.settings?.timelineSnapMs ?? base.settings.timelineSnapMs)),
      randomSeed: Number.isInteger(raw.settings?.randomSeed) ? raw.settings.randomSeed : base.settings.randomSeed,
      seedLocked: raw.settings?.seedLocked ?? base.settings.seedLocked,
      previewMode: raw.settings?.previewMode === 'board' ? 'board' : 'plane',
      loopPlayback: raw.settings?.loopPlayback !== false,
    },
    tracks: {
      camera: cameraTracks.length ? cameraTracks : base.tracks.camera,
      objects: objectTracks,
      particles: particleTracks,
      overlays: overlayTracks,
      sounds: soundTracks.length ? soundTracks : base.tracks.sounds,
      events: eventTracks.length ? eventTracks : base.tracks.events,
    },
    meta: {
      ...base.meta,
      ...(raw.meta || {}),
      usedPieces: Array.isArray(raw.meta?.usedPieces) ? raw.meta.usedPieces : base.meta.usedPieces,
      tags: Array.isArray(raw.meta?.tags) ? raw.meta.tags : base.meta.tags,
      updatedAt: Date.now(),
    },
  };

  return normalized;
}

function readStoredMap(key) {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function loadArcanaStudioCardsMap() {
  const latest = readStoredMap(ARCANA_STUDIO_STORAGE_KEY);
  const legacy = LEGACY_STORAGE_KEYS.map(readStoredMap).find(Boolean);
  const source = latest || legacy || {};

  const normalized = {};
  Object.entries(source).forEach(([id, card]) => {
    normalized[id] = migrateArcanaStudioCard(card, id);
  });
  return normalized;
}

export function saveArcanaStudioCardsMap(cardsMap) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(ARCANA_STUDIO_STORAGE_KEY, JSON.stringify(cardsMap || {}));
  } catch (err) {
    console.warn('Arcana Studio: failed to save cards map', err);
  }
}

export function saveArcanaStudioCard(card) {
  const migrated = migrateArcanaStudioCard(card, card?.id || 'unnamed');
  const cards = loadArcanaStudioCardsMap();
  cards[migrated.id] = migrated;
  saveArcanaStudioCardsMap(cards);
  return migrated;
}

export function getStoredArcanaStudioCard(cardId) {
  const cards = loadArcanaStudioCardsMap();
  return cards[cardId] ? migrateArcanaStudioCard(cards[cardId], cardId) : null;
}
