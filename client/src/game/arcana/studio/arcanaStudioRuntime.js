import { sampleOverlayTrack } from './arcanaStudioPlayback.js';

const EVENT_SQUARE_KEYS = ['targetSquare', 'square', 'kingTo', 'rebornSquare'];

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeSquare(value) {
  if (typeof value !== 'string') return null;
  const s = value.toLowerCase();
  return /^[a-h][1-8]$/.test(s) ? s : null;
}

function sanitizeSquareList(value) {
  if (!Array.isArray(value)) return [];
  return value.map(sanitizeSquare).filter(Boolean);
}

function extractSquareSequence(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return sanitizeSquare(entry);
      if (entry && typeof entry === 'object') {
        return sanitizeSquare(entry.square || entry.rebornSquare || entry.targetSquare || entry.to || entry.from);
      }
      return null;
    })
    .filter(Boolean);
}

export function expandStudioRuntimePlaybackQueue(cardId, eventParams = {}) {
  const normalizedId = String(cardId || '');
  if (normalizedId !== 'astral_rebirth') {
    return [{ eventParams: { ...(eventParams || {}) } }];
  }

  const revivedSquares = extractSquareSequence(eventParams?.revivedSquares);
  const fallbackSquare = sanitizeSquare(eventParams?.rebornSquare)
    || sanitizeSquare(eventParams?.targetSquare)
    || sanitizeSquare(eventParams?.square)
    || sanitizeSquare(eventParams?.focusSquare);
  const queueSquares = revivedSquares.length > 0 ? revivedSquares : (fallbackSquare ? [fallbackSquare] : []);

  return queueSquares.map((square) => ({
    eventParams: {
      ...(eventParams || {}),
      targetSquare: square,
      square,
      rebornSquare: square,
      revivedSquares: [square],
      cameraAnchorSquare: square,
      cameraAnchorMode: 'piece',
    },
    cameraAnchorSquare: square,
  }));
}

function clampPercent(value, fallback = 50) {
  const n = Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(100, n));
}

export function resolveRuntimeSquare(alias, eventParams = {}, fallbackSquare = null) {
  if (!alias || typeof alias !== 'string') {
    return EVENT_SQUARE_KEYS.map((key) => sanitizeSquare(eventParams?.[key])).find(Boolean) || sanitizeSquare(fallbackSquare) || null;
  }

  const direct = sanitizeSquare(alias);
  if (direct) return direct;

  if (alias === 'target') {
    return EVENT_SQUARE_KEYS.map((key) => sanitizeSquare(eventParams?.[key])).find(Boolean) || sanitizeSquare(fallbackSquare) || null;
  }

  const dashMatch = /^dash(\d+)$/i.exec(alias);
  if (dashMatch && Array.isArray(eventParams?.dashPath)) {
    const idx = Math.max(0, Number(dashMatch[1]) - 1);
    return sanitizeSquare(eventParams.dashPath[idx]) || sanitizeSquare(fallbackSquare) || null;
  }

  const displacedMatch = /^displaced(\d+)$/i.exec(alias);
  if (displacedMatch && Array.isArray(eventParams?.displaced)) {
    const idx = Math.max(0, Number(displacedMatch[1]) - 1);
    return sanitizeSquare(eventParams.displaced[idx]?.to) || sanitizeSquare(fallbackSquare) || null;
  }

  return sanitizeSquare(fallbackSquare) || null;
}

export function getArcanaStudioCardDuration(card) {
  const trackSets = [
    ...(card?.tracks?.camera || []),
    ...(card?.tracks?.objects || []),
    ...(card?.tracks?.particles || []),
    ...(card?.tracks?.overlays || []),
    ...(card?.tracks?.sounds || []),
    ...(card?.tracks?.events || []),
  ];

  let durationMs = Math.max(0, Number(card?.durationMs) || 0);
  trackSets.forEach((track) => {
    (track?.keys || []).forEach((key) => {
      const timeMs = Number(key?.timeMs) || 0;
      const delayMs = Number(key?.delayMs) || 0;
      durationMs = Math.max(durationMs, timeMs, timeMs + delayMs);
    });
  });

  return durationMs;
}

export function resolveSoundPreviewUrl(soundId) {
  if (!soundId) return '';
  if (/^(https?:)?\//.test(soundId)) return soundId;
  if (soundId.startsWith('arcana:')) return `/sounds/arcana/${soundId.slice(7)}.mp3`;
  if (soundId.startsWith('music:')) return `/sounds/music/${soundId.slice(6)}.mp3`;
  return `/sounds/ui/${soundId}.mp3`;
}

export function getScreenOverlaySamples(card, timeMs) {
  const entries = (card?.tracks?.overlays || [])
    .filter((track) => (track?.space || 'screen') !== 'world')
    .map((track) => ({ track, sample: sampleOverlayTrack(track, timeMs) }))
    .filter((entry) => entry.sample);

  const byId = new Map(entries.map((entry) => [entry.track?.id, entry]));
  const cache = new Map();
  const visiting = new Set();

  const resolveEntry = (entry) => {
    const id = entry?.track?.id;
    if (!id) return entry;
    if (cache.has(id)) return cache.get(id);
    if (visiting.has(id)) return entry;

    visiting.add(id);
    const parentId = entry.track?.parentId || null;
    const parent = parentId ? byId.get(parentId) : null;
    const parentResolved = parent ? resolveEntry(parent) : null;

    const sample = entry.sample || {};
    const composedSample = {
      ...sample,
      x: clampPercent((parentResolved?.sample?.x ?? 0) + (sample.x ?? 50)),
      y: clampPercent((parentResolved?.sample?.y ?? 0) + (sample.y ?? 50)),
      opacity: Math.max(0, Math.min(1, (parentResolved?.sample?.opacity ?? 1) * (sample.opacity ?? 1))),
      scale: Math.max(0, (parentResolved?.sample?.scale ?? 1) * (sample.scale ?? 1)),
      rotation: (parentResolved?.sample?.rotation ?? 0) + (sample.rotation ?? 0),
    };

    const resolved = {
      ...entry,
      sample: composedSample,
      composedLayer: (parentResolved?.composedLayer || 0) + (entry.track?.layer || 0),
    };

    visiting.delete(id);
    cache.set(id, resolved);
    return resolved;
  };

  return entries.map((entry) => resolveEntry(entry)).sort((a, b) => (a.composedLayer || 0) - (b.composedLayer || 0));
}

export function scheduleArcanaStudioAudio(card, options = {}) {
  const { registerTimeout, soundManager, playheadMs = 0, startDelayMs = 0 } = options;
  const timers = [];
  const fallbackCardSoundId = (typeof card?.meta?.soundId === 'string' && card.meta.soundId.trim())
    ? card.meta.soundId.trim()
    : (card?.id ? `arcana:${card.id}` : '');

  const playAudioKey = (key) => {
    const primarySoundId = typeof key?.soundId === 'string' ? key.soundId.trim() : '';
    const playedPrimary = primarySoundId
      ? soundManager?.play?.(primarySoundId, {
          volume: key.volume,
          pitch: key.pitch,
          loop: key.loop,
        })
      : null;
    if (playedPrimary) return;
    if (!fallbackCardSoundId || fallbackCardSoundId === primarySoundId) return;
    soundManager?.play?.(fallbackCardSoundId, {
      volume: key.volume,
      pitch: key.pitch,
      loop: key.loop,
    });
  };

  (card?.tracks?.sounds || []).forEach((track) => {
    (track?.keys || []).forEach((key) => {
      const delay = Math.max(0, (Number(key.timeMs) || 0) - Math.max(0, Number(playheadMs) || 0) + Math.max(0, Number(startDelayMs) || 0));
      if (delay <= 1) {
        playAudioKey(key);
        return;
      }
      const timer = setTimeout(() => {
        playAudioKey(key);
      }, delay);
      timers.push(timer);
      registerTimeout?.(timer);
    });
  });

  return timers;
}

export function scheduleArcanaStudioEvents(card, options = {}) {
  const { eventParams, registerTimeout, onEvent, playheadMs = 0, startDelayMs = 0 } = options;
  const timers = [];

  const fireEventKey = (key) => {
    const mergedPayload = {
      ...(key.payload || {}),
      eventParams: eventParams || {},
    };
    const normalizedKey = {
      ...key,
      payload: mergedPayload,
    };
    const actions = normalizeArcanaStudioEventActions(normalizedKey);
    onEvent?.({
      ...normalizedKey,
      actions,
    });
  };

  (card?.tracks?.events || []).forEach((track) => {
    (track?.keys || []).forEach((key) => {
      const delay = Math.max(0, (Number(key.timeMs) || 0) + (Number(key.delayMs) || 0) - Math.max(0, Number(playheadMs) || 0) + Math.max(0, Number(startDelayMs) || 0));
      if (delay <= 1) {
        fireEventKey(key);
        return;
      }
      const timer = setTimeout(() => {
        fireEventKey(key);
      }, delay);
      timers.push(timer);
      registerTimeout?.(timer);
    });
  });

  return timers;
}

function resolveOverlayEffectName(type, payload = {}) {
  if (typeof payload.effect === 'string' && payload.effect.trim()) return payload.effect.trim();

  if (type.startsWith('overlay_')) {
    const suffix = type.slice('overlay_'.length);
    if (suffix === 'flash' || suffix === 'divine_flash' || suffix === 'astral_glow' || suffix === 'mind_flash') return 'flash';
    if (suffix.endsWith('_flash')) return 'flash';
    if (suffix === 'monochrome' || suffix === 'monochrome_fade' || suffix.includes('monochrome')) return 'monochrome';
    if (suffix === 'color_restore' || suffix.includes('color_restore')) return 'color-fade';
    if (suffix === 'vignette' || suffix.includes('vignette')) return 'vignette';
  }

  if (type.startsWith('overlay:')) {
    return type.slice('overlay:'.length) || 'flash';
  }

  return null;
}

function normalizeLegacyToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveLegacySoundAction(type, payload = {}) {
  if (!type.startsWith('sound_')) return '';
  if (typeof payload.soundId === 'string' && payload.soundId.trim()) return payload.soundId.trim();

  const token = type.slice('sound_'.length);
  if (!token) return '';
  const normalizedToken = normalizeLegacyToken(token);

  if (payload?.soundMap && typeof payload.soundMap === 'object') {
    const entries = Object.entries(payload.soundMap);
    for (const [key, value] of entries) {
      const normalizedKey = normalizeLegacyToken(key);
      if (!normalizedKey) continue;
      if (normalizedKey === normalizedToken || normalizedKey.includes(normalizedToken) || normalizedToken.includes(normalizedKey)) {
        return String(value || '');
      }
    }
  }

  return '';
}

function resolveLegacyVfxOverlay(type, payload = {}) {
  if (!type.startsWith('vfx_')) return null;
  const token = type.slice('vfx_'.length);
  const normalized = normalizeLegacyToken(token);

  if (normalized.includes('flash') || normalized.includes('burst') || normalized.includes('explosion') || normalized.includes('impact') || normalized.includes('slice')) {
    return {
      effect: 'flash',
      color: payload.color || '#ffffff',
      intensity: Math.max(0, Math.min(1, toNumber(payload.intensity, 0.85))),
      duration: Math.max(100, toNumber(payload.duration, 520)),
      fadeIn: Math.max(0, toNumber(payload.fadeIn, 110)),
      hold: Math.max(0, toNumber(payload.hold, 210)),
      fadeOut: Math.max(0, toNumber(payload.fadeOut, 180)),
    };
  }

  if (normalized.includes('glow') || normalized.includes('aura') || normalized.includes('beam') || normalized.includes('light')) {
    return {
      effect: 'vignette',
      color: payload.color || '#ffffff',
      intensity: Math.max(0, Math.min(1, toNumber(payload.intensity, 0.72))),
      duration: Math.max(100, toNumber(payload.duration, 900)),
      fadeIn: Math.max(0, toNumber(payload.fadeIn, 140)),
      hold: Math.max(0, toNumber(payload.hold, 360)),
      fadeOut: Math.max(0, toNumber(payload.fadeOut, 260)),
    };
  }

  return {
    effect: 'flash',
    color: payload.color || '#cfe8ff',
    intensity: Math.max(0, Math.min(1, toNumber(payload.intensity, 0.6))),
    duration: Math.max(100, toNumber(payload.duration, 420)),
    fadeIn: Math.max(0, toNumber(payload.fadeIn, 80)),
    hold: Math.max(0, toNumber(payload.hold, 160)),
    fadeOut: Math.max(0, toNumber(payload.fadeOut, 160)),
  };
}

export function normalizeArcanaStudioEventActions(eventKey) {
  if (!eventKey || typeof eventKey !== 'object') return [];
  const typeRaw = typeof eventKey.type === 'string' ? eventKey.type.trim() : '';
  if (!typeRaw) return [];

  const type = typeRaw.toLowerCase();
  const payload = typeof eventKey.payload === 'object' && eventKey.payload ? eventKey.payload : {};
  const actions = [];

  if (type === 'highlight_squares' || type === 'highlight:set' || type === 'highlight') {
    const squares = sanitizeSquareList(payload.squares || payload.targets || payload.moves);
    if (squares.length) {
      actions.push({
        kind: 'highlight',
        squares,
        color: payload.color || '#88c0d0',
        durationMs: Math.max(0, toNumber(payload.durationMs ?? payload.duration, 0)),
      });
    }
  }

  if (type === 'sound_play' || type === 'sound:play') {
    const soundId = payload.soundId || payload.sound || payload.id || '';
    if (soundId) {
      actions.push({
        kind: 'sound',
        soundId,
        volume: toNumber(payload.volume, 1),
        pitch: toNumber(payload.pitch, 1),
        loop: Boolean(payload.loop),
      });
    }
  }

  if (type === 'vfx_play' || type === 'vfx:play') {
    const arcanaId = (typeof payload.arcanaId === 'string' && payload.arcanaId.trim())
      || (typeof payload.cardId === 'string' && payload.cardId.trim())
      || (typeof payload.eventParams?.cardId === 'string' && payload.eventParams.cardId.trim())
      || null;
    if (arcanaId) {
      const fallbackSquare = payload.targetSquare
        || payload.square
        || payload.eventParams?.targetSquare
        || payload.eventParams?.square
        || null;
      const square = resolveRuntimeSquare(payload.square || payload.targetSquare || 'target', payload.eventParams || {}, fallbackSquare);
      actions.push({
        kind: 'vfx',
        arcanaId,
        params: square ? { ...payload, square } : { ...payload },
        durationMs: Math.max(100, toNumber(payload.durationMs ?? payload.duration, 1200)),
        vfxKey: String(payload.vfxKey || payload.effect || arcanaId),
      });
    }
  }

  if (type.startsWith('sound_')) {
    const soundId = resolveLegacySoundAction(type, payload);
    if (soundId) {
      actions.push({
        kind: 'sound',
        soundId,
        volume: toNumber(payload.volume, 1),
        pitch: toNumber(payload.pitch, 1),
        loop: Boolean(payload.loop),
      });
    }
  }

  if (type === 'camera_cutscene' || type === 'camera:focus') {
    const square = resolveRuntimeSquare(payload.square || payload.anchor, payload.eventParams || {}, payload.targetSquare || null);
    if (square) {
      actions.push({
        kind: 'camera',
        square,
        options: {
          zoom: toNumber(payload.zoom, 1.6),
          holdDuration: Math.max(100, toNumber(payload.holdDuration, 1000)),
          duration: Math.max(100, toNumber(payload.duration, 650)),
          returnDuration: Math.max(100, toNumber(payload.returnDuration, 650)),
          lookAtYOffset: toNumber(payload.lookAtYOffset, 0),
        },
      });
    }
  }

  // Legacy cutscene cards imported from phase actions emit camera_* tokens.
  // Translate them into runtime camera actions so old cards still animate.
  if (type === 'camera_move' || type === 'camera_focus' || type === 'camera_lock' || type === 'camera_return') {
    const square = resolveRuntimeSquare(payload.square || payload.anchor || 'target', payload.eventParams || {}, payload.targetSquare || null);
    if (square) {
      actions.push({
        kind: 'camera',
        square,
        options: {
          zoom: toNumber(payload.zoom, 1.55),
          holdDuration: Math.max(120, toNumber(payload.holdDuration, 1100)),
          duration: Math.max(120, toNumber(payload.duration, 650)),
          returnDuration: Math.max(120, toNumber(payload.returnDuration, 650)),
          lookAtYOffset: toNumber(payload.lookAtYOffset, 0),
        },
      });
    }
  }

  const overlayEffect = resolveOverlayEffectName(type, payload);
  if (overlayEffect) {
    actions.push({
      kind: 'overlay',
      effect: overlayEffect,
      color: payload.color || '#ffffff',
      intensity: Math.max(0, Math.min(1, toNumber(payload.intensity, 0.9))),
      duration: Math.max(100, toNumber(payload.duration, 900)),
      fadeIn: Math.max(0, toNumber(payload.fadeIn, 160)),
      hold: Math.max(0, toNumber(payload.hold, 380)),
      fadeOut: Math.max(0, toNumber(payload.fadeOut, 240)),
    });
  }

  const vfxOverlay = resolveLegacyVfxOverlay(type, payload);
  if (vfxOverlay) {
    actions.push({ kind: 'overlay', ...vfxOverlay });

    const arcanaId = (typeof payload.arcanaId === 'string' && payload.arcanaId.trim())
      || (typeof payload.cardId === 'string' && payload.cardId.trim())
      || (typeof payload.eventParams?.cardId === 'string' && payload.eventParams.cardId.trim())
      || null;

    if (arcanaId) {
      const fallbackSquare = payload.targetSquare
        || payload.square
        || payload.eventParams?.targetSquare
        || payload.eventParams?.square
        || 'e4';
      const square = resolveRuntimeSquare(payload.square || payload.targetSquare || 'target', payload.eventParams || {}, fallbackSquare);
      actions.push({
        kind: 'vfx',
        arcanaId,
        params: square ? { ...payload, square } : { ...payload },
        durationMs: Math.max(100, toNumber(payload.durationMs ?? payload.duration, 1200)),
        vfxKey: String(payload.vfxKey || type || arcanaId),
      });
    }
  }

  if (type === 'log' || type === 'combat_log' || type === 'status_log') {
    const text = payload.text || payload.message;
    if (typeof text === 'string' && text.trim()) {
      actions.push({ kind: 'log', text: text.trim() });
    }
  }

  return actions;
}

export function createArcanaStudioRuntimeSession(card, eventParams = {}) {
  const now = performance.now();
  return {
    id: `studio_runtime_${card?.id || 'unknown'}_${Math.round(now)}`,
    card,
    eventParams,
    startedAt: now,
    durationMs: getArcanaStudioCardDuration(card),
  };
}
