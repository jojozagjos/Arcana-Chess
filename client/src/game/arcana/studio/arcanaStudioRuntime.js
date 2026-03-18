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
  return (card?.tracks?.overlays || [])
    .filter((track) => (track?.space || 'screen') !== 'world')
    .map((track) => ({ track, sample: sampleOverlayTrack(track, timeMs) }))
    .filter((entry) => entry.sample);
}

export function scheduleArcanaStudioAudio(card, options = {}) {
  const { registerTimeout, soundManager } = options;
  const timers = [];

  (card?.tracks?.sounds || []).forEach((track) => {
    (track?.keys || []).forEach((key) => {
      const delay = Math.max(0, Number(key.timeMs) || 0);
      const timer = setTimeout(() => {
        if (!key.soundId) return;
        soundManager?.play?.(key.soundId, {
          volume: key.volume,
          pitch: key.pitch,
          loop: key.loop,
        });
      }, delay);
      timers.push(timer);
      registerTimeout?.(timer);
    });
  });

  return timers;
}

export function scheduleArcanaStudioEvents(card, options = {}) {
  const { eventParams, registerTimeout, onEvent } = options;
  const timers = [];

  (card?.tracks?.events || []).forEach((track) => {
    (track?.keys || []).forEach((key) => {
      const delay = Math.max(0, (Number(key.timeMs) || 0) + (Number(key.delayMs) || 0));
      const timer = setTimeout(() => {
        onEvent?.({
          ...key,
          payload: {
            ...(key.payload || {}),
            eventParams: eventParams || {},
          },
        });
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
    if (suffix === 'monochrome' || suffix === 'monochrome_fade') return 'monochrome';
    if (suffix === 'color_restore') return 'color-fade';
  }

  if (type.startsWith('overlay:')) {
    return type.slice('overlay:'.length) || 'flash';
  }

  return null;
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
