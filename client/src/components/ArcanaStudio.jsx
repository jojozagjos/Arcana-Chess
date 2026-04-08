import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, TransformControls } from '@react-three/drei';
import { ChessPiece } from './ChessPiece.jsx';
import { ArcanaStudioTutorial } from './ArcanaStudioTutorial.jsx';
import {
  createEmptyArcanaStudioCard,
  loadArcanaStudioCardsMap,
  migrateArcanaStudioCard,
  saveArcanaStudioCardsMap,
} from '../game/arcana/studio/arcanaStudioSchema.js';
import {
  collectTimelineRows,
  sampleCameraTrack,
  sampleObjectTrack,
  sampleOverlayTrack,
  sampleParticleTrack,
} from '../game/arcana/studio/arcanaStudioPlayback.js';
import {
  getScreenOverlaySamples,
  normalizeArcanaStudioEventActions,
  resolveSoundPreviewUrl,
  scheduleArcanaStudioAudio,
  scheduleArcanaStudioEvents,
} from '../game/arcana/studio/arcanaStudioRuntime.js';
import { getAllCutsceneCards, getAllCutsceneConfigs } from '../game/arcana/cutsceneDefinitions.js';
import { legacyCutsceneToArcanaStudioCard } from '../game/arcana/studio/arcanaStudioBridge.js';
import { buildParticlePreviewPoints, buildStudioParticleTracksFromLegacy } from '../game/arcana/studio/arcanaStudioVfxPresets.js';
import { getArcanaDefinition, listArcanaDefinitions, toStudioArcanaId } from '../game/arcanaCatalog.js';
import { soundManager } from '../game/soundManager.js';
import { squareToPosition } from '../game/arcana/sharedHelpers.jsx';
import './styles/ArcanaStudio.css';

const DEFAULT_WORLD_ANCHOR = [0, 0.075, 0];
const EASINGS = ['linear', 'instant', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'customBezier'];
const TRACK_TYPES = ['camera', 'object', 'particle', 'overlay', 'sound'];
const LEGACY_CUTSCENE_CONFIGS = getAllCutsceneConfigs();
const GAME_ARCANA_DEFINITIONS = listArcanaDefinitions();
const RARITY_ORDER = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
  '???': 6,
};

const RARITY_COLOR = {
  common: '#b9c8da',
  uncommon: '#76df8f',
  rare: '#64a8ff',
  epic: '#c688ff',
  legendary: '#ffbf6f',
  '???': '#ff7a9c',
};

const PARTICLE_PRESETS = {
  arcane_burst: {
    label: 'Arcane Burst',
    params: {
      emissionRate: 32,
      burstCount: 8,
      velocityMin: 0.5,
      velocityMax: 2.0,
      lifetimeMin: 0.18,
      lifetimeMax: 1.0,
      spawnShape: 'sphere',
      spawnRadius: 0.36,
      noiseStrength: 0.22,
      noiseFrequency: 1.6,
      colorOverLife: ['#a6e4ff', '#61b7ff', '#2b58ff'],
      sizeOverLife: [1, 0.72, 0.08],
      gravity: [0, -7, 0],
      drag: 0.08,
    },
  },
  ember_surge: {
    label: 'Ember Surge',
    params: {
      emissionRate: 44,
      burstCount: 16,
      velocityMin: 0.6,
      velocityMax: 2.35,
      lifetimeMin: 0.15,
      lifetimeMax: 0.85,
      spawnShape: 'cone',
      spawnRadius: 0.32,
      noiseStrength: 0.36,
      noiseFrequency: 1.9,
      colorOverLife: ['#ffeabf', '#ffb96a', '#ff5d5d'],
      sizeOverLife: [1.08, 0.8, 0.1],
      gravity: [0, -8, 0],
      drag: 0.07,
    },
  },
  astral_ring: {
    label: 'Astral Ring',
    params: {
      emissionRate: 28,
      burstCount: 4,
      velocityMin: 0.3,
      velocityMax: 1.1,
      lifetimeMin: 0.45,
      lifetimeMax: 1.8,
      spawnShape: 'ring',
      spawnRadius: 0.58,
      noiseStrength: 0.18,
      noiseFrequency: 1.2,
      colorOverLife: ['#f5e4ff', '#bf95ff', '#5d3cff'],
      sizeOverLife: [0.95, 0.66, 0.2],
      gravity: [0, -2.4, 0],
      drag: 0.11,
    },
  },
  toxic_cloud: {
    label: 'Toxic Cloud',
    params: {
      emissionRate: 24,
      burstCount: 0,
      velocityMin: 0.15,
      velocityMax: 0.75,
      lifetimeMin: 0.9,
      lifetimeMax: 2.4,
      spawnShape: 'box',
      spawnRadius: 0.42,
      noiseStrength: 0.26,
      noiseFrequency: 1.05,
      colorOverLife: ['#d2ffd4', '#72e49d', '#218666'],
      sizeOverLife: [1.22, 1.0, 0.52],
      gravity: [0, -1.2, 0],
      drag: 0.22,
    },
  },
};

const PARTICLE_SPAWN_SHAPES = new Set(['sphere', 'ring', 'cone', 'box']);

const CORE_GAME_EVENT_TYPES = [
  'highlight_squares',
  'highlight:set',
  'highlight',
  'sound_play',
  'sound:play',
  'camera_cutscene',
  'camera:focus',
  'camera_move',
  'camera_focus',
  'camera_lock',
  'camera_return',
  'overlay_flash',
  'overlay_monochrome',
  'overlay_vignette',
  'overlay_color_restore',
  'log',
  'combat_log',
  'status_log',
];

const KNOWN_GAME_EVENT_TYPES = (() => {
  const set = new Set(CORE_GAME_EVENT_TYPES);
  Object.values(LEGACY_CUTSCENE_CONFIGS || {}).forEach((legacy) => {
    (legacy?.config?.phases || []).forEach((phase) => {
      (phase?.actions || []).forEach((action) => {
        if (typeof action === 'string' && action.trim()) {
          set.add(action.trim());
        }
      });
    });
  });
  return [...set].sort();
})();

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function addVec3(a = [0, 0, 0], b = [0, 0, 0]) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function parseFenPieces(fenStr) {
  if (!fenStr || typeof fenStr !== 'string') return [];
  const [placement] = fenStr.split(' ');
  const rows = placement.split('/');
  const pieces = [];
  for (let rankIndex = 0; rankIndex < rows.length; rankIndex += 1) {
    const row = rows[rankIndex] || '';
    let file = 0;
    for (const char of row) {
      if (/\d/.test(char)) {
        file += Number(char);
      } else {
        const square = `${'abcdefgh'[file]}${8 - rankIndex}`;
        const [x, , z] = squareToPosition(square);
        pieces.push({
          square,
          type: char.toLowerCase(),
          isWhite: char === char.toUpperCase(),
          targetPosition: [x, 0.075, z],
        });
        file += 1;
      }
    }
  }
  return pieces;
}

function squareToPiece(square, type = 'p', isWhite = true) {
  if (!/^[a-h][1-8]$/i.test(square || '')) return null;
  const [x, , z] = squareToPosition(square.toLowerCase());
  return {
    square: square.toLowerCase(),
    type,
    isWhite,
    targetPosition: [x, 0.075, z],
  };
}

function inferPieceTypeFromCard(cardId = '') {
  const lower = String(cardId).toLowerCase();
  if (lower.includes('knight')) return 'n';
  if (lower.includes('bishop')) return 'b';
  if (lower.includes('rook')) return 'r';
  if (lower.includes('queen')) return 'q';
  if (lower.includes('king')) return 'k';
  return 'p';
}

function normalizeRarity(rarity = '') {
  const normalized = String(rarity || '').toLowerCase();
  return Object.prototype.hasOwnProperty.call(RARITY_ORDER, normalized) ? normalized : 'common';
}

function normalizeCategory(category = '') {
  const normalized = String(category || '').trim().toLowerCase();
  return normalized || 'uncategorized';
}

function getCardRarity(card = {}, definition = null) {
  if (typeof definition?.rarity === 'string' && definition.rarity.trim()) return normalizeRarity(definition.rarity);
  if (typeof card?.meta?.rarity === 'string' && card.meta.rarity.trim()) return normalizeRarity(card.meta.rarity);
  return 'common';
}

function compareLibraryCards([idA, cardA], [idB, cardB]) {
  const defA = findDefinitionById(idA);
  const defB = findDefinitionById(idB);
  const isCutsceneA = Boolean(cardA?.meta?.isCutscene || defA?.visual?.cutscene);
  const isCutsceneB = Boolean(cardB?.meta?.isCutscene || defB?.visual?.cutscene);
  if (isCutsceneA !== isCutsceneB) return isCutsceneA ? -1 : 1;

  const rarityA = getCardRarity(cardA, defA);
  const rarityB = getCardRarity(cardB, defB);
  const rarityDiff = (RARITY_ORDER[rarityA] || 999) - (RARITY_ORDER[rarityB] || 999);
  if (rarityDiff !== 0) return rarityDiff;

  const categoryA = normalizeCategory(defA?.category || cardA?.meta?.category);
  const categoryB = normalizeCategory(defB?.category || cardB?.meta?.category);
  const categoryDiff = categoryA.localeCompare(categoryB);
  if (categoryDiff !== 0) return categoryDiff;

  const nameA = cardA?.name || defA?.name || idA;
  const nameB = cardB?.name || defB?.name || idB;
  return nameA.localeCompare(nameB);
}

function createDefaultSoundTrack(soundId = 'arcana:shield_pawn') {
  return {
    id: uid('snd'),
    name: 'Card SFX',
    active: true,
    keys: [{ id: uid('sdk'), timeMs: 0, soundId, volume: 1, pitch: 1, loop: false }],
  };
}

function trackCollectionName(type) {
  switch (type) {
    case 'camera': return 'camera';
    case 'object': return 'objects';
    case 'particle': return 'particles';
    case 'overlay': return 'overlays';
    case 'sound': return 'sounds';
    case 'event': return 'events';
    default: return 'objects';
  }
}

function safeJsonParse(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function sanitizeColorList(list, fallback = ['#9ad7ff', '#4cb6ff', '#1f4fff']) {
  if (!Array.isArray(list) || list.length === 0) return [...fallback];
  const colors = list
    .map((entry) => String(entry || '').trim())
    .filter((entry) => /^#[0-9a-fA-F]{6}$/.test(entry));
  return colors.length ? colors.slice(0, 8) : [...fallback];
}

function sanitizeVec3(value, fallback = [0, -6, 0]) {
  if (!Array.isArray(value)) return [...fallback];
  const next = value.slice(0, 3).map((item, idx) => clamp(toFiniteNumber(item, fallback[idx] || 0), -60, 60));
  while (next.length < 3) next.push(fallback[next.length] || 0);
  return next;
}

function sanitizeNumberCurve(value, fallback = [1, 0.7, 0], minLen = 2, maxLen = 8, min = 0, max = 5) {
  if (!Array.isArray(value)) return [...fallback];
  const next = value
    .map((item) => clamp(toFiniteNumber(item, 0), min, max))
    .slice(0, maxLen);
  if (next.length < minLen) return [...fallback];
  return next;
}

function sanitizeParticleParams(rawParams = {}) {
  const params = rawParams || {};
  const velocityMin = clamp(toFiniteNumber(params.velocityMin, 0.35), 0, 25);
  const lifetimeMin = clamp(toFiniteNumber(params.lifetimeMin, 0.05), 0.02, 20);
  const noiseStrength = clamp(toFiniteNumber(params.noiseStrength, 0.2), 0, 5);
  return {
    ...params,
    emissionRate: clamp(toFiniteNumber(params.emissionRate, 30), 0, 500),
    burstCount: clamp(Math.round(toFiniteNumber(params.burstCount, 0)), 0, 600),
    velocityMin,
    velocityMax: clamp(toFiniteNumber(params.velocityMax, Math.max(velocityMin + 0.05, 1.2)), velocityMin + 0.01, 30),
    lifetimeMin,
    lifetimeMax: clamp(toFiniteNumber(params.lifetimeMax, Math.max(lifetimeMin + 0.05, 1.2)), lifetimeMin + 0.01, 24),
    spawnShape: PARTICLE_SPAWN_SHAPES.has(params.spawnShape) ? params.spawnShape : 'sphere',
    spawnRadius: clamp(toFiniteNumber(params.spawnRadius, 0.35), 0.01, 8),
    noiseStrength,
    noiseFrequency: clamp(toFiniteNumber(params.noiseFrequency, 1.4), 0.1, 10),
    drag: clamp(toFiniteNumber(params.drag, 0.08), 0, 4),
    gravity: sanitizeVec3(params.gravity, [0, -6, 0]),
    sizeOverLife: sanitizeNumberCurve(params.sizeOverLife, [1, 0.7, 0.1], 2, 8, 0, 4),
    colorOverLife: sanitizeColorList(params.colorOverLife, ['#9ad7ff', '#4cb6ff', '#1f4fff']),
  };
}

function getParticleCompatibilityWarnings(params = {}) {
  const warnings = [];
  const p = sanitizeParticleParams(params);
  const approxLoad = p.emissionRate + p.burstCount * 0.8;
  if (approxLoad > 240) warnings.push('High particle load may diverge from runtime FPS on lower-end devices.');
  if (p.lifetimeMax > 6) warnings.push('Very long lifetime can cause trails to stack more in-game than in editor preview.');
  if (p.velocityMax > 10) warnings.push('High velocity may clip through camera framing during cutscenes.');
  if (Math.abs(p.gravity[1]) > 20) warnings.push('Extreme gravity can collapse motion arcs and look unnatural in gameplay context.');
  if (p.noiseStrength > 1.6 && p.noiseFrequency > 4) warnings.push('High noise strength + frequency can appear jittery at runtime.');
  if (!Array.isArray(params?.colorOverLife) || params.colorOverLife.length < 2) warnings.push('Using at least 2 colors improves preview/runtime visual parity.');
  return warnings;
}

function createParticlePresetParams(presetId = 'arcane_burst') {
  const preset = PARTICLE_PRESETS[presetId] || PARTICLE_PRESETS.arcane_burst;
  const params = preset?.params || PARTICLE_PRESETS.arcane_burst.params;
  return sanitizeParticleParams({
    ...params,
    sizeOverLife: [...(params.sizeOverLife || [1, 0.7, 0])],
    colorOverLife: [...(params.colorOverLife || ['#9ad7ff', '#4cb6ff', '#1f4fff'])],
    gravity: [...(params.gravity || [0, -6, 0])],
  });
}

function normalizeStudioSoundId(rawSoundId = '') {
  const value = String(rawSoundId || '').trim();
  if (!value) return '';

  if (/^(https?:)?\//.test(value) || value.startsWith('./') || value.startsWith('../') || value.endsWith('.mp3') || value.endsWith('.ogg') || value.endsWith('.wav')) {
    return value;
  }

  if (value.startsWith('arcana:') || value.startsWith('music:')) return value;

  if (value.startsWith('arcana/')) return `arcana:${value.slice('arcana/'.length)}`;
  if (value.startsWith('music/')) return `music:${value.slice('music/'.length)}`;
  if (value.startsWith('ui:')) return value.slice(3);
  if (value.startsWith('ui/')) return value.slice(3);

  if (soundManager.sounds?.[value]) return value;
  if (soundManager.sounds?.[`arcana:${value}`]) return `arcana:${value}`;
  if (soundManager.musicTracks?.[`music:${value}`]) return `music:${value}`;
  return value;
}

function makeCardFromGameCard(gameCard, isCutscene = false, forceId = null) {
  const id = forceId || gameCard.id;
  const next = createEmptyArcanaStudioCard(id);
  next.id = id;
  next.name = gameCard.name || id;
  next.description = gameCard.description || '';
  next.meta = {
    ...(next.meta || {}),
    isCutscene,
    cardPiecePreview: gameCard.cardPiecePreview || null,
    rarity: gameCard.rarity || 'common',
    category: gameCard.category || 'utility',
    soundKey: gameCard.soundKey || null,
  };

  if (gameCard.soundKey && (!next.tracks?.sounds || next.tracks.sounds.length === 0)) {
    next.tracks = {
      ...(next.tracks || {}),
      sounds: [createDefaultSoundTrack(gameCard.soundKey)],
    };
  }

  return next;
}

function normalizeCardId(cardId = '') {
  return toStudioArcanaId(cardId);
}

function findDefinitionById(cardId = '') {
  return getArcanaDefinition(cardId);
}

function getCardDescription(card = {}) {
  if (card.description) return card.description;
  return findDefinitionById(card.id)?.description || '';
}

function isDefinitionCutscene(cardId = '') {
  return Boolean(findDefinitionById(cardId)?.visual?.cutscene);
}

function hasMeaningfulCutsceneData(card = {}) {
  const cameraKeys = (card.tracks?.camera || []).reduce((acc, track) => acc + (track.keys || []).length, 0);
  const particleKeys = (card.tracks?.particles || []).reduce((acc, track) => acc + (track.keys || []).length, 0);
  const overlayKeys = (card.tracks?.overlays || []).reduce((acc, track) => acc + (track.keys || []).length, 0);
  const soundKeys = (card.tracks?.sounds || []).reduce((acc, track) => acc + (track.keys || []).length, 0);
  return cameraKeys > 1 || particleKeys > 0 || overlayKeys > 0 || soundKeys > 0;
}

function hasLegacyVfxData(config) {
  const vfx = config?.config?.vfx;
  return Boolean(vfx && typeof vfx === 'object' && Object.keys(vfx).length > 0);
}

function getAllAvailableCards() {
  const cards = {};
  const cutsceneIds = new Set(
    (GAME_ARCANA_DEFINITIONS || [])
      .filter((entry) => Boolean(entry.visual?.cutscene))
      .map((entry) => normalizeCardId(entry.id)),
  );

  const cutsceneCards = getAllCutsceneCards();
  const legacyCutsceneConfigs = getAllCutsceneConfigs();
  cutsceneIds.forEach((id) => {
    let card = cutsceneCards?.[id];
    if (!hasMeaningfulCutsceneData(card) && legacyCutsceneConfigs?.[id]) {
      card = legacyCutsceneToArcanaStudioCard(legacyCutsceneConfigs[id], { id });
    }
    if (!card) return;
    const migrated = migrateArcanaStudioCard(card, id);
    migrated.id = id;
    const definition = findDefinitionById(id);
    migrated.name = migrated.name || definition?.name || id;
    migrated.description = migrated.description || definition?.description || '';
    migrated.meta = { ...(migrated.meta || {}), isCutscene: true };
    cards[id] = migrated;
  });

  (GAME_ARCANA_DEFINITIONS || []).forEach((gameCard) => {
    const id = normalizeCardId(gameCard.id);
    const isCutscene = Boolean(gameCard.visual?.cutscene);
    if (!cards[id]) {
      cards[id] = makeCardFromGameCard({ ...gameCard, id }, isCutscene, id);
    } else {
      cards[id].name = cards[id].name || gameCard.name || id;
      cards[id].description = cards[id].description || gameCard.description || '';
      cards[id].meta = { ...(cards[id].meta || {}), isCutscene };
    }

    if (!isCutscene) {
      cards[id].tracks = {
        ...(cards[id].tracks || {}),
        camera: [],
      };
    }
  });

  return cards;
}

function sanitizeCardForStudio(rawCard, fallbackId = 'new_card') {
  const id = normalizeCardId(rawCard?.id || fallbackId);
  const migrated = migrateArcanaStudioCard(rawCard, id);
  const definition = findDefinitionById(id);
  const isCutscene = Boolean(definition?.visual?.cutscene);
  const legacyCutscene = LEGACY_CUTSCENE_CONFIGS?.[id] || LEGACY_CUTSCENE_CONFIGS?.[(id === 'filtered_cycle' ? 'arcane_cycle' : id)] || null;

  const tracks = { ...(migrated.tracks || {}) };
  let objects = [...(tracks.objects || [])];
  if (!objects.length) {
    objects = [createDefaultTrack('object', 0, '', id)];
  }

  const pieceTrackIndex = objects.findIndex((track) => track?.type === 'piece');
  if (pieceTrackIndex < 0) {
    objects.unshift(createDefaultTrack('object', 0, '', id));
  } else if (pieceTrackIndex > 0) {
    const [main] = objects.splice(pieceTrackIndex, 1);
    objects.unshift(main);
  }

  const mainPiece = objects[0] || createDefaultTrack('object', 0, '', id);
  const normalizedMainPieceKeys = Array.isArray(mainPiece.keys)
    ? mainPiece.keys.map((key) => ({
      ...key,
      scale: Array.isArray(key?.scale) && key.scale.length >= 3
        ? key.scale
        : [1.8, 1.8, 1.8],
    }))
    : [];
  objects[0] = {
    ...mainPiece,
    id: mainPiece.id || uid('obj'),
    name: 'Main Piece',
    type: 'piece',
    pieceSquare: '',
    pieceType: mainPiece.pieceType || inferPieceTypeFromCard(id),
    pieceColor: mainPiece.pieceColor || 'white',
    isAnimatablePiece: true,
    attach: { mode: 'world-space', targetId: null, parentId: null, offset: [0, 0, 0], parenting: false },
    keys: normalizedMainPieceKeys,
  };

  let particles = [...(tracks.particles || [])];
  if (id === 'filtered_cycle' && !hasLegacyVfxData(legacyCutscene)) {
    particles = particles.filter((track) => !String(track?.id || '').startsWith('pt_filtered_cycle_'));
  }
  if (particles.length === 0) {
    const importedTracks = buildStudioParticleTracksFromLegacy({
      cardId: id,
      legacyConfig: legacyCutscene?.config || null,
      durationMs: migrated.durationMs,
      objectTrackId: objects[0]?.id || null,
    });
    if (importedTracks.length > 0) {
      particles = importedTracks;
    }
  }

  const defaultParticleKey = createDefaultTrack('particle', 0, '', id).keys?.[0] || null;
  particles = particles.map((track, index) => ({
    ...track,
    id: track?.id || uid('pt'),
    name: track?.name || `Particle ${index + 1}`,
    attach: {
      ...(track?.attach || {}),
      mode: track?.attach?.mode || 'follow',
      targetId: track?.attach?.targetId || objects[0]?.id || null,
      offset: Array.isArray(track?.attach?.offset) ? track.attach.offset : [0, 0, 0],
    },
    keys: Array.isArray(track?.keys) && track.keys.length > 0
      ? track.keys
      : (defaultParticleKey ? [{ ...defaultParticleKey, id: uid('ptk') }] : []),
  }));

  tracks.objects = objects;
  tracks.particles = particles;
  tracks.camera = isCutscene ? [...(tracks.camera || [])] : [];

  if ((!tracks.sounds || tracks.sounds.length === 0) && definition?.soundKey) {
    tracks.sounds = [createDefaultSoundTrack(definition.soundKey)];
  }

  return {
    ...migrated,
    id,
    name: migrated.name || definition?.name || id,
    description: migrated.description || definition?.description || '',
    tracks,
    meta: {
      ...(migrated.meta || {}),
      isCutscene,
      rarity: definition?.rarity || migrated.meta?.rarity || 'common',
      category: definition?.category || migrated.meta?.category || 'utility',
      soundKey: definition?.soundKey || migrated.meta?.soundKey || null,
    },
  };
}

function buildStudioCardsMap(options = {}) {
  const { includeStored = true } = options;
  const base = getAllAvailableCards();
  const storedCards = includeStored ? loadArcanaStudioCardsMap() : {};
  const normalized = {};

  Object.entries(base).forEach(([id, card]) => {
    normalized[id] = sanitizeCardForStudio(card, id);
  });

  Object.entries(storedCards || {}).forEach(([id, card]) => {
    normalized[id] = sanitizeCardForStudio(card, id);
  });

  (GAME_ARCANA_DEFINITIONS || []).forEach((definition) => {
    const id = normalizeCardId(definition.id);
    if (!normalized[id]) {
      normalized[id] = sanitizeCardForStudio(makeCardFromGameCard({ ...definition, id }, Boolean(definition.visual?.cutscene), id), id);
    }
  });

  return normalized;
}

function createDefaultTrack(type, playheadMs = 0, pieceSquare = 'e4', cardId = '') {
  if (type === 'camera') {
    return {
      id: uid('cam'),
      name: 'Main Camera',
      active: true,
      keys: [{
        id: uid('camk'),
        timeMs: playheadMs,
        position: [7, 8, 7],
        target: [0, 0, 0],
        fov: 55,
        easing: 'easeInOutCubic',
        blendMode: 'curve',
        bezier: [0.25, 0.1, 0.25, 1],
      }],
    };
  }

  if (type === 'object') {
    return {
      id: uid('obj'),
      name: 'Main Piece',
      active: true,
      type: 'piece',
      parentId: null,
      layer: 0,
      pieceSquare: '',
      pieceType: inferPieceTypeFromCard(cardId),
      pieceColor: 'white',
      clipName: null,
      clipOffsetMs: 0,
      clipLoop: true,
      previewPlayAnimation: false,
      isAnimatablePiece: true,
      attach: { mode: 'world-space', targetId: null, parentId: null, offset: [0, 0, 0], parenting: false },
      keys: [],
    };
  }

  if (type === 'particle') {
    const defaultPreset = createParticlePresetParams('arcane_burst');
    const seed = 1337 + Math.floor(Math.random() * 100000);
    return {
      id: uid('pt'),
      name: 'Particle FX',
      active: true,
      attach: { mode: 'follow', targetId: null, parentId: null, offset: [0, 0, 0], parenting: true },
      params: sanitizeParticleParams(defaultPreset),
      keys: [{ id: uid('ptk'), timeMs: playheadMs, enabled: true, seed, easing: 'linear', overrides: {} }],
    };
  }

  if (type === 'overlay') {
    return {
      id: uid('ov'),
      name: 'Overlay',
      active: true,
      type: 'text',
      space: 'screen',
      content: 'Arcana!',
      pieceSquare,
      attach: { mode: 'follow', targetId: null, offset: [0, 0, 0] },
      style: {
        color: '#ffffff',
        fontSize: 36,
        fontFamily: 'Georgia, serif',
        weight: 700,
        align: 'center',
        imageUrl: '',
        background: 'transparent',
      },
      keys: [{ id: uid('ovk'), timeMs: playheadMs, x: 50, y: 50, opacity: 1, scale: 1, rotation: 0, easing: 'easeInOutCubic', bezier: [0.25, 0.1, 0.25, 1], text: null }],
    };
  }

  if (type === 'sound') {
    return {
      id: uid('snd'),
      name: 'Audio',
      active: true,
      keys: [{ id: uid('sdk'), timeMs: playheadMs, soundId: 'arcana:shield_pawn', volume: 1, pitch: 1, loop: false }],
    };
  }

  return {
    id: uid('evt'),
    name: 'Events',
    active: true,
    keys: [{ id: uid('evk'), timeMs: playheadMs, type: 'highlight:set', delayMs: 0, payload: { squares: ['e4'], color: '#88c0d0' } }],
  };
}

function findTrack(card, trackType, trackId) {
  const collection = trackCollectionName(trackType);
  return (card.tracks?.[collection] || []).find((track) => track.id === trackId) || null;
}

function resolveTrackStates(card, boardPieces, timeMs) {
  const tracks = card?.tracks?.objects || [];
  const bySquare = new Map(boardPieces.map((piece) => [piece.square, piece]));
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const resolved = {};
  const visiting = new Set();

  const resolveSquareAnchor = (track) => {
    const piece = bySquare.get(track?.pieceSquare || '');
    if (piece) return piece.targetPosition;
    if (/^[a-h][1-8]$/i.test(track?.pieceSquare || '')) {
      const [x, , z] = squareToPosition(track.pieceSquare.toLowerCase());
      return [x, 0.15, z];
    }
    return DEFAULT_WORLD_ANCHOR;
  };

  const resolveTrack = (trackId) => {
    if (!trackId || resolved[trackId]) return resolved[trackId] || null;
    if (visiting.has(trackId)) return null;

    const track = byId.get(trackId);
    if (!track) return null;

    visiting.add(trackId);
    const sampled = sampleObjectTrack(track, timeMs);
    const attachMode = track.attach?.mode || 'follow';
    const isWorldSpace = attachMode === 'world-space' || attachMode === 'world';

    let anchor = DEFAULT_WORLD_ANCHOR;
    if (!isWorldSpace) {
      if (track.attach?.targetId && byId.has(track.attach.targetId)) {
        anchor = resolveTrack(track.attach.targetId)?.worldPosition || anchor;
      } else {
        anchor = resolveSquareAnchor(track);
      }
    }

    const base = addVec3(anchor, track.attach?.offset || [0, 0, 0]);
    const worldPosition = addVec3(base, sampled.position || [0, 0, 0]);

    resolved[trackId] = {
      ...sampled,
      anchorPosition: base,
      worldPosition,
    };

    visiting.delete(trackId);
    return resolved[trackId];
  };

  tracks.forEach((track) => resolveTrack(track.id));
  return resolved;
}

function BoardSquares() {
  const cells = [];
  for (let rank = 0; rank < 8; rank += 1) {
    for (let file = 0; file < 8; file += 1) {
      const x = file - 3.5;
      const z = 3.5 - rank;
      const dark = (file + rank) % 2 === 1;
      cells.push(
        <mesh key={`${file}_${rank}`} rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.002, z]} receiveShadow>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color={dark ? '#2f3948' : '#ced8e8'} />
        </mesh>,
      );
    }
  }
  return <group>{cells}</group>;
}

function CameraKeyGizmos({ tracks, visible }) {
  if (!visible) return null;
  return (
    <group>
      {(tracks || []).map((track) => (track.keys || []).map((key) => {
        const pos = key.position || [0, 7, 7];
        const target = key.target || [0, 0, 0];
        const dir = [target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]];
        const len = Math.sqrt(dir[0]*dir[0] + dir[1]*dir[1] + dir[2]*dir[2]);
        const normalized = len > 0.001 ? [dir[0]/len, dir[1]/len, dir[2]/len] : [0, -1, 0];
        const forward = normalized;
        const right = Math.abs(forward[1]) < 0.99 
          ? [forward[2], 0, -forward[0]]
          : [0, forward[2], -forward[1]];
        const rightLen = Math.sqrt(right[0]*right[0] + right[1]*right[1] + right[2]*right[2]);
        const normRight = [right[0]/rightLen, right[1]/rightLen, right[2]/rightLen];
        const up = [
          forward[1] * normRight[2] - forward[2] * normRight[1],
          forward[2] * normRight[0] - forward[0] * normRight[2],
          forward[0] * normRight[1] - forward[1] * normRight[0]
        ];
        const m00 = normRight[0], m01 = up[0], m02 = forward[0];
        const m10 = normRight[1], m11 = up[1], m12 = forward[1];
        const m20 = normRight[2], m21 = up[2], m22 = forward[2];
        const trace = m00 + m11 + m22;
        let qx, qy, qz, qw;
        if (trace > 0) {
          const s = 0.5 / Math.sqrt(trace + 1);
          qw = 0.25 / s;
          qx = (m21 - m12) * s;
          qy = (m02 - m20) * s;
          qz = (m10 - m01) * s;
        } else if (m00 > m11 && m00 > m22) {
          const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
          qw = (m21 - m12) / s;
          qx = 0.25 * s;
          qy = (m01 + m10) / s;
          qz = (m02 + m20) / s;
        } else if (m11 > m22) {
          const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
          qw = (m02 - m20) / s;
          qx = (m01 + m10) / s;
          qy = 0.25 * s;
          qz = (m12 + m21) / s;
        } else {
          const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
          qw = (m10 - m01) / s;
          qx = (m02 + m20) / s;
          qy = (m12 + m21) / s;
          qz = 0.25 * s;
        }
        return (
          <group key={`${track.id}_${key.id}`} position={pos} quaternion={[qx, qy, qz, qw]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <coneGeometry args={[0.2, 0.36, 4]} />
              <meshStandardMaterial color="#3dd9ff" emissive="#00ccff" emissiveIntensity={0.55} />
            </mesh>
            <Html center>
              <div className="camera-tag">{track.name}</div>
            </Html>
          </group>
        );
      }))}
    </group>
  );
}

function StudioParticlePreview({ track, sample, anchor }) {
  const points = useMemo(() => buildParticlePreviewPoints({ sample, anchor, maxPoints: 84 }), [sample, anchor]);
  const meshRefs = useRef([]);

  useFrame(({ clock }) => {
    const elapsed = clock.elapsedTime;
    meshRefs.current.forEach((mesh, idx) => {
      const point = points[idx];
      if (!mesh || !point) return;
      const direction = Array.isArray(point.direction) && point.direction.length >= 3 ? point.direction : [0, 1, 0];
      const drift = ((elapsed * ((point.velocityScale || 1) * 0.22)) + idx * 0.11) % 1;
      const wobble = Math.sin(elapsed * 2.2 + idx * 0.7) * 0.03;
      mesh.position.set(
        (point.position?.[0] || 0) + direction[0] * drift * 0.26 + wobble,
        (point.position?.[1] || 0) + direction[1] * drift * 0.3,
        (point.position?.[2] || 0) + direction[2] * drift * 0.26 + wobble,
      );
    });
  });

  if (!points.length) return null;

  return (
    <group>
      {points.map((point, idx) => (
        <mesh
          key={`${track.id}_${idx}`}
          position={point.position}
          ref={(node) => {
            meshRefs.current[idx] = node;
          }}
        >
          <sphereGeometry args={[point.size || 0.05, 8, 8]} />
          <meshStandardMaterial color={point.color} emissive={point.color} emissiveIntensity={0.85} transparent opacity={point.opacity || 0.76} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function TrackFallbackMesh({ track, piece }) {
  if (track.type === 'piece') {
    const renderedPiece = piece || {
      square: track.pieceSquare || 'e4',
      type: track.pieceType || 'p',
      isWhite: (track.pieceColor || 'white') !== 'black',
      targetPosition: [0, 0.075, 0],
    };
    return <ChessPiece {...renderedPiece} targetPosition={[0, 0.075, 0]} />;
  }

  return (
    <mesh castShadow>
      <boxGeometry args={[0.45, 0.45, 0.45]} />
      <meshStandardMaterial color="#7cb7ff" emissive="#214d9c" emissiveIntensity={0.55} />
    </mesh>
  );
}

function StudioObjectEntity({
  track,
  piece,
  sampled,
  selected,
  onSelect,
  playheadMs,
  playPreview,
  transformMode,
  enableTransformControls,
  onTransformChange,
  onTransformDragging,
}) {
  const entityRef = useRef(null);
  const finalPosition = sampled?.worldPosition || sampled?.anchorPosition || piece?.targetPosition || DEFAULT_WORLD_ANCHOR;
  const anchorPosition = sampled?.anchorPosition || DEFAULT_WORLD_ANCHOR;

  const content = <TrackFallbackMesh track={track} piece={piece} />;

  return (
    <>
      <group
        ref={entityRef}
        position={finalPosition}
        rotation={sampled?.rotation || [0, 0, 0]}
        scale={sampled?.scale || [1, 1, 1]}
        onClick={(event) => {
          event.stopPropagation();
          onSelect();
        }}
      >
        {content}
      </group>
      {enableTransformControls && entityRef.current ? (
        <TransformControls
          object={entityRef.current}
          mode={transformMode}
          size={0.85}
          onDraggingChanged={(event) => {
            onTransformDragging?.(Boolean(event?.value));
          }}
          onObjectChange={() => {
            const node = entityRef.current;
            if (!node) return;
            onTransformChange?.({
              position: [
                node.position.x - anchorPosition[0],
                node.position.y - anchorPosition[1],
                node.position.z - anchorPosition[2],
              ],
              rotation: [node.rotation.x, node.rotation.y, node.rotation.z],
              scale: [node.scale.x, node.scale.y, node.scale.z],
            });
          }}
        />
      ) : null}
    </>
  );
}

function StudioScene({
  card,
  playheadMs,
  sampledCamera,
  boardPieces,
  objectStates,
  sampledOverlays,
  selection,
  onSelectTrack,
  onDeselect,
  onTransformInteraction,
  transformMode,
  onTransformObjectKey,
  selectedCameraKey,
  cameraTransformTarget,
  onTransformCameraKey,
  previewMode,
  isPlaying,
  showCameraGizmos,
}) {
  const controlsRef = useRef(null);
  const { camera } = useThree();

  const activeObjects = useMemo(() => card.tracks?.objects || [], [card]);
  const activeParticles = useMemo(() => card.tracks?.particles || [], [card]);
  const activeOverlays = useMemo(() => sampledOverlays || [], [sampledOverlays]);
  const pieceBySquare = useMemo(() => new Map(boardPieces.map((piece) => [piece.square, piece])), [boardPieces]);

  const animatedSquares = useMemo(
    () => new Set(activeObjects.filter((track) => track.type === 'piece' && track.pieceSquare).map((track) => track.pieceSquare)),
    [activeObjects],
  );

  useEffect(() => {
    const shouldDriveCamera = Boolean(sampledCamera) && (isPlaying || selection?.trackType === 'camera');
    if (!shouldDriveCamera) return;
    camera.position.set(...(sampledCamera.position || [7, 8, 7]));
    camera.fov = sampledCamera.fov || 55;
    camera.updateProjectionMatrix();
    controlsRef.current?.target.set(...(sampledCamera.target || [0, 0, 0]));
    controlsRef.current?.update();
  }, [camera, sampledCamera, isPlaying, selection?.trackType]);

  return (
    <>
      <color attach="background" args={['#070d14']} />
      <ambientLight intensity={0.88} />
      <directionalLight position={[8, 12, 8]} intensity={1.35} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />

      {previewMode === 'board' ? (
        <>
          <BoardSquares />
          {boardPieces.filter((piece) => !animatedSquares.has(piece.square)).map((piece) => (
            <ChessPiece key={piece.square} {...piece} />
          ))}
        </>
      ) : (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow onClick={() => onDeselect?.()}>
            <planeGeometry args={[26, 26]} />
            <meshStandardMaterial color="#111b2a" roughness={0.97} metalness={0.0} />
          </mesh>
          <gridHelper args={[26, 26, '#3b5f7a', '#203548']} position={[0, 0.001, 0]} />
        </>
      )}

      {activeObjects.map((track) => {
        let piece = pieceBySquare.get(track.pieceSquare || '');
        if (!piece && /^[a-h][1-8]$/i.test(track.pieceSquare || '') && track.type === 'piece') {
          piece = squareToPiece(track.pieceSquare, track.pieceType || 'p', (track.pieceColor || 'white') !== 'black');
        }

        return (
          <StudioObjectEntity
            key={track.id}
            track={track}
            piece={piece}
            sampled={objectStates[track.id]}
            selected={selection?.trackType === 'object' && selection?.trackId === track.id}
            onSelect={() => onSelectTrack('object', track.id, (track.keys || [])[0]?.id || null)}
            playheadMs={playheadMs}
            playPreview={isPlaying}
            transformMode={transformMode}
            enableTransformControls={selection?.trackType === 'object' && selection?.trackId === track.id}
            onTransformChange={(patch) => onTransformObjectKey?.(track.id, patch)}
            onTransformDragging={(isDragging) => {
              if (controlsRef.current) controlsRef.current.enabled = !isDragging;
              onTransformInteraction?.(isDragging);
            }}
          />
        );
      })}

      {activeParticles.map((track) => {
        const sample = sampleParticleTrack(track, playheadMs);
        const anchor = track.attach?.targetId && objectStates[track.attach.targetId]
          ? objectStates[track.attach.targetId].worldPosition
          : DEFAULT_WORLD_ANCHOR;
        return (
          <StudioParticlePreview
            key={track.id}
            track={track}
            sample={sample}
            anchor={addVec3(anchor, track.attach?.offset || [0, 0, 0])}
          />
        );
      })}

      {activeOverlays
        .filter(({ track }) => (track.space || 'screen') === 'world')
        .map(({ track, sample }) => {
          let worldAnchor = DEFAULT_WORLD_ANCHOR;
          if (track.attach?.targetId && objectStates[track.attach.targetId]) {
            worldAnchor = objectStates[track.attach.targetId].worldPosition || worldAnchor;
          } else if (track.pieceSquare) {
            const piece = pieceBySquare.get(track.pieceSquare);
            if (piece) worldAnchor = piece.targetPosition || worldAnchor;
          }

          const worldPos = addVec3(worldAnchor, track.attach?.offset || [0, 0, 0]);
          const style = {
            opacity: sample.opacity,
            transform: `translate(-50%, -50%) scale(${sample.scale}) rotate(${sample.rotation}deg)`,
            color: track.style?.color || '#ffffff',
            fontSize: `${track.style?.fontSize || 36}px`,
            fontFamily: track.style?.fontFamily || 'Georgia, serif',
            fontWeight: track.style?.weight || 700,
            textAlign: track.style?.align || 'center',
            background: track.style?.background || 'transparent',
            pointerEvents: 'none',
          };

          if (track.type === 'image' && track.style?.imageUrl) {
            return (
              <Html key={track.id} position={worldPos} center>
                <img className="overlay-preview-node" alt={track.name} src={track.style.imageUrl} style={style} />
              </Html>
            );
          }

          return (
            <Html key={track.id} position={worldPos} center>
              <div className="overlay-preview-node" style={style}>{sample.text || track.content}</div>
            </Html>
          );
        })}

      {selection?.trackType === 'camera' && selectedCameraKey ? (
        <TransformControls
          mode="translate"
          onMouseDown={() => {
            if (controlsRef.current) controlsRef.current.enabled = false;
            onTransformInteraction?.(true);
          }}
          onMouseUp={() => {
            if (controlsRef.current) controlsRef.current.enabled = true;
            onTransformInteraction?.(false);
          }}
          onObjectChange={(event) => {
            const node = event?.target?.object;
            if (!node) return;
            const key = cameraTransformTarget === 'target' ? 'target' : 'position';
            onTransformCameraKey?.({ [key]: [node.position.x, node.position.y, node.position.z] });
          }}
        >
          <mesh position={(cameraTransformTarget === 'target' ? selectedCameraKey.target : selectedCameraKey.position) || [7, 8, 7]}>
            <sphereGeometry args={[0.18, 16, 16]} />
            <meshStandardMaterial
              color={cameraTransformTarget === 'target' ? '#f6d367' : '#67d3ff'}
              emissive={cameraTransformTarget === 'target' ? '#8f6f0f' : '#0f6c8f'}
              emissiveIntensity={0.45}
            />
          </mesh>
        </TransformControls>
      ) : null}

      <CameraKeyGizmos tracks={card.tracks?.camera || []} visible={showCameraGizmos} />
      <OrbitControls ref={controlsRef} makeDefault />
    </>
  );
}

function downloadJson(name, value) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

function truncate(text = '', max = 110) {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function normalizeImportedStudioCardsPayload(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('JSON must contain a card object, card array, or card-pack payload');
  }

  if (parsed?.config && parsed?.id && typeof parsed.config === 'object') {
    return [legacyCutsceneToArcanaStudioCard(parsed, { id: parsed.id })];
  }

  if (parsed?.cards && typeof parsed.cards === 'object') {
    if (Array.isArray(parsed.cards)) {
      return parsed.cards.filter((entry) => entry && typeof entry === 'object');
    }

    return Object.entries(parsed.cards)
      .map(([id, entry]) => {
        if (!entry || typeof entry !== 'object') return null;
        return { ...entry, id: entry.id || id };
      })
      .filter(Boolean);
  }

  if (Array.isArray(parsed)) {
    return parsed.filter((entry) => entry && typeof entry === 'object');
  }

  if (Array.isArray(parsed?.items)) {
    return parsed.items.filter((entry) => entry && typeof entry === 'object');
  }

  if (Array.isArray(parsed?.cutscenes)) {
    return parsed.cutscenes
      .map((entry) => {
        if (!entry || typeof entry !== 'object' || !entry.id || !entry.config) return null;
        return legacyCutsceneToArcanaStudioCard(entry, { id: entry.id });
      })
      .filter(Boolean);
  }

  if (!Array.isArray(parsed) && typeof parsed === 'object') {
    return [parsed];
  }

  return [];
}

export function ArcanaStudio({ onBack }) {
  const [cards, setCards] = useState(() => {
    return buildStudioCardsMap();
  });

  const [selectedId, setSelectedId] = useState(() => {
    const ids = Object.keys(getAllAvailableCards());
    return ids[0] || 'new_cutscene';
  });

  const [selection, setSelection] = useState(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackLoopCycle, setPlaybackLoopCycle] = useState(0);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showCameraGizmos, setShowCameraGizmos] = useState(true);
  const [transformMode, setTransformMode] = useState('translate');
  const [cameraTransformTarget, setCameraTransformTarget] = useState('position');
  const [cardSearch, setCardSearch] = useState('');
  const [status, setStatus] = useState('Ready');
  const [runtimeNotices, setRuntimeNotices] = useState([]);
  const [dragKey, setDragKey] = useState(null);
  const [overlayDrag, setOverlayDrag] = useState(null);
  const suppressDeselectUntilRef = useRef(0);
  const overlayStageRef = useRef(null);

  const laneRefs = useRef({});
  const playbackFrameRef = useRef(null);
  const playbackStartRef = useRef(0);
  const playbackOriginRef = useRef(0);
  const audioTimersRef = useRef([]);
  const audioNodesRef = useRef([]);

  const studioSoundManager = useMemo(() => ({
    play: (rawSoundId, options = {}) => {
      const soundId = normalizeStudioSoundId(rawSoundId);
      let audio = soundManager.play(soundId, {
        volume: options.volume,
        pitch: options.pitch,
        loop: options.loop,
      });

      if (!audio && soundId) {
        const fallbackUrl = resolveSoundPreviewUrl(soundId);
        try {
          const fallbackAudio = new Audio(fallbackUrl);
          fallbackAudio.volume = Math.max(0, Math.min(1, (soundManager.masterVolume || 1) * (soundManager.sfxVolume || 1) * (typeof options.volume === 'number' ? options.volume : 1)));
          fallbackAudio.playbackRate = Math.max(0.25, Math.min(4, Number.isFinite(options.pitch) ? options.pitch : 1));
          fallbackAudio.loop = Boolean(options.loop);
          const playPromise = fallbackAudio.play();
          if (playPromise && playPromise.catch) playPromise.catch(() => {});
          audio = fallbackAudio;
        } catch {
          // Keep silent on preview fallback failures.
        }
      }

      if (audio) audioNodesRef.current.push(audio);
      setRuntimeNotices((current) => [...current.slice(-5), { kind: 'sound', label: soundId || rawSoundId }]);
      return audio;
    },
  }), []);

  const selectedCard = useMemo(() => {
    const card = cards[selectedId] || createEmptyArcanaStudioCard(selectedId);
    return migrateArcanaStudioCard(card, selectedId);
  }, [cards, selectedId]);

  const boardPieces = useMemo(() => parseFenPieces(selectedCard.board?.fen), [selectedCard.board?.fen]);

  const sampledCamera = useMemo(() => {
    const activeCamera = (selectedCard.tracks?.camera || []).find((track) => track.active !== false) || selectedCard.tracks?.camera?.[0];
    if (!activeCamera) return null;
    return sampleCameraTrack(activeCamera, playheadMs);
  }, [selectedCard, playheadMs]);

  const objectStates = useMemo(() => resolveTrackStates(selectedCard, boardPieces, playheadMs), [selectedCard, boardPieces, playheadMs]);

  const sampledOverlays = useMemo(() => (
    (selectedCard.tracks?.overlays || [])
      .map((track) => ({ track, sample: sampleOverlayTrack(track, playheadMs) }))
      .filter((entry) => entry.sample)
  ), [selectedCard, playheadMs]);

  const timelineRows = useMemo(() => collectTimelineRows(selectedCard), [selectedCard]);

  const selectedTrack = useMemo(() => {
    if (!selection?.trackType || !selection?.trackId) return null;
    return findTrack(selectedCard, selection.trackType, selection.trackId);
  }, [selectedCard, selection]);

  const selectedKey = useMemo(() => {
    if (!selectedTrack || !selection?.keyId) return null;
    return (selectedTrack.keys || []).find((key) => key.id === selection.keyId) || null;
  }, [selectedTrack, selection]);

  const screenOverlays = useMemo(
    () => getScreenOverlaySamples(selectedCard, playheadMs),
    [playheadMs, selectedCard],
  );
  const particleCompatibilityWarnings = useMemo(() => {
    if (selection?.trackType !== 'particle' || !selectedTrack?.params) return [];
    return getParticleCompatibilityWarnings(selectedTrack.params);
  }, [selection?.trackType, selectedTrack?.params]);
  const selectedCardDescription = useMemo(() => getCardDescription(selectedCard) || 'No description', [selectedCard]);

  useEffect(() => {
    const handleSpace = (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        setIsPlaying((value) => !value);
      }
    };

    window.addEventListener('keydown', handleSpace);
    return () => window.removeEventListener('keydown', handleSpace);
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!cards || Object.keys(cards).length === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [cards]);

  useEffect(() => {
    if (!selectedCard || !selectedId) return;

    const hasObjects = (selectedCard.tracks?.objects || []).length > 0;
    if (hasObjects) return;

    const defaultSquare = boardPieces[0]?.square || selectedCard.board?.focusSquare || selectedCard.meta?.cardPiecePreview || 'e4';
    const defaultTrack = createDefaultTrack('object', 0, defaultSquare, selectedCard.id);

    setCards((prev) => {
      const current = migrateArcanaStudioCard(prev[selectedId] || selectedCard, selectedId);
      if ((current.tracks?.objects || []).length > 0) return prev;

      const patched = migrateArcanaStudioCard({
        ...current,
        tracks: {
          ...current.tracks,
          objects: [defaultTrack],
        },
      }, selectedId);

      return { ...prev, [selectedId]: patched };
    });

    setStatus('Created default animatable piece track for card');
  }, [selectedId, selectedCard, boardPieces]);

  useEffect(() => {
    if (!dragKey) return undefined;

    const laneRefId = `${dragKey.trackType}_${dragKey.trackId}`;

    const onPointerMove = (event) => {
      const laneEl = laneRefs.current[laneRefId];
      if (!laneEl) return;
      const rect = laneEl.getBoundingClientRect();
      const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const timeMs = Math.round(ratio * Math.max(1, selectedCard.durationMs || 1));
      updateKeyField(dragKey.trackType, dragKey.trackId, dragKey.keyId, { timeMs }, false);
      setPlayheadMs(timeMs);
    };

    const onPointerUp = () => {
      setDragKey(null);
      setStatus('Moved keyframe');
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragKey, selectedCard.durationMs]);

  useEffect(() => {
    if (!overlayDrag) return undefined;

    const onPointerMove = (event) => {
      const stageEl = overlayStageRef.current;
      if (!stageEl) return;
      const rect = stageEl.getBoundingClientRect();
      const x = clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100);
      const y = clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100);
      updateKeyField('overlay', overlayDrag.trackId, overlayDrag.keyId, { x, y }, false);
    };

    const onPointerUp = () => {
      setOverlayDrag(null);
      setStatus('Moved overlay keyframe');
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [overlayDrag]);

  useEffect(() => {
    if (!isPlaying) {
      if (playbackFrameRef.current) cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
      return undefined;
    }

    playbackOriginRef.current = playheadMs;
    playbackStartRef.current = performance.now();
    let loopIndex = 0;

    const tick = () => {
      const elapsed = Math.max(0, performance.now() - playbackStartRef.current);
      const duration = Math.max(1, selectedCard.durationMs || 1);
      const absolute = playbackOriginRef.current + elapsed;
      let next = absolute;

      if (selectedCard.settings?.loopPlayback) {
        const nextLoopIndex = Math.floor(absolute / duration);
        if (nextLoopIndex !== loopIndex) {
          loopIndex = nextLoopIndex;
          setPlaybackLoopCycle((value) => value + 1);
        }
        next %= duration;
      }
      else if (next >= duration) {
        next = duration;
        setIsPlaying(false);
      }

      setPlayheadMs(next);
      playbackFrameRef.current = requestAnimationFrame(tick);
    };

    playbackFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (playbackFrameRef.current) cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
    };
  }, [isPlaying, playheadMs, selectedCard.durationMs, selectedCard.settings?.loopPlayback]);

  useEffect(() => {
    audioTimersRef.current.forEach((timer) => clearTimeout(timer));
    audioTimersRef.current = [];

    audioNodesRef.current.forEach((node) => {
      try {
        node.pause();
        node.currentTime = 0;
      } catch {
        // ignore cleanup errors
      }
    });
    audioNodesRef.current = [];

    if (!isPlaying) return undefined;

    setRuntimeNotices([]);

    scheduleArcanaStudioAudio(selectedCard, {
      playheadMs,
      registerTimeout: (timer) => audioTimersRef.current.push(timer),
      soundManager: studioSoundManager,
    });

    scheduleArcanaStudioEvents(selectedCard, {
      playheadMs,
      registerTimeout: (timer) => audioTimersRef.current.push(timer),
      eventParams: { cardId: selectedCard.id },
      onEvent: (eventKey) => {
        const actions = Array.isArray(eventKey?.actions) && eventKey.actions.length > 0
          ? eventKey.actions
          : normalizeArcanaStudioEventActions(eventKey);

        const actionLabel = actions.length
          ? actions.map((action) => {
              if (action.kind === 'sound') return `sound:${action.soundId}`;
              if (action.kind === 'camera') return `camera:${action.square}`;
              if (action.kind === 'overlay') return `overlay:${action.effect}`;
              if (action.kind === 'highlight') return `highlight:${action.squares.join(',')}`;
              return action.kind;
            }).join(' | ')
          : eventKey?.type || 'event';

        actions.forEach((action) => {
          if (action.kind === 'sound' && action.soundId) {
            studioSoundManager.play(action.soundId, {
              volume: action.volume,
              pitch: action.pitch,
              loop: action.loop,
            });
          }
        });

        setRuntimeNotices((current) => [
          ...current.slice(-5),
          { kind: 'event', label: `${eventKey?.type || 'event'}${actionLabel ? ` • ${actionLabel}` : ''}` },
        ]);
      },
    });

    return () => {
      audioTimersRef.current.forEach((timer) => clearTimeout(timer));
      audioTimersRef.current = [];
      audioNodesRef.current.forEach((node) => {
        try {
          node.pause();
        } catch {
          // ignore
        }
      });
      audioNodesRef.current = [];
    };
  }, [isPlaying, playbackLoopCycle, selectedCard, studioSoundManager]);

  function updateCards(next, statusText = '') {
    const normalized = {};
    Object.entries(next || {}).forEach(([id, card]) => {
      normalized[id] = sanitizeCardForStudio(card, id);
    });
    saveArcanaStudioCardsMap(normalized);
    setCards(normalized);
    if (statusText) setStatus(statusText);
  }

  function updateSelectedCard(patcher, statusText = '') {
    const current = migrateArcanaStudioCard(cards[selectedId] || selectedCard, selectedId);
    const patched = sanitizeCardForStudio(migrateArcanaStudioCard(patcher(current), selectedId), selectedId);
    updateCards({ ...cards, [selectedId]: patched }, statusText);
  }

  function selectTrack(trackType, trackId, keyId = null) {
    setSelection({ trackType, trackId, keyId });
  }

  function selectKey(trackType, trackId, keyId) {
    setSelection({ trackType, trackId, keyId });
  }

  function addTrack(type) {
    if (!TRACK_TYPES.includes(type)) return;
    if (type === 'camera' && !selectedCard.meta?.isCutscene) {
      setStatus('Cameras only available for cutscene cards');
      return;
    }

    const previewSquare = selectedCard.meta?.cardPiecePreview || boardPieces[0]?.square || selectedCard.board?.focusSquare || 'e4';
    const track = createDefaultTrack(type, Math.round(playheadMs), previewSquare, selectedCard.id);

    updateSelectedCard((card) => {
      const collection = trackCollectionName(type);
      return {
        ...card,
        tracks: {
          ...card.tracks,
          [collection]: [...(card.tracks?.[collection] || []), track],
        },
      };
    }, `Added ${type} track`);

    selectTrack(type, track.id);
  }

  function addKeyToTrack(trackType, trackId) {
    updateSelectedCard((card) => {
      const collection = trackCollectionName(trackType);
      const list = [...(card.tracks?.[collection] || [])];
      const idx = list.findIndex((track) => track.id === trackId);
      if (idx < 0) return card;

      const track = { ...list[idx], keys: [...(list[idx].keys || [])] };
      let key;

      if (trackType === 'camera') {
        key = { id: uid('camk'), timeMs: Math.round(playheadMs), position: [7, 8, 7], target: [0, 0, 0], fov: 55, easing: 'easeInOutCubic', bezier: [0.25, 0.1, 0.25, 1], blendMode: 'curve' };
      } else if (trackType === 'object') {
        const defaultScale = track.isAnimatablePiece ? [1.8, 1.8, 1.8] : [1, 1, 1];
        key = { id: uid('objk'), timeMs: Math.round(playheadMs), position: [0, 0, 0], rotation: [0, 0, 0], scale: defaultScale, easing: 'easeInOutCubic', bezier: [0.25, 0.1, 0.25, 1] };
      } else if (trackType === 'particle') {
        key = { id: uid('ptk'), timeMs: Math.round(playheadMs), enabled: true, seed: 1337, easing: 'linear', overrides: {} };
      } else if (trackType === 'overlay') {
        key = { id: uid('ovk'), timeMs: Math.round(playheadMs), x: 50, y: 50, opacity: 1, scale: 1, rotation: 0, easing: 'easeInOutCubic', bezier: [0.25, 0.1, 0.25, 1], text: null };
      } else if (trackType === 'sound') {
        key = { id: uid('sdk'), timeMs: Math.round(playheadMs), soundId: 'arcana:shield_pawn', volume: 1, pitch: 1, loop: false };
      } else {
        key = { id: uid('evk'), timeMs: Math.round(playheadMs), type: 'highlight:set', delayMs: 0, payload: {} };
      }

      track.keys.push(key);
      track.keys.sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
      list[idx] = track;

      return {
        ...card,
        tracks: {
          ...card.tracks,
          [collection]: list,
        },
      };
    }, 'Added keyframe');
  }

  function removeSelectedKey() {
    if (!selection?.trackType || !selection?.trackId || !selection?.keyId) return;

    const { trackType, trackId, keyId } = selection;

    updateSelectedCard((card) => {
      const collection = trackCollectionName(trackType);
      const list = [...(card.tracks?.[collection] || [])];
      const idx = list.findIndex((track) => track.id === trackId);
      if (idx < 0) return card;

      list[idx] = {
        ...list[idx],
        keys: (list[idx].keys || []).filter((key) => key.id !== keyId),
      };

      return {
        ...card,
        tracks: {
          ...card.tracks,
          [collection]: list,
        },
      };
    }, 'Removed keyframe');

    setSelection({ trackType, trackId, keyId: null });
  }

  function updateTrackField(trackType, trackId, patch) {
    updateSelectedCard((card) => {
      const collection = trackCollectionName(trackType);
      const list = [...(card.tracks?.[collection] || [])];
      const idx = list.findIndex((entry) => entry.id === trackId);
      if (idx < 0) return card;

      if (trackType === 'particle') {
        const nextPatch = { ...(patch || {}) };
        if (nextPatch.params) {
          nextPatch.params = sanitizeParticleParams({
            ...(list[idx].params || {}),
            ...(nextPatch.params || {}),
          });
        }
        if (Array.isArray(nextPatch.keys)) {
          nextPatch.keys = nextPatch.keys.map((key) => ({
            ...key,
            seed: Math.max(0, Math.round(toFiniteNumber(key?.seed, 1337))),
          }));
        }
        list[idx] = { ...list[idx], ...nextPatch };
      } else if (trackType === 'object' && list[idx].isAnimatablePiece && Object.prototype.hasOwnProperty.call(patch || {}, 'name')) {
        const { name, ...rest } = patch || {};
        list[idx] = { ...list[idx], ...rest };
      } else {
        list[idx] = { ...list[idx], ...patch };
      }

      return {
        ...card,
        tracks: {
          ...card.tracks,
          [collection]: list,
        },
      };
    });
  }

  function updateKeyField(trackType, trackId, keyId, patch, setStatusText = true) {
    updateSelectedCard((card) => {
      const collection = trackCollectionName(trackType);
      const list = [...(card.tracks?.[collection] || [])];
      const idx = list.findIndex((entry) => entry.id === trackId);
      if (idx < 0) return card;

      const track = { ...list[idx], keys: [...(list[idx].keys || [])] };
      const kIdx = track.keys.findIndex((key) => key.id === keyId);
      if (kIdx < 0) return card;

      track.keys[kIdx] = { ...track.keys[kIdx], ...patch };
      track.keys.sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
      list[idx] = track;

      return {
        ...card,
        tracks: {
          ...card.tracks,
          [collection]: list,
        },
      };
    }, setStatusText ? 'Updated keyframe' : '');
  }

  function updateSelectedObjectTransform(trackId, patch) {
    if (selection?.trackType !== 'object' || selection?.trackId !== trackId) return;
    if (selection?.keyId) {
      updateKeyField('object', trackId, selection.keyId, patch, false);
      return;
    }

    const newKeyId = uid('objk');
    updateSelectedCard((card) => {
      const list = [...(card.tracks?.objects || [])];
      const idx = list.findIndex((entry) => entry.id === trackId);
      if (idx < 0) return card;

      const track = { ...list[idx], keys: [...(list[idx].keys || [])] };
      track.keys.push({
        id: newKeyId,
        timeMs: Math.round(playheadMs),
        position: patch.position || [0, 0, 0],
        rotation: patch.rotation || [0, 0, 0],
        scale: patch.scale || [1.8, 1.8, 1.8],
        easing: 'easeInOutCubic',
        bezier: [0.25, 0.1, 0.25, 1],
      });
      track.keys.sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
      list[idx] = track;

      return {
        ...card,
        tracks: {
          ...card.tracks,
          objects: list,
        },
      };
    }, 'Auto-created keyframe from gizmo');
    setSelection({ trackType: 'object', trackId, keyId: newKeyId });
  }

  function updateSelectedCameraTransform(patch) {
    if (selection?.trackType !== 'camera' || !selection?.trackId || !selection?.keyId) return;
    updateKeyField('camera', selection.trackId, selection.keyId, patch, false);
  }

  function resolveOverlayKeyId(track) {
    if (!track) return null;

    if (selection?.trackType === 'overlay' && selection?.trackId === track.id && selection?.keyId) {
      return selection.keyId;
    }

    const keys = [...(track.keys || [])];
    if (keys.length === 0) {
      const keyId = uid('ovk');
      updateSelectedCard((card) => {
        const list = [...(card.tracks?.overlays || [])];
        const idx = list.findIndex((entry) => entry.id === track.id);
        if (idx < 0) return card;

        const nextTrack = { ...list[idx], keys: [...(list[idx].keys || [])] };
        nextTrack.keys.push({
          id: keyId,
          timeMs: Math.round(playheadMs),
          x: 50,
          y: 50,
          opacity: 1,
          scale: 1,
          rotation: 0,
          easing: 'easeInOutCubic',
          bezier: [0.25, 0.1, 0.25, 1],
          text: null,
        });
        list[idx] = nextTrack;

        return {
          ...card,
          tracks: {
            ...card.tracks,
            overlays: list,
          },
        };
      }, 'Added overlay keyframe');
      return keyId;
    }

    const nearest = keys.reduce((best, key) => {
      if (!best) return key;
      const a = Math.abs((best.timeMs || 0) - playheadMs);
      const b = Math.abs((key.timeMs || 0) - playheadMs);
      return b < a ? key : best;
    }, null);

    return nearest?.id || null;
  }

  function startOverlayDrag(event, track) {
    event.preventDefault();
    event.stopPropagation();
    if (!track) return;

    const keyId = resolveOverlayKeyId(track);
    if (!keyId) return;

    const keyFrame = (track.keys || []).find((key) => key.id === keyId);
    if (keyFrame?.locked) return;

    const stageEl = overlayStageRef.current;
    if (stageEl) {
      const rect = stageEl.getBoundingClientRect();
      const x = clamp(((event.clientX - rect.left) / Math.max(1, rect.width)) * 100, 0, 100);
      const y = clamp(((event.clientY - rect.top) / Math.max(1, rect.height)) * 100, 0, 100);
      updateKeyField('overlay', track.id, keyId, { x, y }, false);
    }

    setSelection({ trackType: 'overlay', trackId: track.id, keyId });
    setOverlayDrag({ trackId: track.id, keyId });
  }

  function exportCard() {
    downloadJson(`${selectedId}.arcana-studio.json`, selectedCard);
    setStatus(`Exported ${selectedId}`);
  }

  function exportAllCards() {
    downloadJson('arcana-studio-card-pack.json', {
      version: 1,
      source: 'arcana-studio',
      exportedAt: Date.now(),
      cards,
    });
    setStatus('Exported all current cards');
  }

  function importCurrentCards() {
    const base = buildStudioCardsMap({ includeStored: false });
    const firstId = Object.keys(base)[0] || 'new_cutscene';
    updateCards(base, 'Imported current game cards (custom imports cleared)');
    setSelectedId(firstId);
    setSelection(null);
    setPlayheadMs(0);
  }

  function applyOverlayPreset(trackId, preset) {
    if (!trackId || !preset) return;
    const commonStyle = {
      ...(selectedTrack?.style || {}),
      width: selectedTrack?.style?.width ?? 100,
      height: selectedTrack?.style?.height ?? 100,
      borderRadius: selectedTrack?.style?.borderRadius ?? 0,
      background: selectedTrack?.style?.background || 'rgba(0,0,0,0)',
    };

    if (preset === 'flash') {
      updateTrackField('overlay', trackId, {
        type: 'screen_cover',
        content: 'Flash',
        style: {
          ...commonStyle,
          color: '#ffffff',
          background: 'rgba(255,255,255,0.85)',
          width: 100,
          height: 100,
        },
      });
      return;
    }

    if (preset === 'monochrome') {
      updateTrackField('overlay', trackId, {
        type: 'screen_cover',
        content: 'Monochrome',
        style: {
          ...commonStyle,
          color: '#000000',
          background: 'rgba(80,80,80,0.72)',
          width: 100,
          height: 100,
        },
      });
      return;
    }

    if (preset === 'vignette') {
      updateTrackField('overlay', trackId, {
        type: 'panel',
        content: 'Vignette',
        style: {
          ...commonStyle,
          color: '#ffffff',
          background: 'rgba(0,0,0,0.52)',
          width: 96,
          height: 96,
          borderRadius: 20,
        },
      });
      return;
    }

    if (preset === 'title_card') {
      updateTrackField('overlay', trackId, {
        type: 'text',
        content: selectedTrack?.content || 'Arcana Activated',
        style: {
          ...commonStyle,
          color: '#ffffff',
          fontSize: 42,
          background: 'rgba(0,0,0,0.35)',
        },
      });
    }
  }

  function applyParticlePreset(trackId, presetId) {
    if (!trackId || !presetId || !PARTICLE_PRESETS[presetId]) return;
    const params = sanitizeParticleParams(createParticlePresetParams(presetId));
    const seed = 1337 + Math.floor(Math.random() * 100000);
    const nextKeys = (selectedTrack?.keys || []).length > 0
      ? (selectedTrack.keys || [])
      : [{ id: uid('ptk'), timeMs: Math.round(playheadMs), enabled: true, seed, easing: 'linear', overrides: {} }];

    updateTrackField('particle', trackId, {
      params: {
        ...(selectedTrack?.params || {}),
        ...params,
      },
      keys: nextKeys.map((key, idx) => ({
        ...key,
        seed: idx === 0 ? seed : (key.seed ?? seed + idx * 13),
      })),
    });
  }

  function importJsonCard(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        const importedCards = normalizeImportedStudioCardsPayload(parsed);
        if (!Array.isArray(importedCards) || importedCards.length === 0) {
          throw new Error('No importable cards found in JSON');
        }

        const nextCards = { ...cards };
        let firstImportedId = null;

        importedCards.forEach((rawCard, index) => {
          const fallbackId = `imported_card_${index + 1}`;
          const normalizedId = rawCard?.id === 'arcane_cycle' ? 'filtered_cycle' : (rawCard?.id || fallbackId);
          const definition = findDefinitionById(normalizedId);
          const alignedBase = definition
            ? makeCardFromGameCard({ ...definition, id: normalizedId }, Boolean(definition.visual?.cutscene), normalizedId)
            : createEmptyArcanaStudioCard(normalizedId);

          const card = sanitizeCardForStudio(
            migrateArcanaStudioCard({ ...alignedBase, ...rawCard, id: normalizedId }, normalizedId),
            normalizedId,
          );

          nextCards[card.id] = card;
          if (!firstImportedId) firstImportedId = card.id;
        });

        updateCards(nextCards, importedCards.length === 1 ? `Imported ${firstImportedId}` : `Imported ${importedCards.length} cards`);
        if (firstImportedId) setSelectedId(firstImportedId);
      } catch (err) {
        setStatus(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  function removeSelectedTrack() {
    if (!selection?.trackType || !selection?.trackId) return;

    if (selection.trackType === 'object') {
      const objects = selectedCard.tracks?.objects || [];
      if (objects[0]?.id === selection.trackId) {
        setStatus('Main Piece track is required and cannot be deleted');
        return;
      }
    }

    const { trackType, trackId } = selection;
    const collection = trackCollectionName(trackType);
    updateSelectedCard((card) => ({
      ...card,
      tracks: {
        ...card.tracks,
        [collection]: (card.tracks?.[collection] || []).filter((track) => track.id !== trackId),
      },
    }), `Removed ${trackType} track`);
    setSelection(null);
  }

  function setCardPiecePreview(square) {
    updateSelectedCard((card) => ({
      ...card,
      meta: {
        ...(card.meta || {}),
        cardPiecePreview: square,
      },
    }), 'Updated card preview piece');
  }

  const cardEntries = useMemo(() => {
    return Object.entries(cards).sort(compareLibraryCards);
  }, [cards]);
  const filteredCardEntries = useMemo(() => {
    const q = cardSearch.trim().toLowerCase();
    if (!q) return cardEntries;
    return cardEntries.filter(([id, card]) => {
      const definition = findDefinitionById(id);
      const haystack = [
        id,
        card.name,
        card.description,
        definition?.category,
        definition?.rarity,
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [cardEntries, cardSearch]);

  return (
    <div className="arcana-studio-shell">
      {showTutorial ? <ArcanaStudioTutorial onClose={() => setShowTutorial(false)} /> : null}

      <header className="arcana-studio-header">
        <div>
          <h1>Arcana Studio</h1>
          <p className="arcana-studio-subtitle">Board-first spell cinema built for Arcana Chess.</p>
          <p className="arcana-studio-status">{status}</p>
        </div>
        <div className="arcana-studio-actions">
          <button onClick={onBack}>Back</button>
          <button onClick={() => setShowTutorial(true)}>Field Guide</button>
          <button onClick={importCurrentCards}>Import Current Cards</button>
          <label className="file-like-button">
            Import JSON
            <input type="file" accept="application/json" onChange={importJsonCard} />
          </label>
          <button onClick={exportCard}>Export Card</button>
          <button onClick={exportAllCards}>Export All Cards</button>
        </div>
      </header>

      <div className="arcana-studio-layout">
        <aside className="arcana-studio-sidebar">
          <div className="arcana-panel card-library-panel">
            <div className="arcana-panel-title">Card Library ({filteredCardEntries.length}/{cardEntries.length})</div>
            <input
              className="card-library-search"
              placeholder="Search by id, name, rarity, category..."
              value={cardSearch}
              onChange={(event) => setCardSearch(event.target.value)}
            />
            <div className="arcana-card-list compact">
              {filteredCardEntries.map(([id, card]) => {
                const definition = findDefinitionById(id);
                const rarity = getCardRarity(card, definition);
                const rarityColor = RARITY_COLOR[rarity] || '#b9c8da';
                return (
                <button key={id} className={`card-item rarity-${rarity} ${id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(id); setSelection(null); setPlayheadMs(0); }}>
                  <div className="card-item-top">
                    <strong>{card.name || definition?.name || id}</strong>
                    <span className="card-item-badges">
                      {card.meta?.isCutscene ? <span className="pill cutscene">Cutscene</span> : null}
                      <span className="pill rarity-pill" style={{ color: rarityColor, borderColor: `${rarityColor}88` }}>{rarity.toUpperCase()}</span>
                    </span>
                  </div>
                  <div className="card-item-meta" style={{ color: rarityColor }}>{rarity.toUpperCase()} • {(definition?.category || card.meta?.category || 'uncategorized')}</div>
                  <span className="card-item-id">{id}</span>
                  <p className="card-item-desc">{truncate(getCardDescription(card) || 'No description', 140)}</p>
                </button>
                );
              })}
            </div>
          </div>

          <div className="arcana-panel">
            <div className="arcana-panel-title">Arcana Layers</div>
            <div className="arcana-add-row">
              <button onClick={() => addTrack('camera')}>+ Lens</button>
              <button onClick={() => addTrack('object')}>+ Actor</button>
              <button onClick={() => addTrack('particle')}>+ Aether</button>
              <button onClick={() => addTrack('overlay')}>+ Sigil</button>
              <button onClick={() => addTrack('sound')}>+ Chime</button>
            </div>

            <div className="outliner-list">
              {timelineRows.map((row) => {
                return (
                  <div key={`${row.type}_${row.id}`} className={`outliner-item ${selection?.trackType === row.type && selection?.trackId === row.id ? 'selected' : ''}`}>
                    <button className="outliner-main" onClick={() => selectTrack(row.type, row.id)}>
                      <span>{row.type}</span>
                      <strong>{row.label}</strong>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        <main className="arcana-studio-main">
          <div className="arcana-panel card-meta card-meta-extended compact">
            <label>
              Card ID
              <div className="meta-readonly">{selectedCard.id}</div>
            </label>
            <label>
              Name
              <div className="meta-readonly">{selectedCard.name || findDefinitionById(selectedCard.id)?.name || selectedCard.id}</div>
            </label>
            <label>
              Duration (ms)
              <input type="number" min={100} value={selectedCard.durationMs} onChange={(event) => updateSelectedCard((card) => ({ ...card, durationMs: Math.max(100, Number(event.target.value) || 100) }))} />
            </label>
            <label>
              Preview Mode
              <select value={selectedCard.settings?.previewMode || 'plane'} onChange={(event) => updateSelectedCard((card) => ({ ...card, settings: { ...card.settings, previewMode: event.target.value } }), 'Updated preview mode')}>
                <option value="plane">Plane</option>
                <option value="board">Board</option>
              </select>
            </label>
            <label>
              Card Preview Piece
              <input value={selectedCard.meta?.cardPiecePreview || ''} placeholder="e4" onChange={(event) => setCardPiecePreview(event.target.value.toLowerCase())} />
            </label>
            <label>
              Show Camera Gizmos
              <select value={showCameraGizmos ? 'on' : 'off'} onChange={(event) => setShowCameraGizmos(event.target.value === 'on')}>
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label>
              Transform Gizmo
              <select value={transformMode} onChange={(event) => setTransformMode(event.target.value)}>
                <option value="translate">Move</option>
                <option value="rotate">Rotate</option>
                <option value="scale">Scale</option>
              </select>
            </label>
            {selection?.trackType === 'camera' ? (
              <label>
                Camera Gizmo Target
                <select value={cameraTransformTarget} onChange={(event) => setCameraTransformTarget(event.target.value)}>
                  <option value="position">Position</option>
                  <option value="target">Target</option>
                </select>
              </label>
            ) : null}
          </div>

          <div className="arcana-workspace">
            <div className="arcana-viewport-shell focus">
              <Canvas shadows camera={{ position: [7, 8, 7], fov: 55 }}>
                <StudioScene
                  card={selectedCard}
                  playheadMs={playheadMs}
                  sampledCamera={sampledCamera}
                  boardPieces={boardPieces}
                  objectStates={objectStates}
                  sampledOverlays={sampledOverlays}
                  selection={selection}
                  onSelectTrack={selectTrack}
                  onDeselect={() => {
                    if (Date.now() < suppressDeselectUntilRef.current) return;
                    setSelection(null);
                  }}
                  onTransformInteraction={(isDragging) => {
                    if (!isDragging) {
                      suppressDeselectUntilRef.current = Date.now() + 120;
                    }
                  }}
                  transformMode={transformMode}
                  onTransformObjectKey={updateSelectedObjectTransform}
                  selectedCameraKey={selection?.trackType === 'camera' ? selectedKey : null}
                  cameraTransformTarget={cameraTransformTarget}
                  onTransformCameraKey={updateSelectedCameraTransform}
                  previewMode={selectedCard.settings?.previewMode || 'plane'}
                  isPlaying={isPlaying}
                  showCameraGizmos={showCameraGizmos}
                />
              </Canvas>

              <div className="arcana-overlay-stage" ref={overlayStageRef}>
                {screenOverlays.map(({ track, sample, composedLayer }) => {
                  const isSelected = selection?.trackType === 'overlay' && selection?.trackId === track.id;
                  const isScreenCover = track.type === 'screen_cover';
                  const widthPercent = Number.isFinite(track.style?.width) ? Math.max(1, track.style.width) : 100;
                  const heightPercent = Number.isFinite(track.style?.height) ? Math.max(1, track.style.height) : 100;
                  const zIndex = 10 + (Number(composedLayer) || Number(track.layer) || 0);
                  const style = {
                    left: isScreenCover ? '50%' : `${sample.x}%`,
                    top: isScreenCover ? '50%' : `${sample.y}%`,
                    width: isScreenCover ? `${widthPercent}%` : undefined,
                    height: isScreenCover ? `${heightPercent}%` : undefined,
                    opacity: sample.opacity,
                    transform: `translate(-50%, -50%) scale(${sample.scale}) rotate(${sample.rotation}deg)`,
                    color: track.style?.color || '#ffffff',
                    fontSize: `${track.style?.fontSize || 36}px`,
                    fontFamily: track.style?.fontFamily || 'Georgia, serif',
                    fontWeight: track.style?.weight || 700,
                    textAlign: track.style?.align || 'center',
                    background: track.style?.background || 'transparent',
                    borderRadius: `${track.style?.borderRadius || 0}px`,
                    pointerEvents: 'auto',
                    userSelect: 'none',
                    cursor: (track.keys || []).find((key) => key.id === resolveOverlayKeyId(track))?.locked ? 'not-allowed' : (overlayDrag?.trackId === track.id ? 'grabbing' : 'grab'),
                    outline: isSelected ? '1px solid rgba(122, 208, 255, 0.9)' : '1px dashed rgba(122, 208, 255, 0.25)',
                    outlineOffset: 2,
                    zIndex,
                    display: isScreenCover ? 'flex' : 'block',
                    alignItems: isScreenCover ? 'center' : undefined,
                    justifyContent: isScreenCover ? 'center' : undefined,
                  };

                  const interactiveProps = {
                    onPointerDown: (event) => startOverlayDrag(event, track),
                    onDoubleClick: () => selectTrack('overlay', track.id),
                    title: 'Drag to reposition overlay keyframe',
                  };

                  if (track.type === 'image' && track.style?.imageUrl) {
                    return <img key={track.id} className="overlay-preview-node" alt={track.name} src={track.style.imageUrl} style={style} {...interactiveProps} />;
                  }

                  return <div key={track.id} className="overlay-preview-node" style={style} {...interactiveProps}>{sample.text || track.content}</div>;
                })}
              </div>

              {runtimeNotices.length > 0 ? (
                <div style={{ position: 'absolute', left: 16, top: 16, zIndex: 9999, display: 'grid', gap: 8, pointerEvents: 'none' }}>
                  {runtimeNotices.map((notice, index) => (
                    <div
                      key={`${notice.kind}_${index}_${notice.label}`}
                      style={{
                        padding: '0.45rem 0.7rem',
                        borderRadius: 12,
                        background: 'rgba(8, 14, 24, 0.82)',
                        color: '#eaf4ff',
                        border: '1px solid rgba(112, 184, 255, 0.22)',
                        boxShadow: '0 12px 26px rgba(0, 0, 0, 0.22)',
                        fontSize: 12,
                        letterSpacing: '0.02em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {notice.label}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="arcana-panel timeline-panel">
              <div className="timeline-controls">
                <button onClick={() => setPlayheadMs(0)}>Rewind</button>
                <button onClick={() => setIsPlaying((value) => !value)}>{isPlaying ? 'Pause' : 'Play'}</button>
                <button onClick={() => setPlayheadMs((value) => clamp(value - 100, 0, selectedCard.durationMs || 1))}>-100ms</button>
                <button onClick={() => setPlayheadMs((value) => clamp(value + 100, 0, selectedCard.durationMs || 1))}>+100ms</button>
                {selectedTrack ? <button onClick={() => addKeyToTrack(selection.trackType, selectedTrack.id)}>Add Moment</button> : null}
                {selectedKey ? <button onClick={removeSelectedKey}>Delete Moment</button> : null}
                {selectedTrack ? <button className="danger-button" onClick={removeSelectedTrack}>Delete Layer</button> : null}
              </div>

              <div className="playhead-slider-wrap">
                <input
                  className="playhead-slider"
                  type="range"
                  min={0}
                  max={Math.max(1, selectedCard.durationMs || 1)}
                  value={Math.round(playheadMs)}
                  onChange={(event) => setPlayheadMs(Number(event.target.value))}
                />
                <div className="graph-caption">{Math.round(playheadMs)} ms / {selectedCard.durationMs} ms</div>
              </div>

              <div className="timeline-scroll-wrap">
                <div className="timeline-rows">
                  {timelineRows.map((row) => {
                    const track = findTrack(selectedCard, row.type, row.id);
                    const keys = track?.keys || [];
                    const laneId = `${row.type}_${row.id}`;

                    return (
                      <div key={laneId} className={`timeline-row ${selection?.trackType === row.type && selection?.trackId === row.id ? 'selected' : ''}`}>
                        <button className="timeline-label" onClick={() => selectTrack(row.type, row.id)}>
                          <span>{row.type}</span>
                          <strong>{row.label}</strong>
                        </button>
                        <div
                          className="timeline-lane"
                          ref={(el) => { laneRefs.current[laneId] = el; }}
                          onDoubleClick={() => addKeyToTrack(row.type, row.id)}
                        >
                          <div className="timeline-playhead" style={{ left: `${(playheadMs / Math.max(1, selectedCard.durationMs)) * 100}%` }} />
                          {keys.map((key) => (
                            <button
                              key={key.id}
                              className={`timeline-key ${selection?.keyId === key.id ? 'selected' : ''}`}
                              style={{ left: `${((key.timeMs || 0) / Math.max(1, selectedCard.durationMs)) * 100}%` }}
                              onMouseDown={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                selectKey(row.type, row.id, key.id);
                                setDragKey({ trackType: row.type, trackId: row.id, keyId: key.id });
                              }}
                              onClick={() => {
                                setPlayheadMs(key.timeMs || 0);
                                selectKey(row.type, row.id, key.id);
                              }}
                              title={`${row.type} key @ ${key.timeMs}ms`}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </main>

        <aside className="arcana-inspector">
          <div className="arcana-panel inspector-section">
            <div className="arcana-panel-title">Inspector</div>

            {!selectedTrack ? (
              <>
                <p>Select a layer or moment to shape spell behavior in detail.</p>
                <label>
                  Description
                  <div className="description-readonly">{selectedCardDescription}</div>
                </label>
              </>
            ) : (
              <>
                <label>
                  Layer Name
                  <input value={selectedTrack.name || ''} onChange={(event) => updateTrackField(selection.trackType, selectedTrack.id, { name: event.target.value })} />
                </label>

                {selection.trackType === 'object' ? (
                  <>
                    <label>
                      Type
                      <select value={selectedTrack.type || (selectedTrack.isAnimatablePiece ? 'piece' : 'mesh')} onChange={(event) => updateTrackField('object', selectedTrack.id, { type: event.target.value })}>
                        <option value="piece">Piece</option>
                        <option value="mesh">Mesh</option>
                        <option value="part">Part</option>
                      </select>
                    </label>

                    {(selectedTrack.type || (selectedTrack.isAnimatablePiece ? 'piece' : 'mesh')) === 'piece' ? (
                      <>
                        <label>
                          Piece
                          <select value={selectedTrack.pieceType || 'p'} onChange={(event) => updateTrackField('object', selectedTrack.id, { pieceType: event.target.value })}>
                            <option value="p">Pawn</option>
                            <option value="n">Knight</option>
                            <option value="b">Bishop</option>
                            <option value="r">Rook</option>
                            <option value="q">Queen</option>
                            <option value="k">King</option>
                          </select>
                        </label>
                        <label>
                          Color
                          <select value={selectedTrack.pieceColor || 'white'} onChange={(event) => updateTrackField('object', selectedTrack.id, { pieceColor: event.target.value })}>
                            <option value="white">White</option>
                            <option value="black">Black</option>
                          </select>
                        </label>
                        <p>Front direction guide: positive Z is forward. Use rotation gizmo to set facing before keyframing motion.</p>
                      </>
                    ) : (
                      <>
                        <label className="file-like-button inline">
                          Mesh import disabled
                          <input type="file" disabled />
                        </label>
                        <label>
                          Clip Name
                          <input value={selectedTrack.clipName || ''} onChange={(event) => updateTrackField('object', selectedTrack.id, { clipName: event.target.value || null })} />
                        </label>
                        <label>
                          Clip Offset (ms)
                          <input type="number" value={selectedTrack.clipOffsetMs || 0} onChange={(event) => updateTrackField('object', selectedTrack.id, { clipOffsetMs: Number(event.target.value) || 0 })} />
                        </label>
                        <label>
                          Loop Clip
                          <select value={selectedTrack.clipLoop === false ? 'off' : 'on'} onChange={(event) => updateTrackField('object', selectedTrack.id, { clipLoop: event.target.value === 'on' })}>
                            <option value="on">On</option>
                            <option value="off">Off</option>
                          </select>
                        </label>
                        <label>
                          Preview Play Animation
                          <select value={selectedTrack.previewPlayAnimation ? 'on' : 'off'} onChange={(event) => updateTrackField('object', selectedTrack.id, { previewPlayAnimation: event.target.value === 'on' })}>
                            <option value="off">Off</option>
                            <option value="on">On</option>
                          </select>
                        </label>
                      </>
                    )}
                  </>
                ) : null}

                {selection.trackType === 'camera' ? (
                  <>
                    <label>
                      Camera Key Count
                      <input value={(selectedTrack.keys || []).length} readOnly />
                    </label>
                  </>
                ) : null}

                {selection.trackType === 'overlay' ? (
                  <>
                    <label>
                      Overlay Type
                      <select value={selectedTrack.type || 'text'} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { type: event.target.value })}>
                        <option value="text">Text</option>
                        <option value="image">Image</option>
                        <option value="panel">Panel</option>
                        <option value="screen_cover">Screen Cover</option>
                      </select>
                    </label>
                    <label>
                      Overlay Preset
                      <select value="" onChange={(event) => { applyOverlayPreset(selectedTrack.id, event.target.value); event.target.value = ''; }}>
                        <option value="">Choose preset...</option>
                        <option value="flash">Flash</option>
                        <option value="monochrome">Monochrome</option>
                        <option value="vignette">Vignette</option>
                        <option value="title_card">Title Card</option>
                      </select>
                    </label>
                    <label>
                      Overlay Space
                      <select value={selectedTrack.space || 'screen'} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { space: event.target.value })}>
                        <option value="screen">Screen</option>
                        <option value="world">World</option>
                      </select>
                    </label>
                    <label>
                      Parent Overlay
                      <select value={selectedTrack.parentId || ''} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { parentId: event.target.value || null })}>
                        <option value="">None</option>
                        {(selectedCard.tracks?.overlays || []).filter((track) => track.id !== selectedTrack.id).map((track) => (
                          <option key={track.id} value={track.id}>{track.name || track.id}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Layer
                      <input type="number" value={selectedTrack.layer || 0} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { layer: Number(event.target.value) || 0 })} />
                    </label>
                    <label>
                      Content
                      <input value={selectedTrack.content || ''} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { content: event.target.value })} />
                    </label>
                    <label>
                      Color
                      <input value={selectedTrack.style?.color || '#ffffff'} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { style: { ...(selectedTrack.style || {}), color: event.target.value } })} />
                    </label>
                    <label>
                      Font Size
                      <input type="number" value={selectedTrack.style?.fontSize || 36} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { style: { ...(selectedTrack.style || {}), fontSize: Number(event.target.value) || 1 } })} />
                    </label>
                    <label>
                      Image URL
                      <input value={selectedTrack.style?.imageUrl || ''} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { style: { ...(selectedTrack.style || {}), imageUrl: event.target.value } })} />
                    </label>
                    {selectedTrack.type === 'screen_cover' ? (
                      <>
                        <label>
                          Width (%)
                          <input type="number" value={selectedTrack.style?.width ?? 100} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { style: { ...(selectedTrack.style || {}), width: Number(event.target.value) || 100 } })} />
                        </label>
                        <label>
                          Height (%)
                          <input type="number" value={selectedTrack.style?.height ?? 100} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { style: { ...(selectedTrack.style || {}), height: Number(event.target.value) || 100 } })} />
                        </label>
                        <label>
                          Border Radius (px)
                          <input type="number" value={selectedTrack.style?.borderRadius ?? 0} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { style: { ...(selectedTrack.style || {}), borderRadius: Number(event.target.value) || 0 } })} />
                        </label>
                      </>
                    ) : null}
                  </>
                ) : null}

                {selection.trackType === 'particle' ? (
                  <>
                    <label>
                      Particle Preset
                      <select value="" onChange={(event) => { applyParticlePreset(selectedTrack.id, event.target.value); event.target.value = ''; }}>
                        <option value="">Choose preset...</option>
                        {Object.entries(PARTICLE_PRESETS).map(([id, preset]) => (
                          <option key={id} value={id}>{preset.label}</option>
                        ))}
                      </select>
                    </label>
                    <div className="particle-preset-grid" role="list" aria-label="Particle Presets">
                      {Object.entries(PARTICLE_PRESETS).map(([id, preset]) => {
                        const preview = sanitizeParticleParams(createParticlePresetParams(id));
                        return (
                          <button
                            key={id}
                            type="button"
                            className="particle-preset-tile"
                            onClick={() => applyParticlePreset(selectedTrack.id, id)}
                            title={`${preset.label}: ${preview.spawnShape}, emit ${preview.emissionRate}/s, burst ${preview.burstCount}`}
                          >
                            <div className="particle-preset-title">{preset.label}</div>
                            <div className="particle-preset-preview" style={{ background: `linear-gradient(135deg, ${preview.colorOverLife[0]}, ${preview.colorOverLife[preview.colorOverLife.length - 1]})` }}>
                              {[0, 1, 2, 3, 4, 5].map((dot) => (
                                <span
                                  key={`${id}_${dot}`}
                                  className="particle-preset-dot"
                                  style={{
                                    left: `${12 + dot * 14}%`,
                                    animationDelay: `${dot * 0.08}s`,
                                    opacity: 0.45 + dot * 0.08,
                                  }}
                                />
                              ))}
                            </div>
                            <div className="particle-preset-meta">{preview.spawnShape} • {preview.emissionRate}/s • b{preview.burstCount}</div>
                          </button>
                        );
                      })}
                    </div>
                    <label>
                      Attach Target Track ID
                      <input value={selectedTrack.attach?.targetId || ''} onChange={(event) => updateTrackField('particle', selectedTrack.id, { attach: { ...(selectedTrack.attach || {}), targetId: event.target.value || null } })} />
                    </label>
                    <label>
                      Spawn Shape
                      <select value={selectedTrack.params?.spawnShape || 'sphere'} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), spawnShape: event.target.value } })}>
                        <option value="sphere">sphere</option>
                        <option value="ring">ring</option>
                        <option value="cone">cone</option>
                        <option value="box">box</option>
                      </select>
                    </label>
                    <label>
                      Emission Rate
                      <input type="number" value={selectedTrack.params?.emissionRate || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), emissionRate: Number(event.target.value) || 0 } })} />
                    </label>
                    <label>
                      Burst Count
                      <input type="number" value={selectedTrack.params?.burstCount || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), burstCount: Math.max(0, Number(event.target.value) || 0) } })} />
                    </label>
                    <label>
                      Spawn Radius
                      <input type="number" step="0.01" value={selectedTrack.params?.spawnRadius || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), spawnRadius: Number(event.target.value) || 0 } })} />
                    </label>
                    <label>
                      Velocity Min
                      <input type="number" step="0.01" value={selectedTrack.params?.velocityMin || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), velocityMin: Number(event.target.value) || 0 } })} />
                    </label>
                    <label>
                      Velocity Max
                      <input type="number" step="0.01" value={selectedTrack.params?.velocityMax || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), velocityMax: Number(event.target.value) || 0 } })} />
                    </label>
                    <label>
                      Lifetime Min
                      <input type="number" step="0.01" value={selectedTrack.params?.lifetimeMin || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), lifetimeMin: Number(event.target.value) || 0 } })} />
                    </label>
                    <label>
                      Lifetime Max
                      <input type="number" step="0.01" value={selectedTrack.params?.lifetimeMax || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), lifetimeMax: Number(event.target.value) || 0 } })} />
                    </label>
                    <label>
                      Noise Strength
                      <input type="number" step="0.01" value={selectedTrack.params?.noiseStrength || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), noiseStrength: Number(event.target.value) || 0 } })} />
                    </label>
                    <label>
                      Noise Frequency
                      <input type="number" step="0.01" value={selectedTrack.params?.noiseFrequency || 1.4} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), noiseFrequency: Number(event.target.value) || 1.4 } })} />
                    </label>
                    <label>
                      Drag
                      <input type="number" step="0.01" value={selectedTrack.params?.drag || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), drag: Number(event.target.value) || 0 } })} />
                    </label>
                    <label>
                      Gravity (x,y,z)
                      <input value={JSON.stringify(selectedTrack.params?.gravity || [0, -6, 0])} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), gravity: safeJsonParse(event.target.value, [0, -6, 0]) } })} />
                    </label>
                    <label>
                      Size Over Life (JSON)
                      <textarea value={JSON.stringify(selectedTrack.params?.sizeOverLife || [1, 0.7, 0], null, 2)} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), sizeOverLife: safeJsonParse(event.target.value, [1, 0.7, 0]) } })} />
                    </label>
                    <label>
                      Color Over Life (JSON)
                      <textarea value={JSON.stringify(selectedTrack.params?.colorOverLife || ['#ffffff'], null, 2)} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), colorOverLife: safeJsonParse(event.target.value, ['#ffffff']) } })} />
                    </label>
                    {particleCompatibilityWarnings.length ? (
                      <div className="particle-compatibility-box">
                        <strong>Runtime Compatibility</strong>
                        {particleCompatibilityWarnings.map((warning, idx) => (
                          <div key={`pcw_${idx}`}>• {warning}</div>
                        ))}
                      </div>
                    ) : (
                      <div className="graph-caption">Runtime compatibility looks good for this particle track.</div>
                    )}
                  </>
                ) : null}

                {selectedKey ? (
                  <>
                    <hr />
                    <h4>Moment</h4>
                    <label>
                      Time (ms)
                      <input type="number" value={selectedKey.timeMs || 0} onChange={(event) => updateKeyField(selection.trackType, selectedTrack.id, selectedKey.id, { timeMs: Math.max(0, Number(event.target.value) || 0) })} />
                    </label>

                    {'easing' in selectedKey ? (
                      <label>
                        Easing
                        <select value={selectedKey.easing || 'linear'} onChange={(event) => updateKeyField(selection.trackType, selectedTrack.id, selectedKey.id, { easing: event.target.value })}>
                          {EASINGS.map((easing) => <option key={easing} value={easing}>{easing}</option>)}
                        </select>
                      </label>
                    ) : null}

                    {selection.trackType === 'camera' ? (
                      <>
                        <label>
                          Position (x,y,z)
                          <input value={(selectedKey.position || [0, 0, 0]).join(', ')} onChange={(event) => updateKeyField('camera', selectedTrack.id, selectedKey.id, { position: event.target.value.split(',').map((v) => Number(v.trim()) || 0).slice(0, 3) })} />
                        </label>
                        <label>
                          Target (x,y,z)
                          <input value={(selectedKey.target || [0, 0, 0]).join(', ')} onChange={(event) => updateKeyField('camera', selectedTrack.id, selectedKey.id, { target: event.target.value.split(',').map((v) => Number(v.trim()) || 0).slice(0, 3) })} />
                        </label>
                        <label>
                          FOV
                          <input type="number" value={selectedKey.fov || 55} onChange={(event) => updateKeyField('camera', selectedTrack.id, selectedKey.id, { fov: Number(event.target.value) || 55 })} />
                        </label>
                        <label>
                          Blend Mode
                          <select value={selectedKey.blendMode || 'curve'} onChange={(event) => updateKeyField('camera', selectedTrack.id, selectedKey.id, { blendMode: event.target.value })}>
                            <option value="curve">Curve</option>
                            <option value="cut">Cut</option>
                          </select>
                        </label>
                      </>
                    ) : null}

                    {selection.trackType === 'object' ? (
                      <>
                        <label>
                          Position (x,y,z)
                          <input value={(selectedKey.position || [0, 0, 0]).join(', ')} onChange={(event) => updateKeyField('object', selectedTrack.id, selectedKey.id, { position: event.target.value.split(',').map((v) => Number(v.trim()) || 0).slice(0, 3) })} />
                        </label>
                        <label>
                          Rotation (x,y,z)
                          <input value={(selectedKey.rotation || [0, 0, 0]).join(', ')} onChange={(event) => updateKeyField('object', selectedTrack.id, selectedKey.id, { rotation: event.target.value.split(',').map((v) => Number(v.trim()) || 0).slice(0, 3) })} />
                        </label>
                        <label>
                          Scale (x,y,z)
                          <input value={(selectedKey.scale || [1, 1, 1]).join(', ')} onChange={(event) => updateKeyField('object', selectedTrack.id, selectedKey.id, { scale: event.target.value.split(',').map((v) => Number(v.trim()) || 1).slice(0, 3) })} />
                        </label>
                      </>
                    ) : null}

                    {selection.trackType === 'overlay' ? (
                      <>
                        <label>
                          Text Override
                          <input value={selectedKey.text ?? ''} onChange={(event) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { text: event.target.value })} />
                        </label>
                        <label>
                          Lock Overlay
                          <select
                            value={selectedKey.locked ? 'on' : 'off'}
                            onChange={(event) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { locked: event.target.value === 'on' })}
                          >
                            <option value="off">Off</option>
                            <option value="on">On</option>
                          </select>
                        </label>
                        <label>
                          X (%)
                          <input type="number" value={selectedKey.x ?? 50} onChange={(event) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { x: Number(event.target.value) || 0 })} />
                        </label>
                        <label>
                          Y (%)
                          <input type="number" value={selectedKey.y ?? 50} onChange={(event) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { y: Number(event.target.value) || 0 })} />
                        </label>
                        <label>
                          Opacity
                          <input type="number" step="0.05" value={selectedKey.opacity ?? 1} onChange={(event) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { opacity: Number(event.target.value) || 0 })} />
                        </label>
                        <label>
                          Scale
                          <input type="number" step="0.05" value={selectedKey.scale ?? 1} onChange={(event) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { scale: Number(event.target.value) || 1 })} />
                        </label>
                        <label>
                          Rotation (deg)
                          <input type="number" step="0.1" value={selectedKey.rotation ?? 0} onChange={(event) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { rotation: Number(event.target.value) || 0 })} />
                        </label>
                        <div className="overlay-nudge-grid">
                          <button type="button" onClick={() => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { x: clamp((selectedKey.x ?? 50) - 1, 0, 100) }, false)}>◀ 1</button>
                          <button type="button" onClick={() => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { x: clamp((selectedKey.x ?? 50) + 1, 0, 100) }, false)}>1 ▶</button>
                          <button type="button" onClick={() => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { y: clamp((selectedKey.y ?? 50) - 1, 0, 100) }, false)}>▲ 1</button>
                          <button type="button" onClick={() => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { y: clamp((selectedKey.y ?? 50) + 1, 0, 100) }, false)}>1 ▼</button>
                          <button type="button" onClick={() => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { x: 50, y: 50 }, false)}>Center</button>
                          <button type="button" onClick={() => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { x: 10, y: 10 }, false)}>Top Left</button>
                          <button type="button" onClick={() => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { x: 90, y: 10 }, false)}>Top Right</button>
                          <button type="button" onClick={() => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { x: 50, y: 90 }, false)}>Bottom Center</button>
                        </div>
                      </>
                    ) : null}

                    {selection.trackType === 'particle' ? (
                      <>
                        <label>
                          Enabled
                          <select value={selectedKey.enabled ? 'on' : 'off'} onChange={(event) => updateKeyField('particle', selectedTrack.id, selectedKey.id, { enabled: event.target.value === 'on' })}>
                            <option value="on">On</option>
                            <option value="off">Off</option>
                          </select>
                        </label>
                        <label>
                          Seed
                          <input type="number" value={selectedKey.seed ?? 1337} onChange={(event) => updateKeyField('particle', selectedTrack.id, selectedKey.id, { seed: Math.round(Number(event.target.value) || 0) })} />
                        </label>
                        <label>
                          Overrides (JSON)
                          <textarea
                            value={JSON.stringify(selectedKey.overrides || {}, null, 2)}
                            onChange={(event) => updateKeyField('particle', selectedTrack.id, selectedKey.id, { overrides: safeJsonParse(event.target.value, {}) })}
                          />
                        </label>
                      </>
                    ) : null}

                    {selection.trackType === 'sound' ? (
                      <>
                        <label>
                          Sound ID
                          <input value={selectedKey.soundId || ''} onChange={(event) => updateKeyField('sound', selectedTrack.id, selectedKey.id, { soundId: normalizeStudioSoundId(event.target.value) })} />
                        </label>
                        <div className="graph-caption">Tip: use arcana:execution, music:menu, move, capture, or /sounds/... path.</div>
                        <label>
                          Volume
                          <input type="number" step="0.05" value={selectedKey.volume ?? 1} onChange={(event) => updateKeyField('sound', selectedTrack.id, selectedKey.id, { volume: Number(event.target.value) || 1 })} />
                        </label>
                        <label>
                          Pitch
                          <input type="number" step="0.05" value={selectedKey.pitch ?? 1} onChange={(event) => updateKeyField('sound', selectedTrack.id, selectedKey.id, { pitch: Number(event.target.value) || 1 })} />
                        </label>
                        <label>
                          Loop
                          <select value={selectedKey.loop ? 'on' : 'off'} onChange={(event) => updateKeyField('sound', selectedTrack.id, selectedKey.id, { loop: event.target.value === 'on' })}>
                            <option value="off">Off</option>
                            <option value="on">On</option>
                          </select>
                        </label>
                      </>
                    ) : null}

                    {selection.trackType === 'event' ? (
                      <>
                        <label>
                          Event Type
                          <input list="arcana-studio-event-types" value={selectedKey.type || ''} onChange={(event) => updateKeyField('event', selectedTrack.id, selectedKey.id, { type: event.target.value })} />
                        </label>
                        <datalist id="arcana-studio-event-types">
                          {KNOWN_GAME_EVENT_TYPES.map((eventType) => <option key={eventType} value={eventType} />)}
                        </datalist>
                        <div className="graph-caption">Includes all known game/cutscene actions plus runtime event actions.</div>
                        <label>
                          Delay (ms)
                          <input type="number" value={selectedKey.delayMs || 0} onChange={(event) => updateKeyField('event', selectedTrack.id, selectedKey.id, { delayMs: Math.max(0, Number(event.target.value) || 0) })} />
                        </label>
                        <label>
                          Payload (JSON)
                          <textarea
                            value={JSON.stringify(selectedKey.payload || {}, null, 2)}
                            onChange={(event) => updateKeyField('event', selectedTrack.id, selectedKey.id, { payload: safeJsonParse(event.target.value, {}) })}
                          />
                        </label>
                      </>
                    ) : null}
                  </>
                ) : null}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
