import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, OrbitControls, TransformControls, useAnimations, useGLTF } from '@react-three/drei';
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
import { resolveSoundPreviewUrl } from '../game/arcana/studio/arcanaStudioRuntime.js';
import { getAllCutsceneCards, getAllCutsceneConfigs } from '../game/arcana/cutsceneDefinitions.js';
import { legacyCutsceneToArcanaStudioCard } from '../game/arcana/studio/arcanaStudioBridge.js';
import { buildParticlePreviewPoints, buildStudioParticleTracksFromLegacy } from '../game/arcana/studio/arcanaStudioVfxPresets.js';
import { ARCANA_DEFINITIONS } from '../game/arcanaDefinitions.js';
import { squareToPosition } from '../game/arcana/sharedHelpers.jsx';
import './styles/ArcanaStudio.css';

const DEFAULT_WORLD_ANCHOR = [0, 0.075, 0];
const EASINGS = ['linear', 'instant', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'customBezier'];
const TRACK_TYPES = ['camera', 'object', 'particle', 'overlay', 'sound'];
const LEGACY_CUTSCENE_CONFIGS = getAllCutsceneConfigs();

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
  };
  return next;
}

function normalizeCardId(cardId = '') {
  return cardId === 'arcane_cycle' ? 'filtered_cycle' : cardId;
}

function findDefinitionById(cardId = '') {
  const runtimeId = cardId === 'filtered_cycle' ? 'arcane_cycle' : cardId;
  return (ARCANA_DEFINITIONS || []).find((entry) => entry.id === runtimeId) || null;
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

function getAllAvailableCards() {
  const cards = {};
  const cutsceneIds = new Set(
    (ARCANA_DEFINITIONS || [])
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

  (ARCANA_DEFINITIONS || []).forEach((gameCard) => {
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
  if (particles.length === 0) {
    const importedTracks = buildStudioParticleTracksFromLegacy({
      cardId: id,
      legacyConfig: legacyCutscene?.config || null,
      durationMs: migrated.durationMs,
      objectTrackId: objects[0]?.id || null,
    });
    if (importedTracks.length > 0) {
      particles = importedTracks;
    } else if (definition?.visual?.particles) {
      particles = [createDefaultTrack('particle', 0, '', id)];
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

  return {
    ...migrated,
    id,
    name: migrated.name || definition?.name || id,
    description: migrated.description || definition?.description || '',
    tracks,
    meta: {
      ...(migrated.meta || {}),
      isCutscene,
    },
  };
}

function buildStudioCardsMap() {
  const base = getAllAvailableCards();
  const normalized = {};

  Object.entries(base).forEach(([id, card]) => {
    normalized[id] = sanitizeCardForStudio(card, id);
  });

  (ARCANA_DEFINITIONS || []).forEach((definition) => {
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
      pieceSquare: '',
      pieceType: inferPieceTypeFromCard(cardId),
      pieceColor: 'white',
      assetUri: '',
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
    return {
      id: uid('pt'),
      name: 'Particle FX',
      active: true,
      attach: { mode: 'follow', targetId: null, parentId: null, offset: [0, 0, 0], parenting: true },
      params: {
        emissionRate: 30,
        burstCount: 0,
        velocityMin: 0.35,
        velocityMax: 1.75,
        lifetimeMin: 0.2,
        lifetimeMax: 1.2,
        sizeOverLife: [1, 0.7, 0],
        colorOverLife: ['#9ad7ff', '#4cb6ff', '#1f4fff'],
        gravity: [0, -6, 0],
        drag: 0.08,
        spawnShape: 'sphere',
        spawnRadius: 0.35,
      },
      keys: [{ id: uid('ptk'), timeMs: playheadMs, enabled: true, seed: 1337, easing: 'linear', overrides: {} }],
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
      keys: [{ id: uid('sdk'), timeMs: playheadMs, soundId: 'arcana:heal', volume: 1, pitch: 1, loop: false }],
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

  if (!points.length) return null;

  return (
    <group>
      {points.map((point, idx) => (
        <mesh key={`${track.id}_${idx}`} position={point.position}>
          <sphereGeometry args={[point.size || 0.05, 8, 8]} />
          <meshStandardMaterial color={point.color} emissive={point.color} emissiveIntensity={0.85} transparent opacity={point.opacity || 0.76} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

function ImportedMesh({ uri, play, clipTimeMs, clipName, clipLoop }) {
  const ref = useRef(null);
  const gltf = useGLTF(uri);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  const { actions = {}, names = [], mixer } = useAnimations(gltf.animations || [], ref) || {};

  const activeClip = clipName && actions[clipName] ? clipName : names[0];

  useEffect(() => {
    names.forEach((name) => {
      const action = actions[name];
      if (!action) return;
      action.stop();
      action.enabled = false;
      action.paused = true;
    });

    if (!activeClip) return;

    const action = actions[activeClip];
    if (!action) return;

    action.enabled = true;
    action.play();
    action.paused = !play;
    if (clipLoop) action.setLoop(2201, Infinity);
    else action.setLoop(2200, 0);
  }, [actions, names, activeClip, play, clipLoop]);

  useFrame(() => {
    if (!mixer || !activeClip || !play) return;
    const action = actions[activeClip];
    const duration = action?.getClip?.()?.duration || 0;
    const seconds = Math.max(0, (clipTimeMs || 0) / 1000);
    try {
      mixer.setTime(clipLoop && duration > 0 ? seconds % duration : seconds);
    } catch {
      // keep preview resilient with bad clip data
    }
  });

  return <primitive ref={ref} object={scene} scale={0.6} />;
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

  const content = track.assetUri
    ? <ImportedMesh uri={track.assetUri} play={Boolean(track.previewPlayAnimation && playPreview)} clipTimeMs={Math.max(0, playheadMs - (track.clipOffsetMs || 0))} clipName={track.clipName} clipLoop={track.clipLoop !== false} />
    : <TrackFallbackMesh track={track} piece={piece} />;

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

export function ArcanaStudio({ onBack }) {
  const [cards, setCards] = useState(() => {
    const base = buildStudioCardsMap();
    const stored = loadArcanaStudioCardsMap();
    if (!stored || Object.keys(stored).length === 0) return base;

    const merged = { ...base };
    Object.entries(stored).forEach(([id, card]) => {
      merged[id] = sanitizeCardForStudio(card, id);
    });
    return merged;
  });

  const [selectedId, setSelectedId] = useState(() => {
    const ids = Object.keys(getAllAvailableCards());
    return ids[0] || 'new_cutscene';
  });

  const [selection, setSelection] = useState(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showCameraGizmos, setShowCameraGizmos] = useState(true);
  const [transformMode, setTransformMode] = useState('translate');
  const [cameraTransformTarget, setCameraTransformTarget] = useState('position');
  const [cardSearch, setCardSearch] = useState('');
  const [status, setStatus] = useState('Ready');
  const [isDirty, setIsDirty] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const suppressDeselectUntilRef = useRef(0);
  const draftSnapshotRef = useRef('');

  const laneRefs = useRef({});
  const playbackFrameRef = useRef(null);
  const playbackStartRef = useRef(0);
  const playbackOriginRef = useRef(0);
  const audioTimersRef = useRef([]);
  const audioNodesRef = useRef([]);

  useEffect(() => {
    draftSnapshotRef.current = JSON.stringify(cards || {});
  }, []);

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

  const screenOverlays = sampledOverlays.filter(({ track }) => (track.space || 'screen') !== 'world');
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
    const snapshot = JSON.stringify(cards || {});
    const dirty = snapshot !== draftSnapshotRef.current;
    setIsDirty(dirty);

    const timer = setTimeout(() => {
      saveArcanaStudioCardsMap(cards);
    }, 400);

    return () => clearTimeout(timer);
  }, [cards]);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

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
    if (!isPlaying) {
      if (playbackFrameRef.current) cancelAnimationFrame(playbackFrameRef.current);
      playbackFrameRef.current = null;
      return undefined;
    }

    playbackOriginRef.current = playheadMs;
    playbackStartRef.current = performance.now();

    const tick = () => {
      const elapsed = Math.max(0, performance.now() - playbackStartRef.current);
      const duration = Math.max(1, selectedCard.durationMs || 1);
      let next = playbackOriginRef.current + elapsed;

      if (selectedCard.settings?.loopPlayback) next %= duration;
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

    (selectedCard.tracks?.sounds || []).forEach((track) => {
      (track.keys || []).forEach((key) => {
        const delay = Math.max(0, (key.timeMs || 0) - playheadMs);
        const timer = setTimeout(() => {
          const src = resolveSoundPreviewUrl(key.soundId);
          if (!src) return;
          const audio = new Audio(src);
          audio.volume = clamp(Number(key.volume) || 1, 0, 1);
          audio.playbackRate = clamp(Number(key.pitch) || 1, 0.25, 4);
          audio.loop = Boolean(key.loop);
          audio.play().catch(() => {});
          audioNodesRef.current.push(audio);
        }, delay);
        audioTimersRef.current.push(timer);
      });
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
  }, [isPlaying, selectedCard, playheadMs]);

  function updateCards(next, statusText = '') {
    const normalized = {};
    Object.entries(next || {}).forEach(([id, card]) => {
      normalized[id] = sanitizeCardForStudio(card, id);
    });
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
        key = { id: uid('sdk'), timeMs: Math.round(playheadMs), soundId: 'arcana:heal', volume: 1, pitch: 1, loop: false };
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

      if (trackType === 'object' && list[idx].isAnimatablePiece && Object.prototype.hasOwnProperty.call(patch || {}, 'name')) {
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

  function exportCard() {
    downloadJson(`${selectedId}.arcana-studio.json`, selectedCard);
    draftSnapshotRef.current = JSON.stringify(cards || {});
    setIsDirty(false);
    setStatus(`Exported ${selectedId}`);
  }

  function saveDraft() {
    saveArcanaStudioCardsMap(cards);
    draftSnapshotRef.current = JSON.stringify(cards || {});
    setIsDirty(false);
    setStatus('Saved local studio draft');
  }

  function resetDraft() {
    if (!window.confirm('Reset Arcana Studio draft to project defaults? This will clear local draft changes.')) {
      return;
    }

    const base = buildStudioCardsMap();
    const firstId = Object.keys(base)[0] || 'new_cutscene';
    setCards(base);
    setSelectedId(firstId);
    setSelection(null);
    setPlayheadMs(0);
    saveArcanaStudioCardsMap(base);
    draftSnapshotRef.current = JSON.stringify(base || {});
    setIsDirty(false);
    setStatus('Reset studio draft to defaults');
  }

  function importJsonCard(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('JSON must contain a card object');
        }
        const normalizedId = parsed?.id === 'arcane_cycle' ? 'filtered_cycle' : (parsed?.id || 'imported_card');
        const card = sanitizeCardForStudio(migrateArcanaStudioCard({ ...parsed, id: normalizedId }, normalizedId), normalizedId);
        updateCards({ ...cards, [card.id]: card }, `Imported ${card.id}`);
        setSelectedId(card.id);
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

  function importAssetForSelectedObject(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedTrack || selection?.trackType !== 'object') return;

    const uri = URL.createObjectURL(file);
    updateTrackField('object', selectedTrack.id, { assetUri: uri });
    setStatus('Imported mesh asset');
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

  const cardEntries = useMemo(() => Object.entries(cards).sort((a, b) => (a[1].name || a[0]).localeCompare(b[1].name || b[0])), [cards]);
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
          <p className="arcana-studio-status">{status}{isDirty ? ' • Unsaved local changes' : ''}</p>
        </div>
        <div className="arcana-studio-actions">
          <button onClick={onBack}>Back</button>
          <button onClick={() => setShowTutorial(true)}>Tutorial</button>
          <button onClick={saveDraft}>Save Draft</button>
          <button className="danger-button" onClick={resetDraft}>Reset Draft</button>
          <label className="file-like-button">
            Import JSON
            <input type="file" accept="application/json" onChange={importJsonCard} />
          </label>
          <button onClick={exportCard}>Export Card</button>
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
                return (
                <button key={id} className={`card-item ${id === selectedId ? 'selected' : ''}`} onClick={() => { setSelectedId(id); setSelection(null); setPlayheadMs(0); }}>
                  <div className="card-item-top">
                    <strong>{card.name || definition?.name || id}</strong>
                    <span className={`pill ${card.meta?.isCutscene ? 'cutscene' : 'card'}`}>{card.meta?.isCutscene ? 'Cutscene' : 'Card'}</span>
                  </div>
                  <div className="card-item-meta">{(definition?.rarity || 'unknown').toUpperCase()} • {(definition?.category || 'uncategorized')}</div>
                  <span className="card-item-id">{id}</span>
                  <p className="card-item-desc">{truncate(getCardDescription(card) || 'No description', 140)}</p>
                </button>
                );
              })}
            </div>
          </div>

          <div className="arcana-panel">
            <div className="arcana-panel-title">Tracks</div>
            <div className="arcana-add-row">
              <button onClick={() => addTrack('camera')}>+ Camera</button>
              <button onClick={() => addTrack('object')}>+ Object</button>
              <button onClick={() => addTrack('particle')}>+ Particle</button>
              <button onClick={() => addTrack('overlay')}>+ Overlay</button>
              <button onClick={() => addTrack('sound')}>+ Audio</button>
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

              <div className="arcana-overlay-stage">
                {screenOverlays.map(({ track, sample }) => {
                  const style = {
                    left: `${sample.x}%`,
                    top: `${sample.y}%`,
                    opacity: sample.opacity,
                    transform: `translate(-50%, -50%) scale(${sample.scale}) rotate(${sample.rotation}deg)`,
                    color: track.style?.color || '#ffffff',
                    fontSize: `${track.style?.fontSize || 36}px`,
                    fontFamily: track.style?.fontFamily || 'Georgia, serif',
                    fontWeight: track.style?.weight || 700,
                    textAlign: track.style?.align || 'center',
                    background: track.style?.background || 'transparent',
                  };

                  if (track.type === 'image' && track.style?.imageUrl) {
                    return <img key={track.id} className="overlay-preview-node" alt={track.name} src={track.style.imageUrl} style={style} />;
                  }

                  return <div key={track.id} className="overlay-preview-node" style={style}>{sample.text || track.content}</div>;
                })}
              </div>
            </div>

            <div className="arcana-panel timeline-panel">
              <div className="timeline-controls">
                <button onClick={() => setPlayheadMs(0)}>Rewind</button>
                <button onClick={() => setIsPlaying((value) => !value)}>{isPlaying ? 'Pause' : 'Play'}</button>
                <button onClick={() => setPlayheadMs((value) => clamp(value - 100, 0, selectedCard.durationMs || 1))}>-100ms</button>
                <button onClick={() => setPlayheadMs((value) => clamp(value + 100, 0, selectedCard.durationMs || 1))}>+100ms</button>
                {selectedTrack ? <button onClick={() => addKeyToTrack(selection.trackType, selectedTrack.id)}>Add Key</button> : null}
                {selectedKey ? <button onClick={removeSelectedKey}>Delete Key</button> : null}
                {selectedTrack ? <button className="danger-button" onClick={removeSelectedTrack}>Delete Track</button> : null}
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
                <p>Select a track or keyframe to edit detailed properties.</p>
                <label>
                  Description
                  <div className="description-readonly">{selectedCardDescription}</div>
                </label>
              </>
            ) : (
              <>
                <label>
                  Track Name
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
                        <label>
                          Mesh URI
                          <input value={selectedTrack.assetUri || ''} onChange={(event) => {
                            const val = event.target.value.trim();
                            if (val && !/^(blob:|\/|\.\/|\.\.\/)/.test(val)) {
                              setStatus('⚠ Only local meshes allowed (blob:, /, ./, ../)');
                            } else {
                              updateTrackField('object', selectedTrack.id, { assetUri: val });
                            }
                          }} placeholder="blob:, /models/file.glb, ./local.glb" />
                        </label>
                        <label className="file-like-button inline">
                          Import GLB/GLTF
                          <input type="file" accept=".glb,.gltf,model/gltf+json,model/gltf-binary" onChange={importAssetForSelectedObject} />
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
                  </>
                ) : null}

                {selection.trackType === 'particle' ? (
                  <>
                    <label>
                      Attach Target Track ID
                      <input value={selectedTrack.attach?.targetId || ''} onChange={(event) => updateTrackField('particle', selectedTrack.id, { attach: { ...(selectedTrack.attach || {}), targetId: event.target.value || null } })} />
                    </label>
                    <label>
                      Emission Rate
                      <input type="number" value={selectedTrack.params?.emissionRate || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), emissionRate: Number(event.target.value) || 0 } })} />
                    </label>
                    <label>
                      Spawn Radius
                      <input type="number" step="0.01" value={selectedTrack.params?.spawnRadius || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), spawnRadius: Number(event.target.value) || 0 } })} />
                    </label>
                    <label>
                      Lifetime Max
                      <input type="number" step="0.01" value={selectedTrack.params?.lifetimeMax || 0} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), lifetimeMax: Number(event.target.value) || 0 } })} />
                    </label>
                    <label>
                      Color Over Life (JSON)
                      <textarea value={JSON.stringify(selectedTrack.params?.colorOverLife || ['#ffffff'], null, 2)} onChange={(event) => updateTrackField('particle', selectedTrack.id, { params: { ...(selectedTrack.params || {}), colorOverLife: safeJsonParse(event.target.value, ['#ffffff']) } })} />
                    </label>
                  </>
                ) : null}

                {selectedKey ? (
                  <>
                    <hr />
                    <h4>Keyframe</h4>
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
                          <input value={selectedKey.soundId || ''} onChange={(event) => updateKeyField('sound', selectedTrack.id, selectedKey.id, { soundId: event.target.value })} />
                        </label>
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
                          <input value={selectedKey.type || ''} onChange={(event) => updateKeyField('event', selectedTrack.id, selectedKey.id, { type: event.target.value })} />
                        </label>
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
