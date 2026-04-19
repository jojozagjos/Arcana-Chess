import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, TransformControls } from '@react-three/drei';
import { ChessPiece } from './ChessPiece.jsx';
import { ArcanaStudioTutorial } from './ArcanaStudioTutorial.jsx';
import { CutsceneOverlay } from './CutsceneOverlay.jsx';
import {
  createEmptyArcanaStudioCard,
  migrateArcanaStudioCard,
} from '../game/arcana/studio/arcanaStudioSchema.js';
import {
  collectTimelineRows,
  sampleCameraTrack,
  sampleObjectTrack,
  sampleOverlayTrack,
} from '../game/arcana/studio/arcanaStudioPlayback.js';
import {
  getScreenOverlaySamples,
  normalizeArcanaStudioEventActions,
  resolveSoundPreviewUrl,
} from '../game/arcana/studio/arcanaStudioRuntime.js';
import { getArcanaEffectDuration } from '../game/arcana/arcanaTimings.js';
import { getAllCutsceneCards, getAllCutsceneConfigs } from '../game/arcana/cutsceneDefinitions.js';
import { legacyCutsceneToArcanaStudioCard, arcanaStudioCardToLegacyCutscene } from '../game/arcana/studio/arcanaStudioBridge.js';
import { getArcanaDefinition, listArcanaDefinitions, toStudioArcanaId } from '../game/arcanaCatalog.js';
import { ArcanaVisualHost } from '../game/arcana/ArcanaVisualHost.jsx';
import { soundManager } from '../game/soundManager.js';
import { squareToPosition } from '../game/arcana/sharedHelpers.jsx';
import './styles/ArcanaStudio.css';

const DEFAULT_WORLD_ANCHOR = [0, 0.075, 0];
const EMPTY_VFX_OBJECT = {};
const EASINGS = ['linear', 'instant', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'customBezier'];
const TRACK_TYPES = ['camera', 'object', 'sound'];
const STUDIO_CARD_AUDIO_DEFAULTS = {
  time_freeze: {
    freezeTickSoundId: '/sounds/arcana/clock_ticking.mp3',
  },
  edgerunner_overdrive: {
    overdriveThemeSoundId: '/sounds/music/I_Really_Want_to_Stay in_This_Game.mp3',
  },
};
const STUDIO_CARD_AUDIO_FIELDS = {
  time_freeze: [
    {
      key: 'freezeTickSoundId',
      label: 'Time Freeze Clock Loop',
      historyLabel: 'Updated freeze clock loop',
    },
  ],
  edgerunner_overdrive: [
    {
      key: 'overdriveThemeSoundId',
      label: 'Edgerunner Theme Loop',
      historyLabel: 'Updated overdrive loop',
    },
  ],
};
const STUDIO_SOUND_SUGGESTIONS = [
  'arcana:clock_ticking',
  'arcana:time_freeze',
  'arcana:time_freeze_freeze',
  'arcana:time_freeze_ambient',
  'arcana:time_freeze_unfreeze',
  'arcana:edgerunner_overdrive',
  'arcana:edgerunner_overdrive_activation',
  'arcana:edgerunner_overdrive_rush',
  'arcana:edgerunner_overdrive_hitstop',
  'arcana:edgerunner_overdrive_release',
  'music:menu',
  'music:tutorial',
  'music:ingame',
  '/sounds/music/I_Really_Want_to_Stay in_This_Game.mp3',
];
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

function StudioNumberInput({ value, fallback = 0, onChange, ...props }) {
  const [draft, setDraft] = useState(String(value ?? fallback));
  const editingRef = useRef(false);

  useEffect(() => {
    if (!editingRef.current) {
      setDraft(String(value ?? fallback));
    }
  }, [fallback, value]);

  const commitDraft = (nextDraft) => {
    const normalized = nextDraft.trim();
    if (!normalized) {
      setDraft(String(value ?? fallback));
      return;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value ?? fallback));
      return;
    }

    onChange(parsed);
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={draft}
      onFocus={() => {
        editingRef.current = true;
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur();
        }
      }}
      onBlur={() => {
        editingRef.current = false;
        commitDraft(draft);
      }}
      onChange={(event) => {
        const nextDraft = event.target.value;
        setDraft(nextDraft);
      }}
    />
  );
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

function computeCanAnimatePiece(cardId, card = {}, definition = null) {
  const resolvedDefinition = definition || findDefinitionById(cardId);
  if (resolvedDefinition) {
    return Boolean(resolvedDefinition.visual?.animation) || Boolean(resolvedDefinition.visual?.cutscene);
  }

  if (Boolean(card?.meta?.canAnimatePiece) || Boolean(card?.meta?.isCutscene)) {
    return true;
  }

  const objectTracks = card?.tracks?.objects || [];
  if (objectTracks.some((track) => track?.type === 'piece' || track?.isAnimatablePiece)) {
    return true;
  }

  return false;
}

function compareLibraryCards([idA, cardA], [idB, cardB]) {
  const defA = findDefinitionById(idA);
  const defB = findDefinitionById(idB);

  const rarityA = getCardRarity(cardA, defA);
  const rarityB = getCardRarity(cardB, defB);
  const rarityDiff = (RARITY_ORDER[rarityB] || 0) - (RARITY_ORDER[rarityA] || 0);
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

function trackTypeLabel(type) {
  switch (type) {
    case 'camera': return 'Camera';
    case 'object': return 'Piece';
    case 'sound': return 'Audio';
    case 'event': return 'Event';
    default: return String(type || 'Track');
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

function getTimelineRequiredDurationMs(card) {
  if (!card || typeof card !== 'object') return 100;
  const trackSets = [
    ...(card?.tracks?.camera || []),
    ...(card?.tracks?.objects || []),
    ...(card?.tracks?.particles || []),
    ...(card?.tracks?.overlays || []),
    ...(card?.tracks?.sounds || []),
    ...(card?.tracks?.events || []),
  ];

  let maxMs = 100;
  trackSets.forEach((track) => {
    (track?.keys || []).forEach((key) => {
      const timeMs = Math.max(0, Number(key?.timeMs) || 0);
      const delayMs = Math.max(0, Number(key?.delayMs) || 0);
      maxMs = Math.max(maxMs, timeMs, timeMs + delayMs);
    });
  });

  return Math.max(100, Math.round(maxMs));
}

function getTimelineSnapStepMs(card) {
  const step = Number(card?.settings?.timelineSnapMs);
  if (!Number.isFinite(step)) return 50;
  return Math.max(1, Math.round(step));
}

function snapTimelineTimeMs(rawTimeMs, card) {
  const clamped = Math.max(0, Number(rawTimeMs) || 0);
  const snapEnabled = card?.settings?.timelineSnapEnabled !== false;
  if (!snapEnabled) return Math.round(clamped);
  const step = getTimelineSnapStepMs(card);
  return Math.round(clamped / step) * step;
}

function isEditableTarget(target) {
  if (!target || typeof target !== 'object') return false;
  const tag = String(target.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target.isContentEditable);
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
  const cardSoundId = gameCard.soundId || `arcana:${id}`;
  const next = createEmptyArcanaStudioCard(id);
  next.id = id;
  next.name = gameCard.name || id;
  next.description = gameCard.description || '';
  next.meta = {
    ...(next.meta || {}),
    isCutscene,
    canAnimatePiece: computeCanAnimatePiece(id, gameCard, gameCard),
    cardPiecePreview: gameCard.cardPiecePreview || null,
    rarity: gameCard.rarity || 'common',
    category: gameCard.category || 'utility',
    soundId: cardSoundId || null,
    audioConfig: {
      ...(STUDIO_CARD_AUDIO_DEFAULTS[id] || {}),
      ...(next.meta?.audioConfig || {}),
    },
  };

  if (cardSoundId && (!next.tracks?.sounds || next.tracks.sounds.length === 0)) {
    next.tracks = {
      ...(next.tracks || {}),
      sounds: [createDefaultSoundTrack(cardSoundId)],
    };
  }

  return next;
}

function normalizeCardId(cardId = '') {
  return toStudioArcanaId(cardId);
}

function pascalCase(id = '') {
  return String(id || '')
    .split(/[_-]/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join('');
}

function resolveArcanaDefinitionId(rawId, fallbackId, effectsModule = null) {
  const normalizedRaw = normalizeCardId(rawId || '');
  const normalizedFallback = normalizeCardId(fallbackId || '');
  const alias = {
    filtered_cycle: 'arcane_cycle',
    arcane_cycle: 'filtered_cycle',
  };

  const candidates = [
    normalizedRaw,
    alias[normalizedRaw] || null,
    normalizedFallback,
    alias[normalizedFallback] || null,
  ].filter(Boolean);

  const uniqueCandidates = [...new Set(candidates)];
  if (!uniqueCandidates.length) return null;

  if (!effectsModule || typeof effectsModule !== 'object') {
    return uniqueCandidates[0];
  }

  for (const candidate of uniqueCandidates) {
    const componentName = `${pascalCase(candidate)}Effect`;
    if (effectsModule[componentName]) return candidate;
  }

  if (effectsModule.LegendaryEffect) {
    const legendaryCandidate = uniqueCandidates.find((candidate) => {
      const rarity = findDefinitionById(candidate)?.rarity;
      return typeof rarity === 'string' && rarity.toLowerCase() === 'legendary';
    });
    if (legendaryCandidate) return legendaryCandidate;
  }

  return uniqueCandidates[0];
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
  const objectKeys = (card.tracks?.objects || []).reduce((acc, track) => acc + (track.keys || []).length, 0);
  const soundKeys = (card.tracks?.sounds || []).reduce((acc, track) => acc + (track.keys || []).length, 0);
  return cameraKeys > 1 || objectKeys > 0 || soundKeys > 0;
}

function hasLegacyVfxData(config) {
  const vfx = config?.config?.vfx;
  return Boolean(vfx && typeof vfx === 'object' && Object.keys(vfx).length > 0);
}

function getCardMainPieceSquare(card = {}) {
  const objectTracks = Array.isArray(card?.tracks?.objects) ? card.tracks.objects : [];
  const mainPieceTrack = objectTracks.find((track) => track?.type === 'piece' && (track?.name === 'Main Piece' || track?.isAnimatablePiece));
  return normalizeMainPieceSquare(mainPieceTrack?.pieceSquare || card?.meta?.cardPiecePreview || card?.board?.focusSquare);
}

function sampleStudioVfxPreview(card, timeMs, effectsModule = null) {
  const events = card?.tracks?.events || [];
  const fallbackSquare = getCardMainPieceSquare(card);
  let preview = null;
  let previewStartMs = -1;

  events.forEach((track) => {
    (track?.keys || []).forEach((key) => {
      const startMs = Number(key?.timeMs) || 0;
      if (startMs > timeMs || startMs < previewStartMs) return;

      const actions = Array.isArray(key?.actions) && key.actions.length > 0
        ? key.actions
        : normalizeArcanaStudioEventActions({
          ...key,
          payload: {
            ...(key?.payload || {}),
            cardId: key?.payload?.cardId || card?.id,
            eventParams: {
              ...(key?.payload?.eventParams || {}),
              cardId: key?.payload?.eventParams?.cardId || card?.id,
              square: key?.payload?.eventParams?.square || fallbackSquare,
              targetSquare: key?.payload?.eventParams?.targetSquare || fallbackSquare,
            },
          },
        });

      actions.forEach((action) => {
        if (action?.kind !== 'vfx') return;
        const resolvedArcanaId = resolveArcanaDefinitionId(action.arcanaId, card?.id, effectsModule);
        if (!resolvedArcanaId) return;

        const durationMs = Math.max(
          300,
          Number(action.durationMs) || getArcanaEffectDuration(resolvedArcanaId) || 1200,
        );
        if (timeMs > startMs + durationMs) return;

        previewStartMs = startMs;
        preview = {
          arcanaId: resolvedArcanaId,
          params: {
            ...(action.params || {}),
            square: action?.params?.square || action?.params?.targetSquare || fallbackSquare,
          },
          key: `studio_vfx_preview_${track?.id || 'track'}_${key?.id || startMs}`,
        };
      });
    });
  });

  return preview;
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
  const overrideIds = new Set(Object.keys(cutsceneCards || {}).map((id) => normalizeCardId(id)));
  const seedIds = new Set([...cutsceneIds, ...overrideIds]);
  seedIds.forEach((id) => {
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
    const hasOverrideCard = Boolean(cards[id]);
    if (!cards[id]) {
      cards[id] = makeCardFromGameCard({ ...gameCard, id }, isCutscene, id);
    } else {
      cards[id].name = cards[id].name || gameCard.name || id;
      cards[id].description = cards[id].description || gameCard.description || '';
      cards[id].meta = { ...(cards[id].meta || {}), isCutscene: Boolean(cards[id].meta?.isCutscene || isCutscene) };
    }

    if (!isCutscene && !hasOverrideCard) {
      cards[id].tracks = {
        ...(cards[id].tracks || {}),
        camera: [],
      };
    }
  });

  return cards;
}

function normalizeMainPieceSquare(pieceSquare) {
  const normalized = String(pieceSquare || '').trim().toLowerCase();
  if (normalized === 'source' || normalized === 'target' || normalized === 'center') {
    return normalized;
  }
  return 'center';
}

function sanitizeCardForStudio(rawCard, fallbackId = 'new_card') {
  const id = normalizeCardId(rawCard?.id || fallbackId);
  const migrated = migrateArcanaStudioCard(rawCard, id);
  const definition = findDefinitionById(id);
  const definitionSoundId = definition?.soundId || `arcana:${id}`;
  const isCutscene = Boolean(definition?.visual?.cutscene);
  const legacyCutscene = LEGACY_CUTSCENE_CONFIGS?.[id] || LEGACY_CUTSCENE_CONFIGS?.[(id === 'filtered_cycle' ? 'arcane_cycle' : id)] || null;
  const defaultPieceSquare = normalizeMainPieceSquare(migrated.meta?.cardPiecePreview || migrated.board?.focusSquare);

  const tracks = { ...(migrated.tracks || {}) };
  let objects = [...(tracks.objects || [])];
  if (!objects.length) {
    objects = [createDefaultTrack('object', 0, defaultPieceSquare, id, { mainPiece: true })];
  }

  const pieceTrackIndex = objects.findIndex((track) => track?.type === 'piece');
  if (pieceTrackIndex < 0) {
    objects.unshift(createDefaultTrack('object', 0, defaultPieceSquare, id, { mainPiece: true }));
  } else if (pieceTrackIndex > 0) {
    const [main] = objects.splice(pieceTrackIndex, 1);
    objects.unshift(main);
  }

  const mainPiece = objects[0] || createDefaultTrack('object', 0, defaultPieceSquare, id);
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
    pieceSquare: normalizeMainPieceSquare(mainPiece.pieceSquare || defaultPieceSquare),
    pieceType: mainPiece.pieceType || inferPieceTypeFromCard(id),
    pieceColor: mainPiece.pieceColor || 'white',
    isAnimatablePiece: true,
    attach: {
      mode: mainPiece.attach?.mode || 'follow',
      targetId: mainPiece.attach?.targetId || null,
      parentId: null,
      offset: Array.isArray(mainPiece.attach?.offset) && mainPiece.attach.offset.length >= 3
        ? [Number(mainPiece.attach.offset[0]) || 0, Number(mainPiece.attach.offset[1]) || 0, Number(mainPiece.attach.offset[2]) || 0]
        : [0, 0, 0],
      parenting: mainPiece.attach?.parenting ?? true,
    },
    keys: normalizedMainPieceKeys,
  };

  tracks.objects = objects;
  tracks.particles = [];
  tracks.overlays = [];
  tracks.camera = isCutscene ? [...(tracks.camera || [])] : [];

  if ((!tracks.sounds || tracks.sounds.length === 0) && definitionSoundId) {
    tracks.sounds = [createDefaultSoundTrack(definitionSoundId)];
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
      canAnimatePiece: computeCanAnimatePiece(id, { ...migrated, tracks }, definition),
      rarity: definition?.rarity || migrated.meta?.rarity || 'common',
      category: definition?.category || migrated.meta?.category || 'utility',
      soundId: definitionSoundId || migrated.meta?.soundId || null,
      audioConfig: {
        ...(STUDIO_CARD_AUDIO_DEFAULTS[id] || {}),
        ...(migrated.meta?.audioConfig || {}),
      },
    },
  };
}

function buildStudioCardsMap() {
  const base = getAllAvailableCards();
  const normalized = {};

  Object.entries(base).forEach(([id, card]) => {
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

function createDefaultTrack(type, playheadMs = 0, pieceSquare = 'center', cardId = '', options = {}) {
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
        bezier: [0.25, 0.1, 0.25, 1]
      }],
    };
  }

  if (type === 'object') {
    const isMainPiece = options.mainPiece === true;
    return {
      id: uid('obj'),
      name: isMainPiece ? 'Main Piece' : 'Cube',
      active: true,
      type: isMainPiece ? 'piece' : 'mesh',
      parentId: null,
      layer: 0,
      pieceSquare,
      pieceType: isMainPiece ? inferPieceTypeFromCard(cardId) : null,
      pieceColor: 'white',
      clipName: null,
      clipOffsetMs: 0,
      clipLoop: true,
      previewPlayAnimation: false,
      isAnimatablePiece: isMainPiece,
      attach: { mode: 'follow', targetId: null, parentId: null, offset: [0, 0, 0], parenting: true },
      keys: [],
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
      return [x, 0.075, z];
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

function TrackFallbackMesh({ track, piece }) {
  if (track.type === 'piece') {
    const renderedPiece = piece || {
      square: track.pieceSquare || 'center',
      type: track.pieceType || 'p',
      isWhite: (track.pieceColor || 'white') !== 'black',
      targetPosition: [0, 0.075, 0],
    };
    // Keep local target at origin so the world anchor controls board alignment.
    return <ChessPiece {...renderedPiece} targetPosition={[0, 0, 0]} />;
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
  onCameraSnapshotChange,
  previewMode,
  isPlaying,
  showCameraGizmos,
  activeVisualArcana,
  effectsModule,
}) {
  const controlsRef = useRef(null);
  const { camera } = useThree();

  const activeObjects = useMemo(() => card.tracks?.objects || [], [card]);
  const activeOverlays = useMemo(() => sampledOverlays || [], [sampledOverlays]);
  const pieceBySquare = useMemo(() => new Map(boardPieces.map((piece) => [piece.square, piece])), [boardPieces]);

  const animatedSquares = useMemo(
    () => new Set(activeObjects.filter((track) => track.type === 'piece' && track.pieceSquare).map((track) => track.pieceSquare)),
    [activeObjects],
  );

  useEffect(() => {
    const shouldDriveCamera = Boolean(sampledCamera);
    if (!shouldDriveCamera) return;
    camera.position.set(...(sampledCamera.position || [7, 8, 7]));
    camera.fov = sampledCamera.fov || 55;
    camera.updateProjectionMatrix();
    controlsRef.current?.target.set(...(sampledCamera.target || [0, 0, 0]));
    controlsRef.current?.update();
  }, [camera, sampledCamera]);

  useFrame(() => {
    onCameraSnapshotChange?.({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: controlsRef.current ? [controlsRef.current.target.x, controlsRef.current.target.y, controlsRef.current.target.z] : [0, 0, 0],
      rotation: [camera.rotation.x, camera.rotation.y, camera.rotation.z],
      fov: camera.fov,
    });
  });

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
        if (!piece && track.type === 'piece' && ['target', 'source', 'center'].includes((track.pieceSquare || '').toLowerCase())) {
          piece = {
            type: track.pieceType || 'p',
            isWhite: (track.pieceColor || 'white') !== 'black',
            square: 'center',
            targetPosition: [0, 0, 0],
          };
        }
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
          mode={cameraTransformTarget === 'target' ? 'translate' : (transformMode === 'scale' ? 'translate' : transformMode)}
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
            if (cameraTransformTarget === 'target') {
              onTransformCameraKey?.({ target: [node.position.x, node.position.y, node.position.z] });
              return;
            }

            if (transformMode === 'rotate') {
              onTransformCameraKey?.({ rotation: [node.rotation.x, node.rotation.y, node.rotation.z] });
              return;
            }

            onTransformCameraKey?.({ position: [node.position.x, node.position.y, node.position.z] });
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

      <ArcanaVisualHost
        effectsModule={effectsModule}
        activeVisualArcana={activeVisualArcana}
        gameState={{ activeEffects: {} }}
        pawnShields={null}
        showFog={false}
        viewerColorCode={null}
      />

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

function parseLegacyCutsceneInput(rawText, fallbackId, fallbackDurationMs) {
  const source = String(rawText || '').trim();
  if (!source) throw new Error('Legacy cutscene input is empty');

  let text = source
    .replace(/^\s*export\s+const\s+[A-Za-z_$][\w$]*\s*=\s*/m, '')
    .replace(/;\s*$/, '')
    .replace(/^\s*\/\/[^\n]*$/gm, '');

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    try {
      // Accept object-literal style config snippets copied from JS source.
      parsed = Function('return (' + text + ');')();
    } catch (error) {
      throw new Error(`Could not parse legacy cutscene input: ${error.message}`);
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Legacy cutscene input must evaluate to an object');
  }

  if (parsed.id && parsed.config && typeof parsed.config === 'object') {
    return parsed;
  }

  if (parsed.camera || parsed.overlay || parsed.vfx || parsed.sound || parsed.phases) {
    return {
      id: fallbackId,
      duration: Number(fallbackDurationMs) || 3000,
      config: parsed,
    };
  }

  throw new Error('Legacy cutscene must include id + config or a config object with camera/vfx/sound/phases');
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
  const [legacyVfxDraft, setLegacyVfxDraft] = useState('{}');
  const [runtimeNotices, setRuntimeNotices] = useState([]);
  const [activeVisualArcana, setActiveVisualArcana] = useState(null);
  const [effectsModule, setEffectsModule] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const [selectedKeyIds, setSelectedKeyIds] = useState([]);
  const [overlayDrag, setOverlayDrag] = useState(null);
  const suppressDeselectUntilRef = useRef(0);
  const overlayStageRef = useRef(null);
  const overlayRuntimeRef = useRef(null);
  const cameraSnapshotRef = useRef({ position: [7, 8, 7], target: [0, 0, 0], rotation: [0, 0, 0], fov: 55 });

  const laneRefs = useRef({});
  const playbackFrameRef = useRef(null);
  const playbackStartRef = useRef(0);
  const playbackOriginRef = useRef(0);
  const audioTimersRef = useRef([]);
  const audioNodesRef = useRef([]);
  const visualTimersRef = useRef([]);
  const studioPlaybackPrevPlayheadRef = useRef(0);
  const studioPlaybackLoopRef = useRef(0);
  const studioPlaybackFiredSoundRef = useRef(new Set());
  const studioPlaybackFiredEventRef = useRef(new Set());
  const studioPlaybackFiredVfxRef = useRef(new Map());
  const studioScrubPreviewKeyRef = useRef(null);
  const keyClipboardRef = useRef(null);
  const undoStackRef = useRef([]);
  const suppressHistoryRef = useRef(false);

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
    if (!selectedTrack) return null;
    if (selection?.keyId) {
      return (selectedTrack.keys || []).find((key) => key.id === selection.keyId) || null;
    }
    if (selectedKeyIds.length > 0) {
      const selectedSet = new Set(selectedKeyIds);
      return (selectedTrack.keys || []).find((key) => selectedSet.has(key.id)) || null;
    }
    return null;
  }, [selectedTrack, selection, selectedKeyIds]);

  const screenOverlays = useMemo(
    () => getScreenOverlaySamples(selectedCard, playheadMs),
    [playheadMs, selectedCard],
  );
  const selectedCardAudioFields = useMemo(
    () => STUDIO_CARD_AUDIO_FIELDS[selectedId] || [],
    [selectedId],
  );
  const selectedCardDescription = useMemo(() => getCardDescription(selectedCard) || 'No description', [selectedCard]);
  const selectedLegacyVfx = useMemo(() => {
    const metaVfx = selectedCard?.meta?.legacyConfigSnapshot?.config?.vfx || selectedCard?.meta?.legacyCutsceneSnapshot?.config?.vfx;
    if (metaVfx && typeof metaVfx === 'object') return metaVfx;
    const canonicalId = selectedId === 'filtered_cycle' ? 'arcane_cycle' : selectedId;
    const fallbackVfx = LEGACY_CUTSCENE_CONFIGS?.[canonicalId]?.config?.vfx;
    return fallbackVfx && typeof fallbackVfx === 'object' ? fallbackVfx : EMPTY_VFX_OBJECT;
  }, [selectedCard?.meta?.legacyConfigSnapshot?.config?.vfx, selectedCard?.meta?.legacyCutsceneSnapshot?.config?.vfx, selectedId]);

  useEffect(() => {
    setLegacyVfxDraft(JSON.stringify(selectedLegacyVfx || {}, null, 2));
  }, [selectedLegacyVfx]);

  const cardHasVfxEvents = useMemo(() => {
    return (selectedCard.tracks?.events || []).some((track) =>
      (track?.keys || []).some((key) => {
        const type = typeof key?.type === 'string' ? key.type.toLowerCase() : '';
        return type.startsWith('vfx_') || type === 'vfx:play' || type === 'vfx_play';
      }),
    );
  }, [selectedCard]);

  const scrubbedVisualArcana = useMemo(
    () => sampleStudioVfxPreview(selectedCard, playheadMs, effectsModule),
    [effectsModule, playheadMs, selectedCard],
  );

  useEffect(() => {
    if (isPlaying) {
      studioScrubPreviewKeyRef.current = null;
      return;
    }

    const nextKey = scrubbedVisualArcana?.key || null;
    if (studioScrubPreviewKeyRef.current === nextKey) return;
    studioScrubPreviewKeyRef.current = nextKey;
    setActiveVisualArcana(scrubbedVisualArcana || null);
  }, [isPlaying, scrubbedVisualArcana]);

  useEffect(() => {
    if (effectsModule || (!cardHasVfxEvents && !activeVisualArcana)) return;
    import('../game/arcana/arcanaVisuals.jsx')
      .then((module) => setEffectsModule(module))
      .catch(() => {
        // Keep Studio usable if visual module fails to load.
        setEffectsModule({});
      });
  }, [activeVisualArcana, cardHasVfxEvents, effectsModule]);


  function undoLastEdit() {
    const previous = undoStackRef.current.pop();
    if (!previous) {
      setStatus('Nothing to undo');
      return;
    }
    suppressHistoryRef.current = true;
    setCards(previous.cards);
    if (previous.selectedId) setSelectedId(previous.selectedId);
    if (previous.selection !== undefined) setSelection(previous.selection);
    if (typeof previous.playheadMs === 'number') setPlayheadMs(previous.playheadMs);
    setStatus('Undo');
  }

  function copySelectedKeyToClipboard() {
    if (!selection?.trackType || !selection?.trackId || !selection?.keyId || !selectedTrack || !selectedKey) {
      setStatus('Select a keyframe to copy');
      return;
    }
    keyClipboardRef.current = {
      trackType: selection.trackType,
      sourceTrackId: selection.trackId,
      key: JSON.parse(JSON.stringify(selectedKey)),
    };
    setStatus('Copied keyframe');
  }

  function pasteClipboardKey() {
    const clip = keyClipboardRef.current;
    if (!clip?.key || !selection?.trackType || !selection?.trackId || !selectedTrack) {
      setStatus('Select a destination track before pasting');
      return;
    }

    if (clip.trackType !== selection.trackType) {
      setStatus('Paste requires the same track type');
      return;
    }

    const pastedKeyId = uid(`${selection.trackType.slice(0, 3)}k`);
    const pastedKey = {
      ...JSON.parse(JSON.stringify(clip.key)),
      id: pastedKeyId,
      timeMs: Math.round(playheadMs),
    };

    updateSelectedCard((card) => {
      const collection = trackCollectionName(selection.trackType);
      const list = [...(card.tracks?.[collection] || [])];
      const idx = list.findIndex((track) => track.id === selection.trackId);
      if (idx < 0) return card;

      const track = { ...list[idx], keys: [...(list[idx].keys || [])] };
      track.keys.push(pastedKey);
      track.keys.sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
      list[idx] = track;

      return {
        ...card,
        tracks: {
          ...card.tracks,
          [collection]: list,
        },
      };
    }, 'Pasted keyframe');

    setSelection({
      trackType: selection.trackType,
      trackId: selection.trackId,
      keyId: pastedKeyId,
    });
  }

  useEffect(() => {
    const handleKeydown = (event) => {
      if (isEditableTarget(event.target)) return;

      const key = String(event.key || '').toLowerCase();
      const withMod = event.ctrlKey || event.metaKey;

      if (withMod && key === 'c') {
        event.preventDefault();
        copySelectedKeyToClipboard();
        return;
      }

      if (withMod && key === 'v') {
        event.preventDefault();
        pasteClipboardKey();
        return;
      }

      if (key === 'c' && event.shiftKey && !withMod) {
        event.preventDefault();
        captureSelectedCameraKey();
        return;
      }

      if (withMod && key === 'z') {
        event.preventDefault();
        undoLastEdit();
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        setIsPlaying((value) => !value);
        return;
      }

      if (key === 'w') {
        setTransformMode('translate');
        setStatus('Transform mode: Move');
        return;
      }

      if (key === 'e') {
        setTransformMode('rotate');
        setStatus('Transform mode: Rotate');
        return;
      }

      if (key === 'r') {
        setTransformMode('scale');
        setStatus('Transform mode: Scale');
      }
    };

    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  }, [playheadMs, selectedKey, selectedTrack, selection, selectedKeyIds]);

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

    const defaultSquare = normalizeMainPieceSquare(selectedCard.meta?.cardPiecePreview || selectedCard.board?.focusSquare);
    const defaultTrack = createDefaultTrack('object', 0, defaultSquare, selectedCard.id, { mainPiece: true });

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
      const rawTimeMs = ratio * Math.max(1, selectedCard.durationMs || 1);
      const timeMs = snapTimelineTimeMs(rawTimeMs, selectedCard);

      if (dragKey.keyIds && dragKey.keyIds.length > 1) {
        const anchorBaseTime = Number(dragKey.anchorBaseTimeMs) || 0;
        const delta = timeMs - anchorBaseTime;
        const baseTimes = dragKey.baseTimes || {};
        const selectedSet = new Set(dragKey.keyIds);

        updateSelectedCard((card) => {
          const collection = trackCollectionName(dragKey.trackType);
          const list = [...(card.tracks?.[collection] || [])];
          const idx = list.findIndex((track) => track.id === dragKey.trackId);
          if (idx < 0) return card;

          const track = { ...list[idx], keys: [...(list[idx].keys || [])] };
          track.keys = track.keys.map((key) => {
            if (!selectedSet.has(key.id)) return key;
            const baseTime = Number(baseTimes[key.id]);
            const nextRaw = Number.isFinite(baseTime) ? baseTime + delta : (Number(key.timeMs) || 0);
            const snapped = snapTimelineTimeMs(nextRaw, selectedCard);
            return { ...key, timeMs: Math.max(0, snapped) };
          });
          track.keys.sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
          list[idx] = track;

          return {
            ...card,
            tracks: {
              ...card.tracks,
              [collection]: list,
            },
          };
        }, '');
      } else {
        updateKeyField(dragKey.trackType, dragKey.trackId, dragKey.keyId, { timeMs }, false);
      }

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
  }, [dragKey, selectedCard]);

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
      } else if (next >= duration) {
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
  }, [isPlaying, selectedCard.durationMs, selectedCard.settings?.loopPlayback]);

  useEffect(() => {
    audioTimersRef.current.forEach((timer) => clearTimeout(timer));
    audioTimersRef.current = [];
    visualTimersRef.current.forEach((timer) => clearTimeout(timer));
    visualTimersRef.current = [];
    setActiveVisualArcana(null);

    audioNodesRef.current.forEach((node) => {
      try {
        node.pause();
        node.currentTime = 0;
      } catch {
        // ignore cleanup errors
      }
    });
    audioNodesRef.current = [];

    studioPlaybackFiredSoundRef.current = new Set();
    studioPlaybackFiredEventRef.current = new Set();
    studioPlaybackFiredVfxRef.current = new Map();
    studioPlaybackLoopRef.current = playbackLoopCycle;
    // Offset by 1ms so keys exactly at the starting playhead (often 0ms) fire on first frame.
    studioPlaybackPrevPlayheadRef.current = Math.max(-1, Number(playbackOriginRef.current) - 1);

    if (!isPlaying) return undefined;
    setRuntimeNotices([]);

    return () => {
      audioTimersRef.current.forEach((timer) => clearTimeout(timer));
      audioTimersRef.current = [];
      visualTimersRef.current.forEach((timer) => clearTimeout(timer));
      visualTimersRef.current = [];
      setActiveVisualArcana(null);
      audioNodesRef.current.forEach((node) => {
        try {
          node.pause();
        } catch {
          // ignore
        }
      });
      audioNodesRef.current = [];
    };
  }, [isPlaying, playbackLoopCycle]);

  useEffect(() => {
    if (!isPlaying) return;

    let previousMs = Number(studioPlaybackPrevPlayheadRef.current);
    if (!Number.isFinite(previousMs)) previousMs = -1;
    const currentMs = Math.max(0, Number(playheadMs) || 0);
    const loopChanged = studioPlaybackLoopRef.current !== playbackLoopCycle;

    if (loopChanged || currentMs < previousMs) {
      studioPlaybackFiredSoundRef.current = new Set();
      studioPlaybackFiredEventRef.current = new Set();
      studioPlaybackFiredVfxRef.current = new Map();
      previousMs = -1;
      studioPlaybackLoopRef.current = playbackLoopCycle;
    }

    const didCross = (timeMs) => {
      const t = Math.max(0, Number(timeMs) || 0);
      return t > previousMs && t <= currentMs;
    };

    (selectedCard?.tracks?.sounds || []).forEach((track) => {
      (track?.keys || []).forEach((key) => {
        if (!didCross(key?.timeMs)) return;
        const token = `${track?.id || 'track'}:${key?.id || key?.timeMs}`;
        if (studioPlaybackFiredSoundRef.current.has(token)) return;
        studioPlaybackFiredSoundRef.current.add(token);

        if (!key?.soundId) return;
        studioSoundManager.play(key.soundId, {
          volume: key.volume,
          pitch: key.pitch,
          loop: key.loop,
        });
      });
    });

    (selectedCard?.tracks?.events || []).forEach((track) => {
      (track?.keys || []).forEach((key) => {
        const eventTimeMs = (Number(key?.timeMs) || 0) + (Number(key?.delayMs) || 0);
        if (!didCross(eventTimeMs)) return;
        const token = `${track?.id || 'track'}:${key?.id || eventTimeMs}`;
        if (studioPlaybackFiredEventRef.current.has(token)) return;
        studioPlaybackFiredEventRef.current.add(token);

        const eventKey = {
          ...key,
          payload: {
            ...(key?.payload || {}),
            eventParams: {
              cardId: selectedCard.id,
              square: getCardMainPieceSquare(selectedCard),
              targetSquare: getCardMainPieceSquare(selectedCard),
            },
          },
        };

        const actions = Array.isArray(eventKey?.actions) && eventKey.actions.length > 0
          ? eventKey.actions
          : normalizeArcanaStudioEventActions(eventKey);

        const actionLabel = actions.length
          ? actions.map((action) => {
              if (action.kind === 'sound') return `sound:${action.soundId}`;
              if (action.kind === 'camera') return `camera:${action.square}`;
              if (action.kind === 'overlay') return `overlay:${action.effect}`;
              if (action.kind === 'vfx') return `vfx:${action.arcanaId || selectedCard.id}`;
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
            return;
          }

          if (action.kind === 'overlay') {
            if (action.effect === 'flash') return;
            overlayRuntimeRef.current?.playEffect?.({
              effect: action.effect,
              duration: action.duration,
              intensity: action.intensity,
              color: action.color,
              fadeIn: action.fadeIn,
              hold: action.hold,
              fadeOut: action.fadeOut,
            });
            return;
          }

          if (action.kind === 'vfx') {
            const resolvedArcanaId = resolveArcanaDefinitionId(action.arcanaId, selectedCard.id, effectsModule);
            if (!resolvedArcanaId) return;
            const now = Date.now();
            const dedupeKey = `${action.vfxKey || action.params?.effect || resolvedArcanaId}:${action.params?.square || ''}:${resolvedArcanaId}`;
            const lastAt = studioPlaybackFiredVfxRef.current.get(dedupeKey) || 0;
            if ((now - lastAt) < 280) return;
            studioPlaybackFiredVfxRef.current.set(dedupeKey, now);
            setActiveVisualArcana({
              arcanaId: resolvedArcanaId,
              params: action.params || {},
              key: `studio_vfx_${Date.now()}_${Math.random()}`,
            });
            const clearTimer = setTimeout(() => setActiveVisualArcana(null), Math.max(300, Number(action.durationMs) || 1200));
            visualTimersRef.current.push(clearTimer);
          }
        });

        setRuntimeNotices((current) => [
          ...current.slice(-5),
          { kind: 'event', label: `${eventKey?.type || 'event'}${actionLabel ? ` • ${actionLabel}` : ''}` },
        ]);
      });
    });

    studioPlaybackPrevPlayheadRef.current = currentMs;
  }, [boardPieces, effectsModule, isPlaying, playheadMs, playbackLoopCycle, selectedCard, studioSoundManager]);

  function updateCards(next, statusText = '', options = {}) {
    const normalized = {};
    Object.entries(next || {}).forEach(([id, card]) => {
      normalized[id] = sanitizeCardForStudio(card, id);
    });

    const shouldRecordHistory = options.recordHistory !== false && !suppressHistoryRef.current;
    if (shouldRecordHistory) {
      undoStackRef.current.push({
        cards,
        selectedId,
        selection,
        playheadMs,
      });
      if (undoStackRef.current.length > 80) {
        undoStackRef.current = undoStackRef.current.slice(-80);
      }
    }
    suppressHistoryRef.current = false;
    setCards(normalized);
    if (statusText) setStatus(statusText);
  }

  function updateSelectedCard(patcher, statusText = '') {
    const current = migrateArcanaStudioCard(cards[selectedId] || selectedCard, selectedId);
    const nextRaw = migrateArcanaStudioCard(patcher(current), selectedId);
    const requiredDurationMs = getTimelineRequiredDurationMs(nextRaw);
    const patched = sanitizeCardForStudio(migrateArcanaStudioCard({
      ...nextRaw,
      durationMs: Math.max(Number(nextRaw.durationMs) || 100, requiredDurationMs),
    }, selectedId), selectedId);
    updateCards({ ...cards, [selectedId]: patched }, statusText);
  }

  function selectTrack(trackType, trackId, keyId = null) {
    setSelection({ trackType, trackId, keyId });
    if (!keyId) setSelectedKeyIds([]);
  }

  function selectKey(trackType, trackId, keyId, options = {}) {
    const append = Boolean(options.append);
    const toggle = Boolean(options.toggle);

    if (!keyId) {
      setSelection({ trackType, trackId, keyId: null });
      setSelectedKeyIds([]);
      return;
    }

    if (append || toggle) {
      setSelectedKeyIds((prev) => {
        const sameTrack = selection?.trackType === trackType && selection?.trackId === trackId;
        const base = sameTrack ? prev : [];
        const exists = base.includes(keyId);
        const next = toggle && exists ? base.filter((id) => id !== keyId) : [...base.filter((id) => id !== keyId), keyId];
        if (next.length > 0) {
          setSelection({ trackType, trackId, keyId: next[next.length - 1] });
        } else {
          setSelection({ trackType, trackId, keyId: null });
        }
        return next;
      });
      return;
    }

    setSelection({ trackType, trackId, keyId });
    setSelectedKeyIds([keyId]);
  }

  function addTrack(type) {
    if (!TRACK_TYPES.includes(type)) return;
    if (type === 'camera' && !selectedCard.meta?.isCutscene) {
      setStatus('Cameras only available for cutscene cards');
      return;
    }

    const previewSquare = getCardMainPieceSquare(selectedCard);
    const track = createDefaultTrack(
      type,
      Math.round(playheadMs),
      previewSquare,
      selectedCard.id,
      type === 'object' ? { mainPiece: false } : {},
    );

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
      const keyTimeMs = snapTimelineTimeMs(playheadMs, selectedCard);
      let key;

      if (trackType === 'camera') {
        const sampled = sampleCameraTrack(track, playheadMs);
        key = {
          id: uid('camk'),
          timeMs: keyTimeMs,
          position: sampled.position || [7, 8, 7],
          target: sampled.target || [0, 0, 0],
          rotation: sampled.rotation || [0, 0, 0],
          fov: sampled.fov || 55,
          easing: 'easeInOutCubic',
          bezier: [0.25, 0.1, 0.25, 1]
        };
      } else if (trackType === 'object') {
        const sampled = sampleObjectTrack(track, playheadMs);
        const defaultScale = track.isAnimatablePiece ? [1.8, 1.8, 1.8] : [1, 1, 1];
        key = {
          id: uid('objk'),
          timeMs: keyTimeMs,
          position: sampled.position || [0, 0, 0],
          rotation: sampled.rotation || [0, 0, 0],
          scale: sampled.scale || defaultScale,
          easing: 'easeInOutCubic',
          bezier: [0.25, 0.1, 0.25, 1],
        };
      } else if (trackType === 'overlay') {
        const sampled = sampleOverlayTrack(track, playheadMs);
        key = {
          id: uid('ovk'),
          timeMs: keyTimeMs,
          x: sampled?.x ?? 50,
          y: sampled?.y ?? 50,
          opacity: sampled?.opacity ?? 1,
          scale: sampled?.scale ?? 1,
          rotation: sampled?.rotation ?? 0,
          easing: 'easeInOutCubic',
          bezier: [0.25, 0.1, 0.25, 1],
          text: sampled?.text ?? null,
        };
      } else if (trackType === 'sound') {
        key = { id: uid('sdk'), timeMs: keyTimeMs, soundId: 'arcana:shield_pawn', volume: 1, pitch: 1, loop: false };
      } else {
        key = { id: uid('evk'), timeMs: keyTimeMs, type: 'highlight:set', delayMs: 0, payload: {} };
      }

      if (trackType === 'camera') {
        const existingIdx = track.keys.findIndex((entry) => (Number(entry?.timeMs) || 0) === keyTimeMs);
        if (existingIdx >= 0) {
          const existing = track.keys[existingIdx] || {};
          track.keys[existingIdx] = { ...existing, ...key, id: existing.id || key.id };
        } else {
          track.keys.push(key);
        }
      } else {
        track.keys.push(key);
      }
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
    if (!selection?.trackType || !selection?.trackId) return;

    const { trackType, trackId, keyId } = selection;
    const idsToRemove = selectedKeyIds.length > 0 ? selectedKeyIds : (keyId ? [keyId] : []);
    if (idsToRemove.length === 0) return;
    const selectedSet = new Set(idsToRemove);

    updateSelectedCard((card) => {
      const collection = trackCollectionName(trackType);
      const list = [...(card.tracks?.[collection] || [])];
      const idx = list.findIndex((track) => track.id === trackId);
      if (idx < 0) return card;

      list[idx] = {
        ...list[idx],
        keys: (list[idx].keys || []).filter((key) => !selectedSet.has(key.id)),
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
    setSelectedKeyIds([]);
  }

  function updateTrackField(trackType, trackId, patch) {
    updateSelectedCard((card) => {
      const collection = trackCollectionName(trackType);
      const list = [...(card.tracks?.[collection] || [])];
      const idx = list.findIndex((entry) => entry.id === trackId);
      if (idx < 0) return card;

      if (trackType === 'object' && idx === 0 && list[idx].isAnimatablePiece) {
        const { name, type, pieceType, ...rest } = patch || {};
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

  function captureSelectedCameraKey() {
    const cameraTrack = selection?.trackType === 'camera'
      ? selectedTrack
      : (selectedCard.tracks?.camera || [])[0] || null;
    if (!cameraTrack) {
      setStatus('Add or select a camera track first');
      return;
    }

    const snapshot = cameraSnapshotRef.current || {};
    const timeMs = snapTimelineTimeMs(playheadMs, selectedCard);
    updateSelectedCard((card) => {
      const list = [...(card.tracks?.camera || [])];
      const idx = list.findIndex((track) => track.id === cameraTrack.id);
      if (idx < 0) return card;

      const track = { ...list[idx], keys: [...(list[idx].keys || [])] };
      const capturedKey = {
        id: uid('camk'),
        timeMs,
        position: Array.isArray(snapshot.position) ? snapshot.position : [7, 8, 7],
        target: Array.isArray(snapshot.target) ? snapshot.target : [0, 0, 0],
        rotation: Array.isArray(snapshot.rotation) ? snapshot.rotation : [0, 0, 0],
        fov: Number(snapshot.fov) || 55,
        easing: 'easeInOutCubic',
        bezier: [0.25, 0.1, 0.25, 1]
      };
      const existingIdx = track.keys.findIndex((entry) => (Number(entry?.timeMs) || 0) === timeMs);
      if (existingIdx >= 0) {
        const existing = track.keys[existingIdx] || {};
        track.keys[existingIdx] = { ...existing, ...capturedKey, id: existing.id || capturedKey.id };
      } else {
        track.keys.push(capturedKey);
      }
      track.keys.sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
      list[idx] = track;

      return {
        ...card,
        tracks: {
          ...card.tracks,
          camera: list,
        },
      };
    }, 'Captured camera keyframe');
    setSelection({ trackType: 'camera', trackId: cameraTrack.id, keyId: null });
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

  function exportCardForGame() {
    const fullCard = sanitizeCardForStudio(migrateArcanaStudioCard(selectedCard, selectedId), selectedId);
    downloadJson(`${selectedId}.arcana.json`, fullCard);
    setStatus(`Exported Studio card for ${selectedId}`);
  }

  function createNewCard() {
    const rawId = window.prompt('New card id (snake_case)', 'new_card');
    const normalizedId = normalizeCardId(String(rawId || '').trim());
    if (!normalizedId) {
      setStatus('Create cancelled');
      return;
    }

    if (cards[normalizedId]) {
      setSelectedId(normalizedId);
      setSelection(null);
      setPlayheadMs(0);
      setStatus(`Loaded existing card: ${normalizedId}`);
      return;
    }

    const definition = findDefinitionById(normalizedId);
    const base = definition
      ? makeCardFromGameCard({ ...definition, id: normalizedId }, Boolean(definition.visual?.cutscene), normalizedId)
      : createEmptyArcanaStudioCard(normalizedId);

    const card = sanitizeCardForStudio(migrateArcanaStudioCard({ ...base, id: normalizedId }, normalizedId), normalizedId);
    updateCards({ ...cards, [normalizedId]: card }, `Created card: ${normalizedId}`);
    setSelectedId(normalizedId);
    setSelection(null);
    setPlayheadMs(0);
  }

  async function saveCardToGame() {
    const fullCard = sanitizeCardForStudio(migrateArcanaStudioCard(selectedCard, selectedId), selectedId);
    downloadJson(`${selectedId}.arcana.json`, fullCard);
    setStatus(`Exported ${selectedId}. Apply with: npm run studio:apply`);
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

  function importJsonCard(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rawText = String(reader.result || '').trim();
        let parsed;
        try {
          parsed = JSON.parse(rawText || '{}');
        } catch {
          // Accept exported JS snippet / object-literal style from game config exports.
          parsed = parseLegacyCutsceneInput(rawText, selectedId || 'imported_cutscene', selectedCard?.durationMs || 3000);
        }
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

        updateCards(nextCards, importedCards.length === 1 ? `Imported game card ${firstImportedId}` : `Imported ${importedCards.length} game cards`);
        if (firstImportedId) setSelectedId(firstImportedId);
      } catch (err) {
        setStatus(`Import failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
  }

  function importAllCurrentCards() {
    const nextCards = buildStudioCardsMap();
    const nextIds = Object.keys(nextCards);
    const existingIds = Object.keys(cards || {});
    const overwriteCount = existingIds.filter((id) => Object.prototype.hasOwnProperty.call(nextCards, id)).length;
    const selectedExists = selectedId && Object.prototype.hasOwnProperty.call(nextCards, selectedId);
    const confirmMessage = [
      `Import ${nextIds.length} current cards from definitions and Studio overrides?`,
      overwriteCount > 0 ? `${overwriteCount} existing Studio cards will be refreshed.` : 'No existing cards will be overwritten.',
      'Unsaved local edits to those cards will be replaced.',
    ].join('\n');

    if (!window.confirm(confirmMessage)) return;

    updateCards(nextCards, `Imported ${nextIds.length} current cards`);
    if (selectedExists) {
      setSelectedId(selectedId);
    } else if (nextIds.length > 0) {
      setSelectedId(nextIds[0]);
    }
    setSelection(null);
    setPlayheadMs(0);
  }

  function applyLegacyVfxDraft() {
    try {
      const parsedVfx = safeJsonParse(legacyVfxDraft, null);
      if (!parsedVfx || typeof parsedVfx !== 'object' || Array.isArray(parsedVfx)) {
        throw new Error('VFX draft must be a JSON object');
      }

      const legacy = arcanaStudioCardToLegacyCutscene(selectedCard);
      const nextLegacy = {
        ...legacy,
        config: {
          ...(legacy.config || {}),
          vfx: {
            ...(legacy.config?.vfx || {}),
            ...parsedVfx,
          },
        },
      };

      const converted = legacyCutsceneToArcanaStudioCard(nextLegacy, { id: selectedId, name: selectedCard.name || selectedId });
      const merged = sanitizeCardForStudio(
        migrateArcanaStudioCard(
          {
            ...selectedCard,
            ...converted,
            id: selectedId,
            name: selectedCard.name || converted.name || selectedId,
            description: selectedCard.description || converted.description || '',
            meta: {
              ...(selectedCard.meta || {}),
              ...(converted.meta || {}),
              legacyCutscene: nextLegacy,
            },
          },
          selectedId,
        ),
        selectedId,
      );

      updateCards({ ...cards, [selectedId]: merged }, `Applied legacy VFX for ${selectedId}`);
      setSelection(null);
      setPlayheadMs(0);
    } catch (error) {
      setStatus(`Legacy VFX apply failed: ${error.message}`);
    }
  }

  function removeSelectedTrack() {
    if (!selection?.trackType || !selection?.trackId) return;

    if (selection.trackType === 'event') {
      setStatus('Event track cannot be deleted');
      return;
    }

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
      {showTutorial ? <ArcanaStudioTutorial onClose={() => setShowTutorial(false)} eventTypes={KNOWN_GAME_EVENT_TYPES} /> : null}

      <header className="arcana-studio-header">
        <div>
          <h1>Arcana Studio</h1>
          <p className="arcana-studio-status">{status}</p>
        </div>
        <div className="arcana-studio-actions">
          <button onClick={onBack}>Back</button>
          <button onClick={createNewCard}>New Card</button>
          <button onClick={saveCardToGame}>Export JSON</button>
          <button onClick={importAllCurrentCards}>Import All Cards</button>
          <label className="file-like-button">
            Import Game Card
            <input type="file" accept="application/json,.json,.arcana.json" onChange={importJsonCard} />
          </label>
          <button onClick={() => setShowTutorial(true)}>Field Guide</button>
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
                const canAnimatePiece = computeCanAnimatePiece(id, card, definition);
                return (
                <button key={id} className={`card-item rarity-${rarity} ${id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(id); setSelection(null); setPlayheadMs(0); }}>
                  <div className="card-item-top">
                    <strong>{card.name || definition?.name || id}</strong>
                    <span className="card-item-badges">
                      {card.meta?.isCutscene ? <span className="pill cutscene">Cutscene</span> : null}
                      <span className={`pill ${canAnimatePiece ? 'anim-piece' : 'static-piece'}`}>{canAnimatePiece ? 'Piece Anim' : 'No Piece Anim'}</span>
                      <span className="pill rarity-pill" style={{ color: rarityColor, borderColor: `${rarityColor}88` }}>{rarity.toUpperCase()}</span>
                    </span>
                  </div>
                  <div className="card-item-meta" style={{ color: rarityColor }}>{definition?.category || card.meta?.category || 'uncategorized'}</div>
                </button>
                );
              })}
            </div>
          </div>

          <div className="arcana-panel">
            <div className="arcana-panel-title">Timeline Tracks</div>
            <div className="arcana-add-row">
              <button onClick={() => addTrack('camera')}>+ Camera Track</button>
              <button onClick={() => addTrack('object')}>+ Cube Track</button>
              <button onClick={() => addTrack('sound')}>+ Audio Track</button>
            </div>

            <div className="outliner-list">
              {timelineRows.map((row) => {
                return (
                  <div key={`${row.type}_${row.id}`} className={`outliner-item ${selection?.trackType === row.type && selection?.trackId === row.id ? 'selected' : ''}`}>
                    <button className="outliner-main" onClick={() => selectTrack(row.type, row.id)}>
                      <span>{trackTypeLabel(row.type)}</span>
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
              <StudioNumberInput
                min={100}
                value={selectedCard.durationMs}
                fallback={selectedCard.durationMs || 100}
                onChange={(nextValue) => updateSelectedCard((card) => {
                  const requested = Math.max(100, Number(nextValue) || 100);
                  const minRequired = getTimelineRequiredDurationMs(card);
                  return { ...card, durationMs: Math.max(requested, minRequired) };
                })}
              />
            </label>
            <label>
              Snap To Timeline
              <select
                value={selectedCard.settings?.timelineSnapEnabled === false ? 'off' : 'on'}
                onChange={(event) => updateSelectedCard((card) => ({
                  ...card,
                  settings: {
                    ...card.settings,
                    timelineSnapEnabled: event.target.value !== 'off',
                  },
                }), 'Updated timeline snap mode')}
              >
                <option value="on">On</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label>
              Snap Step (ms)
              <StudioNumberInput
                min={1}
                max={2000}
                value={getTimelineSnapStepMs(selectedCard)}
                fallback={getTimelineSnapStepMs(selectedCard)}
                onChange={(nextValue) => updateSelectedCard((card) => ({
                  ...card,
                  settings: {
                    ...card.settings,
                    timelineSnapMs: Math.max(1, Number(nextValue) || 1),
                  },
                }), 'Updated timeline snap step')}
              />
            </label>
            <label>
              Preview Mode
              <select value={selectedCard.settings?.previewMode || 'plane'} onChange={(event) => updateSelectedCard((card) => ({ ...card, settings: { ...card.settings, previewMode: event.target.value } }), 'Updated preview mode')}>
                <option value="plane">Plane</option>
                <option value="board">Board</option>
              </select>
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

          <div className="arcana-panel compact legacy-config-panel">
            <div className="legacy-config-card">
              <div className="legacy-config-card-head">
                <h4>VFX</h4>
                <span className="legacy-config-badge">direct json</span>
              </div>
              <p>Edit the card&apos;s <code>config.vfx</code> object directly.</p>
              <textarea
                className="legacy-config-textarea"
                value={legacyVfxDraft}
                onChange={(event) => setLegacyVfxDraft(event.target.value)}
              />
              <div className="legacy-config-actions">
                <button onClick={applyLegacyVfxDraft}>Apply</button>
                <button
                  type="button"
                  onClick={() => setLegacyVfxDraft(JSON.stringify(selectedLegacyVfx || {}, null, 2))}
                >
                  Reset
                </button>
              </div>
            </div>
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
                  onCameraSnapshotChange={(snapshot) => {
                    cameraSnapshotRef.current = snapshot;
                  }}
                  previewMode={selectedCard.settings?.previewMode || 'plane'}
                  isPlaying={isPlaying}
                  showCameraGizmos={showCameraGizmos}
                  activeVisualArcana={activeVisualArcana}
                  effectsModule={effectsModule}
                />
              </Canvas>

              <CutsceneOverlay ref={overlayRuntimeRef} />

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
                        fontSize: notice.kind === 'sound' ? 10 : 12,
                        letterSpacing: '0.02em',
                        textTransform: 'uppercase',
                        maxWidth: 320,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
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
                {selectedTrack ? (
                  <button onClick={() => addKeyToTrack(selection.trackType, selectedTrack.id)}>
                    {selection.trackType === 'camera' ? 'Capture Camera' : 'Add Moment'}
                  </button>
                ) : null}
                {selectedKey ? <button onClick={removeSelectedKey}>Delete Moment</button> : null}
                {selectedTrack ? <button className="danger-button" onClick={removeSelectedTrack}>Delete Layer</button> : null}
              </div>

              <div className="shortcut-strip">
                <span>Shortcuts</span>
                <span>Space Play/Pause</span>
                <span>Ctrl/Cmd+C Copy</span>
                <span>Ctrl/Cmd+V Paste</span>
                <span>Ctrl/Cmd+Z Undo</span>
                <span>Shift/Ctrl Click Multi-select</span>
                <span>W/E/R Move/Rotate/Scale</span>
                <span>Shift+C Capture Camera</span>
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
                    const keyStacks = new Map();
                    keys.forEach((key) => {
                      const t = Math.round(Number(key?.timeMs) || 0);
                      const stack = keyStacks.get(t) || [];
                      stack.push(key.id);
                      keyStacks.set(t, stack);
                    });

                    return (
                      <div key={laneId} className={`timeline-row ${selection?.trackType === row.type && selection?.trackId === row.id ? 'selected' : ''}`}>
                        <button className="timeline-label" onClick={() => selectTrack(row.type, row.id)}>
                          <span>{row.type}</span>
                          <strong>{row.label}</strong>
                        </button>
                        <div
                          className="timeline-lane"
                          ref={(el) => { laneRefs.current[laneId] = el; }}
                          onPointerDown={(event) => {
                            // Clicking empty lane space should unselect keyframes.
                            if (event.target === event.currentTarget) {
                              setSelectedKeyIds([]);
                              setSelection({ trackType: row.type, trackId: row.id, keyId: null });
                            }
                          }}
                          onDoubleClick={() => addKeyToTrack(row.type, row.id)}
                        >
                          <div className="timeline-playhead" style={{ left: `${(playheadMs / Math.max(1, selectedCard.durationMs)) * 100}%` }} />
                          {keys.map((key) => (
                            (() => {
                              const timeBucket = Math.round(Number(key?.timeMs) || 0);
                              const stack = keyStacks.get(timeBucket) || [key.id];
                              const stackSize = stack.length;
                              const stackIndex = Math.max(0, stack.indexOf(key.id));
                              const yOffset = (stackIndex - ((stackSize - 1) / 2)) * 9;
                              const isSelectedKey = selectedKeyIds.includes(key.id) || selection?.keyId === key.id;
                              return (
                                <button
                                  key={key.id}
                                  className={`timeline-key ${isSelectedKey ? 'selected' : ''} ${stackSize > 1 ? 'stacked' : ''}`}
                                  style={{
                                    left: `${((key.timeMs || 0) / Math.max(1, selectedCard.durationMs)) * 100}%`,
                                    top: `calc(50% + ${yOffset}px)`,
                                    zIndex: 5 + stackIndex,
                                  }}
                                  onMouseDown={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    const withMulti = event.shiftKey || event.ctrlKey || event.metaKey;
                                    if (withMulti) {
                                      selectKey(row.type, row.id, key.id, { toggle: true });
                                      return;
                                    }

                                    const activeSelected = selectedKeyIds.length > 0 ? selectedKeyIds : (selection?.keyId ? [selection.keyId] : []);
                                    const canGroupDrag =
                                      activeSelected.length > 1
                                      && selection?.trackType === row.type
                                      && selection?.trackId === row.id
                                      && activeSelected.includes(key.id);

                                    if (canGroupDrag) {
                                      const baseTimes = {};
                                      keys.forEach((entry) => {
                                        if (activeSelected.includes(entry.id)) {
                                          baseTimes[entry.id] = Number(entry.timeMs) || 0;
                                        }
                                      });
                                      setDragKey({
                                        trackType: row.type,
                                        trackId: row.id,
                                        keyId: key.id,
                                        keyIds: activeSelected,
                                        baseTimes,
                                        anchorBaseTimeMs: Number(baseTimes[key.id]) || 0,
                                      });
                                    } else {
                                      selectKey(row.type, row.id, key.id);
                                      setDragKey({ trackType: row.type, trackId: row.id, keyId: key.id });
                                    }
                                  }}
                                  onClick={() => {
                                    setPlayheadMs(key.timeMs || 0);
                                    const isMulti = selection?.trackType === row.type && selection?.trackId === row.id && selectedKeyIds.length > 1;
                                    if (!isMulti) selectKey(row.type, row.id, key.id);
                                  }}
                                  title={`${row.type} key @ ${key.timeMs}ms${stackSize > 1 ? ` • stack ${stackIndex + 1}/${stackSize}` : ''}`}
                                />
                              );
                            })()
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
                {selectedCardAudioFields.length > 0 ? (
                  <div style={{
                    border: '1px solid rgba(126, 170, 230, 0.28)',
                    borderRadius: 10,
                    padding: '0.65rem',
                    marginBottom: '0.7rem',
                    background: 'rgba(9, 18, 30, 0.55)',
                  }}>
                    <div style={{ fontWeight: 700, marginBottom: '0.45rem' }}>Card Audio (Studio)</div>
                    {selectedCardAudioFields.map((field) => (
                      <label key={field.key}>
                        {field.label}
                        <input
                          list="arcana-studio-sound-ids"
                          value={selectedCard?.meta?.audioConfig?.[field.key] || ''}
                          onChange={(event) => updateSelectedCard((card) => ({
                            ...card,
                            meta: {
                              ...(card.meta || {}),
                              audioConfig: {
                                ...(card.meta?.audioConfig || {}),
                                [field.key]: normalizeStudioSoundId(event.target.value),
                              },
                            },
                          }), field.historyLabel)}
                        />
                      </label>
                    ))}
                    <div className="graph-caption">Card-level audio options appear only for cards that use runtime loops. Timeline audio remains separate.</div>
                  </div>
                ) : null}
                <label>
                  Description
                  <div className="description-readonly">{selectedCardDescription}</div>
                </label>
              </>
            ) : (
              <>
                <label>
                  Layer Name
                  <input
                    value={selectedTrack.name || ''}
                    readOnly={selection.trackType === 'object' && selectedCard.tracks?.objects?.[0]?.id === selectedTrack.id && selectedTrack.isAnimatablePiece}
                    onChange={(event) => updateTrackField(selection.trackType, selectedTrack.id, { name: event.target.value })}
                  />
                </label>

                {selection.trackType === 'object' ? (
                  <>
                    {(selectedTrack.type || (selectedTrack.isAnimatablePiece ? 'piece' : 'mesh')) === 'piece' ? (
                      <>
                        <label>
                          Piece
                          <input value={selectedTrack.pieceType || 'p'} readOnly />
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
                          <StudioNumberInput value={selectedTrack.clipOffsetMs ?? 0} fallback={0} onChange={(nextValue) => updateTrackField('object', selectedTrack.id, { clipOffsetMs: Number(nextValue) || 0 })} />
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
                      <StudioNumberInput value={selectedTrack.layer ?? 0} fallback={0} onChange={(nextValue) => updateTrackField('overlay', selectedTrack.id, { layer: Number(nextValue) || 0 })} />
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
                      <StudioNumberInput value={selectedTrack.style?.fontSize ?? 36} fallback={36} onChange={(nextValue) => updateTrackField('overlay', selectedTrack.id, { style: { ...(selectedTrack.style || {}), fontSize: Number(nextValue) || 1 } })} />
                    </label>
                    <label>
                      Image URL
                      <input value={selectedTrack.style?.imageUrl || ''} onChange={(event) => updateTrackField('overlay', selectedTrack.id, { style: { ...(selectedTrack.style || {}), imageUrl: event.target.value } })} />
                    </label>
                    {selectedTrack.type === 'screen_cover' ? (
                      <>
                        <label>
                          Width (%)
                          <StudioNumberInput value={selectedTrack.style?.width ?? 100} fallback={100} onChange={(nextValue) => updateTrackField('overlay', selectedTrack.id, { style: { ...(selectedTrack.style || {}), width: Number(nextValue) || 100 } })} />
                        </label>
                        <label>
                          Height (%)
                          <StudioNumberInput value={selectedTrack.style?.height ?? 100} fallback={100} onChange={(nextValue) => updateTrackField('overlay', selectedTrack.id, { style: { ...(selectedTrack.style || {}), height: Number(nextValue) || 100 } })} />
                        </label>
                        <label>
                          Border Radius (px)
                          <StudioNumberInput value={selectedTrack.style?.borderRadius ?? 0} fallback={0} onChange={(nextValue) => updateTrackField('overlay', selectedTrack.id, { style: { ...(selectedTrack.style || {}), borderRadius: Number(nextValue) || 0 } })} />
                        </label>
                      </>
                    ) : null}
                  </>
                ) : null}

                {selectedKey ? (
                  <>
                    <hr />
                    <h4>Moment</h4>
                    <label>
                      Time (ms)
                      <StudioNumberInput value={selectedKey.timeMs ?? 0} fallback={0} onChange={(nextValue) => updateKeyField(selection.trackType, selectedTrack.id, selectedKey.id, { timeMs: Math.max(0, Number(nextValue) || 0) })} />
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
                          Rotation (x,y,z)
                          <input value={(selectedKey.rotation || [0, 0, 0]).join(', ')} onChange={(event) => updateKeyField('camera', selectedTrack.id, selectedKey.id, { rotation: event.target.value.split(',').map((v) => Number(v.trim()) || 0).slice(0, 3) })} />
                        </label>
                        <label>
                          FOV
                          <StudioNumberInput value={selectedKey.fov ?? 55} fallback={55} onChange={(nextValue) => updateKeyField('camera', selectedTrack.id, selectedKey.id, { fov: Number(nextValue) || 55 })} />
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
                          <StudioNumberInput value={selectedKey.x ?? 50} fallback={50} onChange={(nextValue) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { x: Number(nextValue) || 0 })} />
                        </label>
                        <label>
                          Y (%)
                          <StudioNumberInput value={selectedKey.y ?? 50} fallback={50} onChange={(nextValue) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { y: Number(nextValue) || 0 })} />
                        </label>
                        <label>
                          Opacity
                          <StudioNumberInput step="0.05" value={selectedKey.opacity ?? 1} fallback={1} onChange={(nextValue) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { opacity: Number(nextValue) || 0 })} />
                        </label>
                        <label>
                          Scale
                          <StudioNumberInput step="0.05" value={selectedKey.scale ?? 1} fallback={1} onChange={(nextValue) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { scale: Number(nextValue) || 1 })} />
                        </label>
                        <label>
                          Rotation (deg)
                          <StudioNumberInput step="0.1" value={selectedKey.rotation ?? 0} fallback={0} onChange={(nextValue) => updateKeyField('overlay', selectedTrack.id, selectedKey.id, { rotation: Number(nextValue) || 0 })} />
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

                    {selection.trackType === 'sound' ? (
                      <>
                        <label className="sound-id-field">
                          Sound ID
                          <input
                            list="arcana-studio-sound-ids"
                            value={selectedKey.soundId || ''}
                            onChange={(event) => updateKeyField('sound', selectedTrack.id, selectedKey.id, { soundId: normalizeStudioSoundId(event.target.value) })}
                          />
                        </label>
                        <datalist id="arcana-studio-sound-ids">
                          {[...new Set([
                            ...STUDIO_SOUND_SUGGESTIONS,
                            ...Object.keys(soundManager?.sounds || {}),
                            ...Object.keys(soundManager?.musicTracks || {}),
                          ])].map((soundId) => (
                            <option key={soundId} value={soundId} />
                          ))}
                        </datalist>
                        <div className="graph-caption">Tip: use arcana:* for SFX, music:* for ambient songs, or any /sounds/... path.</div>
                        <label>
                          Volume
                          <StudioNumberInput step="0.05" value={selectedKey.volume ?? 1} fallback={1} onChange={(nextValue) => updateKeyField('sound', selectedTrack.id, selectedKey.id, { volume: Number(nextValue) || 1 })} />
                        </label>
                        <label>
                          Pitch
                          <StudioNumberInput step="0.05" value={selectedKey.pitch ?? 1} fallback={1} onChange={(nextValue) => updateKeyField('sound', selectedTrack.id, selectedKey.id, { pitch: Number(nextValue) || 1 })} />
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
                          <StudioNumberInput value={selectedKey.delayMs ?? 0} fallback={0} onChange={(nextValue) => updateKeyField('event', selectedTrack.id, selectedKey.id, { delayMs: Math.max(0, Number(nextValue) || 0) })} />
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
