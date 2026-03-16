import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Canvas, useThree } from '@react-three/fiber';
import { Environment, Line, OrbitControls } from '@react-three/drei';
import { ChessPiece } from './ChessPiece.jsx';
import { ArcanaVisualHost } from '../game/arcana/ArcanaVisualHost.jsx';
import { CameraCutscene, useCameraCutscene } from '../game/arcana/CameraCutscene.jsx';
import CutsceneOverlay from './CutsceneOverlay.jsx';
import { soundManager } from '../game/soundManager.js';
import { ARCANA_DEFINITIONS } from '../game/arcanaDefinitions.js';
import { getCutsceneConfig } from '../game/arcana/cutsceneDefinitions.js';
import './styles/CutsceneStudio.css';

const STORAGE_KEY = 'arcana.cutsceneStudio.blender.v1';

const EASING = [
  'linear',
  'easeInSine',
  'easeOutSine',
  'easeInOutSine',
  'easeInCubic',
  'easeOutCubic',
  'easeInOutCubic',
  'easeOutBack',
];

const MOTION_PROFILES = ['none', 'pulse', 'overdrive', 'fracture'];

const ANCHOR_OPTIONS = ['', 'target', 'dash1', 'dash2', 'dash3', 'displaced1', 'displaced2'];

const TRACK_TITLES = {
  camera: 'Camera',
  actors: 'Actors',
  particles: 'Particles',
  sound: 'Sound',
};

const BOARD_PICK_LABELS = {
  'actor.baseSquare': 'Click a board square to set the actor start square.',
  'actor.keySquare': 'Click a board square to set the actor keyframe square.',
  'particle.square': 'Click a board square to place the particle cue.',
  'particle.targetSquare': 'Click a board square to set the particle target square.',
  'particle.shatteredSquare': 'Click a board square to set the shattered square.',
  'particle.dashPath': 'Click a board square to append one dash-path step.',
  'particle.displaced': 'Click a board square to append one displaced square.',
};

const CUTSCENE_CARD_IDS = [
  'execution',
  'time_freeze',
  'time_travel',
  'divine_intervention',
  'mind_control',
  'astral_rebirth',
  'promotion_ritual',
  'breaking_point',
  'edgerunner_overdrive',
];

const PARTICLE_PRESETS = [
  { id: 'breaking_point', label: 'Breaking Point Burst' },
  { id: 'edgerunner_overdrive', label: 'Overdrive Trail' },
  { id: 'execution', label: 'Execution Impact' },
  { id: 'time_freeze', label: 'Time Freeze' },
  { id: 'mind_control', label: 'Mind Control Pulse' },
  { id: 'astral_rebirth', label: 'Astral Rebirth' },
  { id: 'promotion_ritual', label: 'Promotion Ritual' },
];

function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function applyEasing(type, t) {
  const x = clamp(t, 0, 1);
  switch (type) {
    case 'easeInSine':
      return 1 - Math.cos((x * Math.PI) / 2);
    case 'easeOutSine':
      return Math.sin((x * Math.PI) / 2);
    case 'easeInOutSine':
      return -(Math.cos(Math.PI * x) - 1) / 2;
    case 'easeInCubic':
      return x * x * x;
    case 'easeOutCubic':
      return 1 - Math.pow(1 - x, 3);
    case 'easeInOutCubic':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'easeOutBack': {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    case 'linear':
    default:
      return x;
  }
}

function squareToPosition(square) {
  if (!square || typeof square !== 'string' || square.length < 2) return [0, 0.15, 0];
  const file = 'abcdefgh'.indexOf(String(square[0]).toLowerCase());
  const rank = Number(square[1]);
  if (file < 0 || rank < 1 || rank > 8) return [0, 0.15, 0];
  return [file - 3.5, 0.15, 8 - rank - 3.5];
}

function formatMs(ms) {
  return `${Math.round(ms)}ms`;
}

function parseFenPieces(fen) {
  if (!fen) return [];
  const chess = new Chess();
  try {
    chess.load(fen);
  } catch {
    return [];
  }
  const pieces = [];
  const files = 'abcdefgh';
  for (let rank = 8; rank >= 1; rank--) {
    for (let file = 0; file < 8; file++) {
      const sq = `${files[file]}${rank}`;
      const piece = chess.get(sq);
      if (!piece) continue;
      pieces.push({
        id: `${sq}-${piece.type}-${piece.color}`,
        type: piece.type,
        isWhite: piece.color === 'w',
        square: sq,
        position: squareToPosition(sq),
      });
    }
  }
  return pieces;
}

function parseCsvSquares(v) {
  return String(v || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function parseJsonSafe(v, fallback) {
  try {
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function stringifySquares(value) {
  return JSON.stringify(Array.isArray(value) ? value : [], null, 2);
}

function defaultProject() {
  return {
    id: 'custom_cutscene',
    fps: 60,
    duration: 4200,
    fen: 'rnbqkbnr/pppppppp/8/8/3N4/8/PPPPPPPP/R1BQKBNR w KQkq - 0 1',
    anchors: {
      target: 'd4',
      dash1: 'e5',
      dash2: 'f6',
      dash3: 'g7',
      displaced1: 'c4',
      displaced2: 'e4',
    },
    actors: [
      { id: uid('actor'), name: 'Attacker', type: 'n', isWhite: true, baseSquare: 'd4' },
      { id: uid('actor'), name: 'Defender', type: 'b', isWhite: false, baseSquare: 'f6' },
    ],
    actorKeys: [],
    cameraKeys: [
      {
        id: uid('cam'),
        atMs: 0,
        anchor: 'target',
        square: '',
        zoom: 2.1,
        duration: 340,
        holdDuration: 300,
        returnDuration: 280,
        easing: 'easeOutCubic',
        returnEasing: 'easeInOutCubic',
        offset: [2.2, 2.8, 1.7],
        lookAtYOffset: 0.3,
      },
      {
        id: uid('cam'),
        atMs: 920,
        anchor: 'dash1',
        square: '',
        zoom: 2.35,
        duration: 320,
        holdDuration: 260,
        returnDuration: 240,
        easing: 'easeOutCubic',
        returnEasing: 'easeInOutCubic',
        offset: [-1.8, 2.7, -1.4],
        lookAtYOffset: 0.25,
      },
    ],
    particleCues: [
      {
        id: uid('vfx'),
        atMs: 0,
        arcanaId: 'edgerunner_overdrive',
        square: 'd4',
        anchor: 'target',
        clearAfterMs: 1800,
        editor: {
          targetSquare: 'd4',
          dashPathCsv: 'e5,f6,g7',
          pieceType: 'n',
          pieceColor: 'w',
          shatteredSquare: 'd4',
          displacedJson: '[]',
        },
        paramsJson: '{"dashPath":["e5","f6","g7"],"pieceType":"n","pieceColor":"w"}',
      },
    ],
    soundCues: [
      { id: uid('snd'), atMs: 0, key: 'arcana:edgerunner_overdrive_activation' },
      { id: uid('snd'), atMs: 880, key: 'arcana:edgerunner_overdrive_rush' },
    ],
  };
}

function sortByTime(arr) {
  return [...(arr || [])].sort((a, b) => Number(a.atMs || 0) - Number(b.atMs || 0));
}

function resolveSquare(project, selectedSquare, square, anchor) {
  if (square) return square;
  if (anchor && project.anchors?.[anchor]) return project.anchors[anchor];
  return project.anchors?.target || selectedSquare || 'd4';
}

function buildParticleParams(cue, fallbackSquare) {
  const base = parseJsonSafe(cue.paramsJson, {});
  const editor = cue.editor || {};

  if (cue.arcanaId === 'edgerunner_overdrive') {
    return {
      ...base,
      targetSquare: editor.targetSquare || base.targetSquare || fallbackSquare,
      dashPath: parseCsvSquares(editor.dashPathCsv || base.dashPath?.join(',') || ''),
      pieceType: editor.pieceType || base.pieceType || 'n',
      pieceColor: editor.pieceColor || base.pieceColor || 'w',
    };
  }

  if (cue.arcanaId === 'breaking_point') {
    return {
      ...base,
      shatteredSquare: editor.shatteredSquare || base.shatteredSquare || fallbackSquare,
      displaced: parseJsonSafe(editor.displacedJson, base.displaced || []),
    };
  }

  return base;
}

function interpolateActorState(actor, keys, playheadMs) {
  if (!keys || keys.length === 0) {
    const position = squareToPosition(actor.baseSquare);
    return { square: actor.baseSquare, position, profile: 'none', intensity: 0 };
  }

  const sorted = sortByTime(keys);
  const prev = [...sorted].reverse().find((k) => Number(k.atMs || 0) <= playheadMs) || sorted[0];
  const next = sorted.find((k) => Number(k.atMs || 0) > playheadMs) || prev;

  const p0 = squareToPosition(prev.square || actor.baseSquare);
  const p1 = squareToPosition(next.square || prev.square || actor.baseSquare);

  const t0 = Number(prev.atMs || 0);
  const t1 = Number(next.atMs || t0 + 1);
  const w = Math.max(1, t1 - t0);
  const rawT = clamp((playheadMs - t0) / w, 0, 1);
  const easedT = applyEasing(next.easing || prev.easing || 'linear', rawT);

  return {
    square: next.square || prev.square || actor.baseSquare,
    position: [
      p0[0] + (p1[0] - p0[0]) * easedT,
      p0[1] + (p1[1] - p0[1]) * easedT,
      p0[2] + (p1[2] - p0[2]) * easedT,
    ],
    profile: prev.profile || 'none',
    intensity: Number(prev.intensity || 0),
  };
}

function CameraProbe({ controlsRef, onCameraState }) {
  const sentRef = useRef(0);

  useEffect(() => {
    const timer = setInterval(() => {
      const camera = controlsRef.current?.object;
      if (!camera) return;
      const now = Date.now();
      if (now - sentRef.current < 120) return;
      sentRef.current = now;
      const target = controlsRef.current?.target;
      onCameraState({
        cameraPosition: camera.position.toArray(),
        target: target ? target.toArray() : [0, 0, 0],
      });
    }, 120);

    return () => clearInterval(timer);
  }, [controlsRef, onCameraState]);

  return null;
}

function CameraKeyGizmo({ project, selectedSquare, keyframe, index }) {
  const lookSquare = resolveSquare(project, selectedSquare, keyframe.square, keyframe.anchor);
  const [sx, sy, sz] = squareToPosition(lookSquare);
  const zoom = Number(keyframe.zoom || 1.8);
  const offset = Array.isArray(keyframe.offset) ? keyframe.offset : [2, 3, 2];
  const cameraPos = [sx + Number(offset[0]) / zoom, sy + Number(offset[1]) / zoom, sz + Number(offset[2]) / zoom];
  const lookPos = [sx, sy + Number(keyframe.lookAtYOffset || 0), sz];
  const color = `hsl(${(index * 47) % 360} 90% 65%)`;

  return (
    <group>
      <Line points={[cameraPos, lookPos]} color={color} transparent opacity={0.72} lineWidth={1} />
      <mesh position={cameraPos}>
        <boxGeometry args={[0.22, 0.14, 0.14]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}

function getCameraPreviewPose(project, selectedSquare, keyframe) {
  if (!keyframe) {
    return {
      position: [8, 10, 8],
      target: [0, 0, 0],
      zoom: 1,
      square: selectedSquare || project.anchors?.target || 'd4',
    };
  }

  const lookSquare = resolveSquare(project, selectedSquare, keyframe.square, keyframe.anchor);
  const [sx, sy, sz] = squareToPosition(lookSquare);
  const zoom = Number(keyframe.zoom || 1.8);
  const offset = Array.isArray(keyframe.offset) ? keyframe.offset : [2, 3, 2];

  return {
    position: [sx + Number(offset[0]) / zoom, sy + Number(offset[1]) / zoom, sz + Number(offset[2]) / zoom],
    target: [sx, sy + Number(keyframe.lookAtYOffset || 0), sz],
    zoom,
    square: lookSquare,
  };
}

function PreviewCameraRig({ pose }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(...pose.position);
    camera.zoom = clamp(Number(pose.zoom || 1), 0.7, 4);
    camera.lookAt(...pose.target);
    camera.updateProjectionMatrix();
  }, [camera, pose]);

  return null;
}

function StudioBoardScene({
  project,
  selectedSquare,
  onSquareSelect,
  showCameraGizmos,
  cameraKeysSorted,
  actorPieces,
  effectsModule,
  activeVisualArcana,
  visualHostResetKey,
  interactive = true,
}) {
  return (
    <>
      <ambientLight intensity={0.76} />
      <directionalLight position={[6, 10, 4]} intensity={0.7} castShadow />
      <Environment preset="city" />

      <group>
        {Array.from({ length: 8 }, (_, file) =>
          Array.from({ length: 8 }, (_, rank) => {
            const sq = `${'abcdefgh'[file]}${8 - rank}`;
            const x = file - 3.5;
            const z = rank - 3.5;
            const isLight = (file + rank) % 2 === 0;
            const isSel = selectedSquare === sq;
            return (
              <mesh
                key={sq}
                position={[x, 0, z]}
                rotation={[-Math.PI / 2, 0, 0]}
                onPointerDown={interactive && onSquareSelect ? (e) => {
                  e.stopPropagation();
                  onSquareSelect(sq);
                } : undefined}
                receiveShadow
              >
                <planeGeometry args={[1, 1]} />
                <meshStandardMaterial color={isSel ? '#fff58a' : (isLight ? '#d8dce4' : '#465063')} roughness={0.82} metalness={0.08} />
              </mesh>
            );
          }),
        )}
      </group>

      {showCameraGizmos && cameraKeysSorted.map((k, i) => (
        <CameraKeyGizmo key={k.id} project={project} selectedSquare={selectedSquare} keyframe={k} index={i} />
      ))}

      {actorPieces.map((p) => (
        <ChessPiece
          key={p.id}
          type={p.type}
          isWhite={p.isWhite}
          square={p.square}
          targetPosition={p.position}
          cutsceneMotion={p.motion}
          onClickSquare={interactive ? onSquareSelect : undefined}
        />
      ))}

      <ArcanaVisualHost
        key={`visual-host-${visualHostResetKey}`}
        effectsModule={effectsModule}
        activeVisualArcana={activeVisualArcana}
        gameState={{ activeEffects: {} }}
        pawnShields={{ w: null, b: null }}
        showFog={false}
      />
    </>
  );
}

export function CutsceneStudio({ onBack }) {
  const controlsRef = useRef(null);
  const overlayRef = useRef(null);
  const rafRef = useRef(null);
  const eventTimersRef = useRef([]);
  const timelineDragRef = useRef(null);
  const { cutsceneTarget, triggerCutscene, clearCutscene } = useCameraCutscene();

  const [project, setProject] = useState(defaultProject);
  const [effectsModule, setEffectsModule] = useState(null);
  const [status, setStatus] = useState('Ready');
  const [playheadMs, setPlayheadMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState('');
  const [selectedTrack, setSelectedTrack] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [activeVisualArcana, setActiveVisualArcana] = useState(null);
  const [cameraLive, setCameraLive] = useState({ cameraPosition: [8, 10, 8], target: [0, 0, 0] });
  const [showCameraGizmos, setShowCameraGizmos] = useState(true);
  const [enableMotionFx, setEnableMotionFx] = useState(false);
  const [templateName, setTemplateName] = useState('My Scene');
  const [templates, setTemplates] = useState([]);
  const [importCardId, setImportCardId] = useState('');
  const [exportText, setExportText] = useState('');
  const [boardPickMode, setBoardPickMode] = useState(null);
  const [showTutorial, setShowTutorial] = useState(true);
  const [visualHostResetKey, setVisualHostResetKey] = useState(0);

  useEffect(() => {
    import('../game/arcana/arcanaVisuals.jsx')
      .then((m) => setEffectsModule(m))
      .catch(() => setEffectsModule({}));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setTemplates(parsed);
    } catch {
      setTemplates([]);
    }
  }, []);

  const persistTemplates = (next) => {
    setTemplates(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage failures
    }
  };

  const actorKeysSorted = useMemo(() => sortByTime(project.actorKeys), [project.actorKeys]);
  const cameraKeysSorted = useMemo(() => sortByTime(project.cameraKeys), [project.cameraKeys]);
  const particleSorted = useMemo(() => sortByTime(project.particleCues), [project.particleCues]);
  const soundSorted = useMemo(() => sortByTime(project.soundCues), [project.soundCues]);

  const sceneDuration = useMemo(() => {
    const maxCue = Math.max(
      1200,
      ...cameraKeysSorted.map((k) => Number(k.atMs || 0) + Number(k.duration || 0) + Number(k.holdDuration || 0) + Number(k.returnDuration || 0)),
      ...particleSorted.map((k) => Number(k.atMs || 0) + Number(k.clearAfterMs || 1200)),
      ...soundSorted.map((k) => Number(k.atMs || 0)),
      ...actorKeysSorted.map((k) => Number(k.atMs || 0)),
      Number(project.duration || 0),
    );
    return Math.max(1200, maxCue);
  }, [cameraKeysSorted, particleSorted, soundSorted, actorKeysSorted, project.duration]);

  useEffect(() => {
    if (project.duration === sceneDuration) return;
    setProject((prev) => ({ ...prev, duration: sceneDuration }));
  }, [sceneDuration, project.duration]);

  const allArcanaIds = useMemo(
    () => (ARCANA_DEFINITIONS || []).map((a) => a?.id).filter(Boolean).sort((a, b) => String(a).localeCompare(String(b))),
    [],
  );

  const actorPieces = useMemo(() => {
    if (project.actors.length === 0) {
      return parseFenPieces(project.fen).map((p) => ({ ...p, motion: null }));
    }

    return project.actors.map((actor) => {
      const keys = actorKeysSorted.filter((k) => k.actorId === actor.id);
      const state = interpolateActorState(actor, keys, playheadMs);
      const motionProfile = state.profile || 'none';
      const shouldMotion = enableMotionFx && motionProfile !== 'none';
      return {
        id: actor.id,
        type: actor.type,
        isWhite: !!actor.isWhite,
        square: state.square,
        position: state.position,
        motion: shouldMotion
          ? {
              active: true,
              profile: motionProfile,
              intensity: Number(state.intensity || 0.1),
              phase: actor.id.length * 11,
            }
          : null,
      };
    });
  }, [project.actors, project.fen, actorKeysSorted, playheadMs, enableMotionFx]);

  const resetVisualPreview = () => {
    setActiveVisualArcana(null);
    setVisualHostResetKey((v) => v + 1);
  };

  const queueVisualPreview = (arcanaId, params, clearAfterMs) => {
    resetVisualPreview();

    const startTimer = setTimeout(() => {
      setActiveVisualArcana({ arcanaId, params });
    }, 0);
    eventTimersRef.current.push(startTimer);

    const clearTimer = setTimeout(() => {
      resetVisualPreview();
    }, Math.max(120, Number(clearAfterMs || 1200)));
    eventTimersRef.current.push(clearTimer);
  };

  const clearTimers = () => {
    eventTimersRef.current.forEach((t) => clearTimeout(t));
    eventTimersRef.current = [];
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const stopPlayback = () => {
    clearTimers();
    setIsPlaying(false);
    resetVisualPreview();
    clearCutscene();
    setStatus('Stopped');
  };

  useEffect(() => () => clearTimers(), []);

  const playTimeline = () => {
    stopPlayback();
    const duration = Number(project.duration || 3000);
    setIsPlaying(true);
    setPlayheadMs(0);
    setStatus('Playing');

    cameraKeysSorted.forEach((key, idx) => {
      const timer = setTimeout(() => {
        const sq = resolveSquare(project, selectedSquare, key.square, key.anchor);
        triggerCutscene(sq, {
          zoom: Number(key.zoom || 1.8),
          duration: Number(key.duration || 320),
          holdDuration: Number(key.holdDuration || 280),
          returnDuration: Number(key.returnDuration || 260),
          easing: key.easing || 'easeOutCubic',
          returnEasing: key.returnEasing || 'easeInOutCubic',
          offset: [
            Number(key.offset?.[0] || 2),
            Number(key.offset?.[1] || 3),
            Number(key.offset?.[2] || 2),
          ],
          lookAtYOffset: Number(key.lookAtYOffset || 0),
          sequenceStart: idx === 0,
          sequenceEnd: idx === cameraKeysSorted.length - 1,
          holdPosition: idx !== cameraKeysSorted.length - 1,
        });
      }, Number(key.atMs || 0));
      eventTimersRef.current.push(timer);
    });

    soundSorted.forEach((cue) => {
      const timer = setTimeout(() => {
        if (!cue.key) return;
        try {
          soundManager.play(cue.key);
        } catch {
          setStatus(`Sound key failed: ${cue.key}`);
        }
      }, Number(cue.atMs || 0));
      eventTimersRef.current.push(timer);
    });

    const cameraBeats = cameraKeysSorted.map((k) => Number(k.atMs || 0));
    particleSorted.forEach((cue) => {
      const timer = setTimeout(() => {
        const sq = resolveSquare(project, selectedSquare, cue.square, cue.anchor);
        const params = buildParticleParams(cue, sq);
        queueVisualPreview(
          cue.arcanaId,
          {
            ...params,
            square: sq,
            targetSquare: params.targetSquare || sq,
            beatTimingsMs: cameraBeats,
            syncDurationMs: duration,
          },
          cue.clearAfterMs,
        );
      }, Number(cue.atMs || 0));
      eventTimersRef.current.push(timer);
    });

    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= duration) {
        setPlayheadMs(duration);
        setIsPlaying(false);
        setStatus('Playback complete');
        clearCutscene();
        return;
      }
      setPlayheadMs(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const selectedCameraKey = useMemo(() => project.cameraKeys.find((k) => k.id === selectedId) || null, [project.cameraKeys, selectedId]);
  const selectedActor = useMemo(() => project.actors.find((a) => a.id === selectedId) || null, [project.actors, selectedId]);
  const selectedActorKey = useMemo(() => project.actorKeys.find((k) => k.id === selectedId) || null, [project.actorKeys, selectedId]);
  const selectedParticleCue = useMemo(() => project.particleCues.find((k) => k.id === selectedId) || null, [project.particleCues, selectedId]);
  const selectedSoundCue = useMemo(() => project.soundCues.find((k) => k.id === selectedId) || null, [project.soundCues, selectedId]);

  const previewCameraKey = useMemo(
    () => selectedCameraKey || [...cameraKeysSorted].reverse().find((k) => Number(k.atMs || 0) <= playheadMs) || cameraKeysSorted[0] || null,
    [selectedCameraKey, cameraKeysSorted, playheadMs],
  );

  const previewCameraPose = useMemo(
    () => getCameraPreviewPose(project, selectedSquare, previewCameraKey),
    [project, selectedSquare, previewCameraKey],
  );

  const dashPathSquares = useMemo(
    () => parseCsvSquares(selectedParticleCue?.editor?.dashPathCsv || ''),
    [selectedParticleCue],
  );

  const displacedSquares = useMemo(
    () => parseJsonSafe(selectedParticleCue?.editor?.displacedJson, []),
    [selectedParticleCue],
  );

  const replaceById = (arr, idToUpdate, updater) => arr.map((item) => (item.id === idToUpdate ? updater(item) : item));

  const updateTrackAtMs = (track, id, nextAtMs) => {
    const clampedAt = clamp(Math.round(nextAtMs), 0, Math.max(1, project.duration));
    setPlayheadMs(clampedAt);
    setProject((prev) => {
      if (track === 'camera') {
        return { ...prev, cameraKeys: replaceById(prev.cameraKeys, id, (k) => ({ ...k, atMs: clampedAt })) };
      }
      if (track === 'actors') {
        return { ...prev, actorKeys: replaceById(prev.actorKeys, id, (k) => ({ ...k, atMs: clampedAt })) };
      }
      if (track === 'particles') {
        return { ...prev, particleCues: replaceById(prev.particleCues, id, (k) => ({ ...k, atMs: clampedAt })) };
      }
      if (track === 'sound') {
        return { ...prev, soundCues: replaceById(prev.soundCues, id, (k) => ({ ...k, atMs: clampedAt })) };
      }
      return prev;
    });
  };

  const timelineMsFromPointer = (clientX, rect) => {
    const ratio = clamp((clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return Math.round(ratio * project.duration);
  };

  const beginMarkerDrag = (event, track, id) => {
    if (isPlaying) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = event.currentTarget.parentElement.getBoundingClientRect();
    const nextMs = timelineMsFromPointer(event.clientX, rect);
    timelineDragRef.current = { type: 'marker', track, id, rect };
    setSelectedTrack(track);
    setSelectedId(id);
    updateTrackAtMs(track, id, nextMs);
  };

  const beginPlayheadDrag = (event) => {
    if (isPlaying) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const nextMs = timelineMsFromPointer(event.clientX, rect);
    timelineDragRef.current = { type: 'playhead', rect };
    setPlayheadMs(nextMs);
  };

  useEffect(() => {
    const onPointerMove = (event) => {
      const drag = timelineDragRef.current;
      if (!drag) return;
      const nextMs = timelineMsFromPointer(event.clientX, drag.rect);
      if (drag.type === 'marker') {
        updateTrackAtMs(drag.track, drag.id, nextMs);
        return;
      }
      setPlayheadMs(nextMs);
    };

    const onPointerUp = () => {
      timelineDragRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [project.duration]);

  const updateSelectedParticleCue = (updater) => {
    if (!selectedParticleCue) return;
    setProject((prev) => ({
      ...prev,
      particleCues: replaceById(prev.particleCues, selectedParticleCue.id, updater),
    }));
  };

  const setParticleEditorField = (field, value) => {
    updateSelectedParticleCue((cue) => ({
      ...cue,
      editor: { ...(cue.editor || {}), [field]: value },
    }));
  };

  const applyBoardSelection = (square) => {
    setSelectedSquare(square);

    if (boardPickMode === 'actor.baseSquare' && selectedActor) {
      setProject((prev) => ({
        ...prev,
        actors: replaceById(prev.actors, selectedActor.id, (actor) => ({ ...actor, baseSquare: square })),
      }));
      setStatus(`Set ${selectedActor.name} base square to ${square}`);
      setBoardPickMode(null);
      return;
    }

    if (boardPickMode === 'actor.keySquare' && selectedActorKey) {
      setProject((prev) => ({
        ...prev,
        actorKeys: replaceById(prev.actorKeys, selectedActorKey.id, (key) => ({ ...key, square })),
      }));
      setStatus(`Set actor keyframe to ${square}`);
      setBoardPickMode(null);
      return;
    }

    if (boardPickMode === 'particle.square' && selectedParticleCue) {
      updateSelectedParticleCue((cue) => ({ ...cue, square }));
      setStatus(`Placed particle cue on ${square}`);
      setBoardPickMode(null);
      return;
    }

    if (boardPickMode === 'particle.targetSquare' && selectedParticleCue) {
      setParticleEditorField('targetSquare', square);
      setStatus(`Set particle target square to ${square}`);
      setBoardPickMode(null);
      return;
    }

    if (boardPickMode === 'particle.shatteredSquare' && selectedParticleCue) {
      setParticleEditorField('shatteredSquare', square);
      setStatus(`Set shattered square to ${square}`);
      setBoardPickMode(null);
      return;
    }

    if (boardPickMode === 'particle.dashPath' && selectedParticleCue) {
      const nextPath = [...dashPathSquares, square];
      setParticleEditorField('dashPathCsv', nextPath.join(','));
      setStatus(`Added ${square} to dash path`);
      setBoardPickMode(null);
      return;
    }

    if (boardPickMode === 'particle.displaced' && selectedParticleCue) {
      const nextDisplaced = [
        ...displacedSquares,
        { from: selectedParticleCue.editor?.shatteredSquare || selectedParticleCue.square || square, to: square },
      ];
      setParticleEditorField('displacedJson', stringifySquares(nextDisplaced));
      setStatus(`Added ${square} to displaced squares`);
      setBoardPickMode(null);
    }
  };

  const addCameraKeyAtPlayhead = () => {
    const item = {
      id: uid('cam'),
      atMs: Math.round(playheadMs),
      anchor: 'target',
      square: '',
      zoom: 2,
      duration: 320,
      holdDuration: 260,
      returnDuration: 240,
      easing: 'easeOutCubic',
      returnEasing: 'easeInOutCubic',
      offset: [2, 2.8, 1.8],
      lookAtYOffset: 0.2,
    };
    setProject((prev) => ({ ...prev, cameraKeys: [...prev.cameraKeys, item] }));
    setSelectedTrack('camera');
    setSelectedId(item.id);
  };

  const addActor = () => {
    const item = {
      id: uid('actor'),
      name: `Actor ${project.actors.length + 1}`,
      type: 'n',
      isWhite: true,
      baseSquare: selectedSquare || 'd4',
    };
    setProject((prev) => ({ ...prev, actors: [...prev.actors, item] }));
    setSelectedTrack('actors');
    setSelectedId(item.id);
  };

  const addActorKeyAtPlayhead = (actorId) => {
    const actor = project.actors.find((a) => a.id === actorId);
    if (!actor) {
      setStatus('Select an actor first.');
      return;
    }
    const item = {
      id: uid('akey'),
      actorId,
      atMs: Math.round(playheadMs),
      square: selectedSquare || actor.baseSquare,
      profile: 'none',
      intensity: 0,
      easing: 'linear',
    };
    setProject((prev) => ({ ...prev, actorKeys: [...prev.actorKeys, item] }));
    setSelectedTrack('actors');
    setSelectedId(item.id);
  };

  const addParticleCueAtPlayhead = () => {
    const preset = PARTICLE_PRESETS[0];
    const item = {
      id: uid('vfx'),
      atMs: Math.round(playheadMs),
      arcanaId: preset.id,
      square: selectedSquare || 'd4',
      anchor: 'target',
      clearAfterMs: 1400,
      editor: {
        targetSquare: selectedSquare || 'd4',
        dashPathCsv: 'e5,f6,g7',
        pieceType: 'n',
        pieceColor: 'w',
        shatteredSquare: selectedSquare || 'd4',
        displacedJson: '[]',
      },
      paramsJson: '{}',
    };
    setProject((prev) => ({ ...prev, particleCues: [...prev.particleCues, item] }));
    setSelectedTrack('particles');
    setSelectedId(item.id);
  };

  const addSoundCueAtPlayhead = () => {
    const item = {
      id: uid('snd'),
      atMs: Math.round(playheadMs),
      key: 'arcana:impact',
    };
    setProject((prev) => ({ ...prev, soundCues: [...prev.soundCues, item] }));
    setSelectedTrack('sound');
    setSelectedId(item.id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setProject((prev) => ({
      ...prev,
      cameraKeys: prev.cameraKeys.filter((k) => k.id !== selectedId),
      actors: prev.actors.filter((k) => k.id !== selectedId),
      actorKeys: prev.actorKeys.filter((k) => k.id !== selectedId && k.actorId !== selectedId),
      particleCues: prev.particleCues.filter((k) => k.id !== selectedId),
      soundCues: prev.soundCues.filter((k) => k.id !== selectedId),
    }));
    setSelectedId(null);
  };

  const saveTemplate = () => {
    const tpl = { id: uid('tpl'), name: templateName || 'Untitled', savedAt: Date.now(), project };
    persistTemplates([tpl, ...templates].slice(0, 50));
    setStatus(`Saved template: ${tpl.name}`);
  };

  const loadTemplate = (tplId) => {
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) return;
    setProject(tpl.project);
    setStatus(`Loaded template: ${tpl.name}`);
  };

  const removeTemplate = (tplId) => {
    persistTemplates(templates.filter((t) => t.id !== tplId));
  };

  const importCard = (cardId) => {
    const cfg = getCutsceneConfig(cardId);
    if (!cfg?.config?.camera) {
      setProject((prev) => ({
        ...prev,
        id: `${cardId}_scene`,
        particleCues: [
          {
            id: uid('vfx'),
            atMs: 0,
            arcanaId: cardId,
            square: prev.anchors.target || 'd4',
            anchor: 'target',
            clearAfterMs: 1400,
            editor: { targetSquare: prev.anchors.target || 'd4', dashPathCsv: '', pieceType: 'n', pieceColor: 'w', shatteredSquare: prev.anchors.target || 'd4', displacedJson: '[]' },
            paramsJson: '{}',
          },
        ],
      }));
      setStatus(`Imported ${cardId} as particle-only scene`);
      return;
    }

    const cameraKeys = (cfg.config.camera.shots || []).map((s, idx) => ({
      id: uid('cam'),
      atMs: idx * 900,
      anchor: s.anchor || 'target',
      square: s.square || '',
      zoom: Number(s.zoom || cfg.config.camera.targetZoom || 1.8),
      duration: Number(s.duration || cfg.config.camera.duration || 320),
      holdDuration: Number(s.holdDuration || cfg.config.camera.holdDuration || 280),
      returnDuration: Number(s.returnDuration || cfg.config.camera.returnDuration || cfg.config.camera.duration || 260),
      easing: s.easing || 'easeOutCubic',
      returnEasing: s.returnEasing || 'easeInOutCubic',
      offset: [
        Number(s.offset?.[0] || cfg.config.camera.offset?.[0] || 2),
        Number(s.offset?.[1] || cfg.config.camera.offset?.[1] || 3),
        Number(s.offset?.[2] || cfg.config.camera.offset?.[2] || 2),
      ],
      lookAtYOffset: Number(s.lookAtYOffset ?? cfg.config.camera.lookAtYOffset ?? 0.2),
    }));

    const soundCues = Object.values(cfg.config.sound || {}).map((key, idx) => ({
      id: uid('snd'),
      atMs: idx * 600,
      key: String(key),
    }));

    setProject((prev) => ({
      ...prev,
      id: `${cardId}_scene`,
      duration: Number(cfg.duration || prev.duration),
      cameraKeys,
      soundCues,
    }));
    setStatus(`Imported ${cardId} cutscene`);
  };

  const exportForGame = () => {
    const shots = sortByTime(project.cameraKeys).map((k) => ({
      ...(k.anchor ? { anchor: k.anchor } : {}),
      ...(k.square ? { square: k.square } : {}),
      zoom: Number(k.zoom || 1.8),
      duration: Number(k.duration || 320),
      holdDuration: Number(k.holdDuration || 280),
      returnDuration: Number(k.returnDuration || 260),
      easing: k.easing || 'easeOutCubic',
      returnEasing: k.returnEasing || 'easeInOutCubic',
      offset: [Number(k.offset?.[0] || 2), Number(k.offset?.[1] || 3), Number(k.offset?.[2] || 2)],
      lookAtYOffset: Number(k.lookAtYOffset || 0),
    }));

    const sound = {};
    sortByTime(project.soundCues).forEach((s, idx) => {
      sound[`cue_${idx + 1}`] = s.key;
    });

    const particleCues = sortByTime(project.particleCues).map((cue) => ({
      ...cue,
      params: buildParticleParams(cue, resolveSquare(project, selectedSquare, cue.square, cue.anchor)),
    }));

    const payload = {
      id: project.id,
      duration: Number(project.duration || 3000),
      config: {
        camera: {
          targetZoom: shots[0]?.zoom || 1.8,
          duration: shots[0]?.duration || 320,
          holdDuration: shots[0]?.holdDuration || 280,
          shots,
        },
        overlay: {
          effect: 'flash',
          color: '#ffffff',
          duration: 220,
          intensity: 0.4,
          fadeIn: 40,
          hold: 80,
          fadeOut: 100,
        },
        vfx: {
          studioParticleCues: particleCues,
          studioPieceAnimation: {
            actors: project.actors,
            keyframes: sortByTime(project.actorKeys),
          },
        },
        sound,
        phases: [
          {
            name: 'studio_sequence',
            duration: Number(project.duration || 3000),
            actions: ['camera_move', 'vfx_particles', 'sound_cues', 'piece_animation'],
          },
        ],
      },
      studioData: project,
      integrationHint: {
        whereToPaste: 'client/src/game/arcana/cutsceneDefinitions.js',
        addToGetConfigMap: true,
        passEventParamsForAnchors: true,
      },
    };

    const txt = JSON.stringify(payload, null, 2);
    setExportText(txt);
    navigator.clipboard?.writeText(txt).then(
      () => setStatus('Copied export payload to clipboard'),
      () => setStatus('Export generated (clipboard unavailable)'),
    );
  };

  const previewSelectedParticleCue = () => {
    if (!selectedParticleCue) return;
    const square = resolveSquare(project, selectedSquare, selectedParticleCue.square, selectedParticleCue.anchor);
    const params = buildParticleParams(selectedParticleCue, square);
    queueVisualPreview(
      selectedParticleCue.arcanaId,
      {
        ...params,
        square,
        targetSquare: params.targetSquare || square,
      },
      selectedParticleCue.clearAfterMs,
    );
  };

  const timelineRows = useMemo(() => {
    const actorMarkers = actorKeysSorted.map((k) => ({ id: k.id, atMs: Number(k.atMs || 0), label: `A:${k.actorId?.slice(-3) || ''}` }));
    return {
      camera: cameraKeysSorted.map((k) => ({ id: k.id, atMs: Number(k.atMs || 0), label: 'C' })),
      actors: actorMarkers,
      particles: particleSorted.map((k) => ({ id: k.id, atMs: Number(k.atMs || 0), label: 'V' })),
      sound: soundSorted.map((k) => ({ id: k.id, atMs: Number(k.atMs || 0), label: 'S' })),
    };
  }, [cameraKeysSorted, actorKeysSorted, particleSorted, soundSorted]);

  const playheadPct = (playheadMs / Math.max(1, project.duration)) * 100;
  const boardPickHint = boardPickMode ? BOARD_PICK_LABELS[boardPickMode] : '';

  return (
    <div className="studio2-root">
      <header className="studio2-topbar">
        <div className="studio2-title-wrap">
          <h1>Cutscene Studio 2.0</h1>
          <span>{status}</span>
        </div>
        <div className="studio2-top-actions">
          <button className="studio2-btn ghost" onClick={onBack}>Back</button>
          <button className="studio2-btn" onClick={playTimeline} disabled={isPlaying}>Play</button>
          <button className="studio2-btn ghost" onClick={stopPlayback}>Stop</button>
          <button className="studio2-btn ghost" onClick={() => setShowTutorial((v) => !v)}>{showTutorial ? 'Hide Tutorial' : 'Show Tutorial'}</button>
          <button className="studio2-btn" onClick={exportForGame}>Export To Game</button>
        </div>
      </header>

      <div className="studio2-main">
        <aside className="studio2-outliner">
          <div className="studio2-panel-head">Outliner</div>

          <div className="studio2-group">
            <div className="studio2-group-head">Focus</div>
            <button className={`studio2-item ${selectedTrack === 'camera' ? 'active' : ''}`} onClick={() => { setSelectedTrack('camera'); setSelectedId(null); }}>Camera Shots</button>
            <button className={`studio2-item ${selectedTrack === 'actors' ? 'active' : ''}`} onClick={() => { setSelectedTrack('actors'); setSelectedId(null); }}>Actors (animated pieces)</button>
            <button className={`studio2-item ${selectedTrack === 'particles' ? 'active' : ''}`} onClick={() => { setSelectedTrack('particles'); setSelectedId(null); }}>Particles (VFX cues)</button>
            <button className={`studio2-item ${selectedTrack === 'sound' ? 'active' : ''}`} onClick={() => { setSelectedTrack('sound'); setSelectedId(null); }}>Sound Cues</button>
          </div>

          <div className="studio2-group">
            <div className="studio2-group-head">Camera Keys</div>
            <button className="studio2-mini" onClick={addCameraKeyAtPlayhead}>+ Key At Playhead</button>
            {cameraKeysSorted.map((k) => (
              <button key={k.id} className={`studio2-item ${selectedId === k.id ? 'active' : ''}`} onClick={() => { setSelectedTrack('camera'); setSelectedId(k.id); setPlayheadMs(Number(k.atMs || 0)); }}>
                {formatMs(k.atMs)}
              </button>
            ))}
          </div>

          <div className="studio2-group">
            <div className="studio2-group-head">Actors</div>
            <button className="studio2-mini" onClick={addActor}>+ Actor</button>
            {project.actors.map((a) => (
              <button key={a.id} className={`studio2-item ${selectedId === a.id ? 'active' : ''}`} onClick={() => { setSelectedTrack('actors'); setSelectedId(a.id); }}>
                {a.name}
              </button>
            ))}
            <button className="studio2-mini" onClick={() => addActorKeyAtPlayhead(selectedActor?.id || project.actors[0]?.id)}>+ Actor Key At Playhead</button>
          </div>

          <div className="studio2-group">
            <div className="studio2-group-head">Particles</div>
            <button className="studio2-mini" onClick={addParticleCueAtPlayhead}>+ Cue At Playhead</button>
            {particleSorted.map((p) => (
              <button key={p.id} className={`studio2-item ${selectedId === p.id ? 'active' : ''}`} onClick={() => { setSelectedTrack('particles'); setSelectedId(p.id); setPlayheadMs(Number(p.atMs || 0)); }}>
                {p.arcanaId} @ {formatMs(p.atMs)}
              </button>
            ))}
          </div>

          <div className="studio2-group">
            <div className="studio2-group-head">Sound</div>
            <button className="studio2-mini" onClick={addSoundCueAtPlayhead}>+ Cue At Playhead</button>
            {soundSorted.map((s) => (
              <button key={s.id} className={`studio2-item ${selectedId === s.id ? 'active' : ''}`} onClick={() => { setSelectedTrack('sound'); setSelectedId(s.id); setPlayheadMs(Number(s.atMs || 0)); }}>
                {s.key} @ {formatMs(s.atMs)}
              </button>
            ))}
          </div>

          <div className="studio2-group">
            <div className="studio2-group-head">Templates</div>
            <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template name" />
            <button className="studio2-mini" onClick={saveTemplate}>Save Template</button>
            {templates.map((t) => (
              <div key={t.id} className="studio2-template-row">
                <button className="studio2-item" onClick={() => loadTemplate(t.id)}>{t.name}</button>
                <button className="studio2-mini danger" onClick={() => removeTemplate(t.id)}>x</button>
              </div>
            ))}
          </div>
        </aside>

        <section className="studio2-center">
          <div className="studio2-viewport-toolbar">
            <label>Scene ID<input value={project.id} onChange={(e) => setProject((p) => ({ ...p, id: e.target.value }))} /></label>
            <label>Duration<input type="number" value={project.duration} onChange={(e) => setProject((p) => ({ ...p, duration: clamp(Number(e.target.value || 0), 300, 60000) }))} /></label>
            <label>FPS<input type="number" value={project.fps} onChange={(e) => setProject((p) => ({ ...p, fps: clamp(Number(e.target.value || 60), 12, 240) }))} /></label>
            <label>FEN<input value={project.fen} onChange={(e) => setProject((p) => ({ ...p, fen: e.target.value }))} /></label>
            <button className={`studio2-mini ${showCameraGizmos ? '' : 'ghost'}`} onClick={() => setShowCameraGizmos((v) => !v)}>{showCameraGizmos ? 'Hide Camera Gizmos' : 'Show Camera Gizmos'}</button>
            <button className={`studio2-mini ${enableMotionFx ? '' : 'ghost'}`} onClick={() => setEnableMotionFx((v) => !v)}>{enableMotionFx ? 'Motion FX On' : 'Motion FX Off'}</button>
            <button className="studio2-mini ghost" onClick={resetVisualPreview}>Clear Preview FX</button>
          </div>

          <div className="studio2-toolbar-status">
            <span>Selected square: <strong>{selectedSquare}</strong></span>
            <span>Drag the ruler to scrub time and drag markers to retime them.</span>
            {boardPickHint ? <span className="studio2-pick-hint">{boardPickHint}</span> : null}
          </div>

          <div className="studio2-viewport">
            <Canvas shadows camera={{ position: [8, 10, 8], fov: 45 }}>
              <StudioBoardScene
                project={project}
                selectedSquare={selectedSquare}
                onSquareSelect={applyBoardSelection}
                showCameraGizmos={showCameraGizmos}
                cameraKeysSorted={cameraKeysSorted}
                actorPieces={actorPieces}
                effectsModule={effectsModule}
                activeVisualArcana={activeVisualArcana}
                visualHostResetKey={visualHostResetKey}
              />

              <CameraCutscene cutsceneTarget={cutsceneTarget} onCutsceneEnd={() => {}} myColor="white" controlsRef={controlsRef} />
              <CameraProbe controlsRef={controlsRef} onCameraState={setCameraLive} />
              <OrbitControls ref={controlsRef} makeDefault />
            </Canvas>
            <CutsceneOverlay ref={overlayRef} />

            <div className="studio2-camera-preview">
              <div className="studio2-camera-preview-head">
                <strong>Shot Preview</strong>
                <span>{previewCameraKey ? `${formatMs(previewCameraKey.atMs)} looking at ${previewCameraPose.square}` : 'No camera shot yet'}</span>
              </div>
              <div className="studio2-camera-preview-frame">
                <Canvas camera={{ position: previewCameraPose.position, fov: 45 }} dpr={[1, 1.5]}>
                  <PreviewCameraRig pose={previewCameraPose} />
                  <StudioBoardScene
                    project={project}
                    selectedSquare={selectedSquare}
                    onSquareSelect={null}
                    showCameraGizmos={false}
                    cameraKeysSorted={cameraKeysSorted}
                    actorPieces={actorPieces}
                    effectsModule={effectsModule}
                    activeVisualArcana={activeVisualArcana}
                    visualHostResetKey={visualHostResetKey}
                    interactive={false}
                  />
                </Canvas>
                <div className="studio2-camera-safe-frame" />
              </div>
            </div>
          </div>

          <div className="studio2-dopesheet">
            <div className="studio2-ds-head">
              <strong>Dope Sheet</strong>
              <span>{formatMs(playheadMs)} / {formatMs(project.duration)}</span>
              <button className="studio2-mini" onClick={() => setPlayheadMs(0)}>Start</button>
              <button className="studio2-mini" onClick={() => setPlayheadMs(project.duration)}>End</button>
              <button className="studio2-mini" onClick={() => setPlayheadMs((v) => clamp(v - 33, 0, project.duration))}>-33ms</button>
              <button className="studio2-mini" onClick={() => setPlayheadMs((v) => clamp(v + 33, 0, project.duration))}>+33ms</button>
              <button className="studio2-mini danger" onClick={deleteSelected} disabled={!selectedId}>Delete Selected</button>
            </div>

            <div className="studio2-ruler" onPointerDown={beginPlayheadDrag}>
              {Array.from({ length: 9 }, (_, idx) => {
                const pct = (idx / 8) * 100;
                const label = formatMs((project.duration / 8) * idx);
                return (
                  <div key={label} className="studio2-ruler-tick" style={{ left: `${pct}%` }}>
                    <span>{label}</span>
                  </div>
                );
              })}
              <div className="studio2-playhead studio2-playhead-ruler" style={{ left: `${playheadPct}%` }} />
            </div>

            {['camera', 'actors', 'particles', 'sound'].map((track) => (
              <div className="studio2-track" key={track}>
                <div className="studio2-track-label">{TRACK_TITLES[track]}</div>
                <div className="studio2-track-lane" onPointerDown={beginPlayheadDrag}>
                  {(timelineRows[track] || []).map((m) => (
                    <button
                      key={m.id}
                      className={`studio2-marker ${selectedId === m.id ? 'active' : ''}`}
                      style={{ left: `${(Number(m.atMs || 0) / Math.max(1, project.duration)) * 100}%` }}
                      title={`${m.label} @ ${formatMs(m.atMs)}`}
                      onPointerDown={(event) => beginMarkerDrag(event, track, m.id)}
                      onClick={() => { setSelectedTrack(track); setSelectedId(m.id); setPlayheadMs(Number(m.atMs || 0)); }}
                    >
                      {m.label}
                    </button>
                  ))}
                  <div className="studio2-playhead" style={{ left: `${playheadPct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="studio2-properties">
          <div className="studio2-panel-head">Properties</div>

          <section className="studio2-prop-block">
            <div className="studio2-section-head">
              <h3>How To Use The Studio</h3>
              <button className="studio2-mini ghost" onClick={() => setShowTutorial((v) => !v)}>{showTutorial ? 'Hide' : 'Show'}</button>
            </div>
            {showTutorial && (
              <div className="studio2-tutorial-copy">
                <p><strong>1. Scene:</strong> set the board FEN and anchor squares first. Anchors are reusable named squares for shots and particles.</p>
                <p><strong>2. Camera:</strong> add a camera key at the playhead, orbit the main viewport, then use Capture Current View. The inset Shot Preview shows the exact camera framing.</p>
                <p><strong>3. Actors:</strong> an actor is an animated preview chess piece. Base square is where it starts. Actor keyframes move that same piece later in the cutscene.</p>
                <p><strong>4. Particles:</strong> each particle cue is one VFX event. Use the board-pick buttons and square chips to place and edit values instead of typing raw JSON.</p>
                <p><strong>5. Timeline:</strong> drag the ruler to scrub and drag markers left or right to retime them. Numeric fields are still there when you need exact timing.</p>
                <p><strong>6. Export:</strong> when the preview looks correct, click Export To Game and paste the payload into the cutscene definitions.</p>
              </div>
            )}
          </section>

          <section className="studio2-prop-block">
            <h3>Import</h3>
            <div className="studio2-row">
              <select value={importCardId} onChange={(e) => setImportCardId(e.target.value)}>
                <option value="">(select a card)</option>
                {[...new Set([...CUTSCENE_CARD_IDS, ...allArcanaIds])].map((idValue) => (
                  <option key={idValue} value={idValue}>{idValue}</option>
                ))}
              </select>
              <button className="studio2-mini" onClick={() => importCard(importCardId)} disabled={!importCardId}>Import Card</button>
            </div>
          </section>

          {selectedCameraKey && (
            <section className="studio2-prop-block">
              <h3>Camera Key</h3>
              <label>Time (ms)<input type="number" value={selectedCameraKey.atMs} onChange={(e) => setProject((p) => ({ ...p, cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => ({ ...k, atMs: Number(e.target.value || 0) })) }))} /></label>
              <label>Anchor<select value={selectedCameraKey.anchor || ''} onChange={(e) => setProject((p) => ({ ...p, cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => ({ ...k, anchor: e.target.value })) }))}>{ANCHOR_OPTIONS.map((value) => <option key={value || 'none'} value={value}>{value || '(none)'}</option>)}</select></label>
              <label>Square Override<input value={selectedCameraKey.square || ''} onChange={(e) => setProject((p) => ({ ...p, cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => ({ ...k, square: e.target.value.toLowerCase() })) }))} /></label>
              <div className="studio2-grid2">
                <label>Zoom<input type="number" step="0.05" value={selectedCameraKey.zoom} onChange={(e) => setProject((p) => ({ ...p, cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => ({ ...k, zoom: Number(e.target.value || 1.8) })) }))} /></label>
                <label>LookAt Y<input type="number" step="0.01" value={selectedCameraKey.lookAtYOffset} onChange={(e) => setProject((p) => ({ ...p, cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => ({ ...k, lookAtYOffset: Number(e.target.value || 0) })) }))} /></label>
              </div>
              <div className="studio2-grid2">
                <label>Move<input type="number" value={selectedCameraKey.duration} onChange={(e) => setProject((p) => ({ ...p, cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => ({ ...k, duration: Number(e.target.value || 0) })) }))} /></label>
                <label>Hold<input type="number" value={selectedCameraKey.holdDuration} onChange={(e) => setProject((p) => ({ ...p, cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => ({ ...k, holdDuration: Number(e.target.value || 0) })) }))} /></label>
                <label>Return<input type="number" value={selectedCameraKey.returnDuration} onChange={(e) => setProject((p) => ({ ...p, cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => ({ ...k, returnDuration: Number(e.target.value || 0) })) }))} /></label>
              </div>
              <div className="studio2-grid2">
                <label>Easing<select value={selectedCameraKey.easing || 'easeOutCubic'} onChange={(e) => setProject((p) => ({ ...p, cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => ({ ...k, easing: e.target.value })) }))}>{EASING.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
                <label>Return Easing<select value={selectedCameraKey.returnEasing || 'easeInOutCubic'} onChange={(e) => setProject((p) => ({ ...p, cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => ({ ...k, returnEasing: e.target.value })) }))}>{EASING.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
              </div>
              <div className="studio2-grid3">
                {['x', 'y', 'z'].map((axis, idx) => (
                  <label key={axis}>Offset {axis.toUpperCase()}
                    <input
                      type="number"
                      step="0.1"
                      value={selectedCameraKey.offset?.[idx] ?? 0}
                      onChange={(e) => setProject((p) => ({
                        ...p,
                        cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => {
                          const next = [...(k.offset || [2, 3, 2])];
                          next[idx] = Number(e.target.value || 0);
                          return { ...k, offset: next };
                        }),
                      }))}
                    />
                  </label>
                ))}
              </div>
              <button className="studio2-mini" onClick={() => {
                const live = cameraLive.cameraPosition || [8, 10, 8];
                const sq = resolveSquare(project, selectedSquare, selectedCameraKey.square, selectedCameraKey.anchor);
                const [sx, sy, sz] = squareToPosition(sq);
                const nextOffset = [
                  Number((live[0] - sx).toFixed(2)),
                  Number((live[1] - (sy + Number(selectedCameraKey.lookAtYOffset || 0))).toFixed(2)),
                  Number((live[2] - sz).toFixed(2)),
                ];
                setProject((p) => ({ ...p, cameraKeys: replaceById(p.cameraKeys, selectedCameraKey.id, (k) => ({ ...k, offset: nextOffset })) }));
              }}>Capture Current View</button>
            </section>
          )}

          {selectedActor && (
            <section className="studio2-prop-block">
              <h3>Actor</h3>
              <div className="studio2-note">Actors are the chess pieces you animate in the cutscene preview. Set a base square, then add actor keyframes where that piece should move.</div>
              <label>Name<input value={selectedActor.name} onChange={(e) => setProject((p) => ({ ...p, actors: replaceById(p.actors, selectedActor.id, (a) => ({ ...a, name: e.target.value })) }))} /></label>
              <div className="studio2-grid2">
                <label>Piece Type<select value={selectedActor.type} onChange={(e) => setProject((p) => ({ ...p, actors: replaceById(p.actors, selectedActor.id, (a) => ({ ...a, type: e.target.value })) }))}>{['p', 'n', 'b', 'r', 'q', 'k'].map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                <label>Color<select value={selectedActor.isWhite ? 'w' : 'b'} onChange={(e) => setProject((p) => ({ ...p, actors: replaceById(p.actors, selectedActor.id, (a) => ({ ...a, isWhite: e.target.value === 'w' })) }))}><option value="w">White</option><option value="b">Black</option></select></label>
              </div>
              <label>Base Square<input value={selectedActor.baseSquare} onChange={(e) => setProject((p) => ({ ...p, actors: replaceById(p.actors, selectedActor.id, (a) => ({ ...a, baseSquare: e.target.value.toLowerCase() })) }))} /></label>
              <div className="studio2-row">
                <button className="studio2-mini" onClick={() => setProject((p) => ({ ...p, actors: replaceById(p.actors, selectedActor.id, (a) => ({ ...a, baseSquare: selectedSquare })) }))}>Use Selected Square</button>
                <button className={`studio2-mini ${boardPickMode === 'actor.baseSquare' ? '' : 'ghost'}`} onClick={() => setBoardPickMode(boardPickMode === 'actor.baseSquare' ? null : 'actor.baseSquare')}>{boardPickMode === 'actor.baseSquare' ? 'Cancel Board Pick' : 'Pick On Board'}</button>
              </div>
              <button className="studio2-mini" onClick={() => addActorKeyAtPlayhead(selectedActor.id)}>Add Key At Playhead</button>
            </section>
          )}

          {selectedActorKey && (
            <section className="studio2-prop-block">
              <h3>Actor Keyframe</h3>
              <label>Time (ms)<input type="number" value={selectedActorKey.atMs} onChange={(e) => setProject((p) => ({ ...p, actorKeys: replaceById(p.actorKeys, selectedActorKey.id, (k) => ({ ...k, atMs: Number(e.target.value || 0) })) }))} /></label>
              <label>Square<input value={selectedActorKey.square} onChange={(e) => setProject((p) => ({ ...p, actorKeys: replaceById(p.actorKeys, selectedActorKey.id, (k) => ({ ...k, square: e.target.value.toLowerCase() })) }))} /></label>
              <div className="studio2-row">
                <button className="studio2-mini" onClick={() => setProject((p) => ({ ...p, actorKeys: replaceById(p.actorKeys, selectedActorKey.id, (k) => ({ ...k, square: selectedSquare })) }))}>Use Selected Square</button>
                <button className={`studio2-mini ${boardPickMode === 'actor.keySquare' ? '' : 'ghost'}`} onClick={() => setBoardPickMode(boardPickMode === 'actor.keySquare' ? null : 'actor.keySquare')}>{boardPickMode === 'actor.keySquare' ? 'Cancel Board Pick' : 'Pick On Board'}</button>
              </div>
              <div className="studio2-grid2">
                <label>Profile<select value={selectedActorKey.profile || 'none'} onChange={(e) => setProject((p) => ({ ...p, actorKeys: replaceById(p.actorKeys, selectedActorKey.id, (k) => ({ ...k, profile: e.target.value })) }))}>{MOTION_PROFILES.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
                <label>Easing<select value={selectedActorKey.easing || 'linear'} onChange={(e) => setProject((p) => ({ ...p, actorKeys: replaceById(p.actorKeys, selectedActorKey.id, (k) => ({ ...k, easing: e.target.value })) }))}>{EASING.map((m) => <option key={m} value={m}>{m}</option>)}</select></label>
              </div>
              <label>Intensity<input type="number" step="0.01" value={selectedActorKey.intensity || 0} onChange={(e) => setProject((p) => ({ ...p, actorKeys: replaceById(p.actorKeys, selectedActorKey.id, (k) => ({ ...k, intensity: Number(e.target.value || 0) })) }))} /></label>
            </section>
          )}

          {selectedParticleCue && (
            <section className="studio2-prop-block">
              <h3>Particle Cue</h3>
              <label>Time (ms)<input type="number" value={selectedParticleCue.atMs} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, atMs: Number(e.target.value || 0) })) }))} /></label>
              <label>Preset<select value={selectedParticleCue.arcanaId} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, arcanaId: e.target.value })) }))}>{PARTICLE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
              <div className="studio2-grid2">
                <label>Anchor<select value={selectedParticleCue.anchor || ''} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, anchor: e.target.value })) }))}>{ANCHOR_OPTIONS.map((value) => <option key={value || 'none'} value={value}>{value || '(none)'}</option>)}</select></label>
                <label>Square Override<input value={selectedParticleCue.square || ''} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, square: e.target.value.toLowerCase() })) }))} /></label>
              </div>
              <div className="studio2-row">
                <button className="studio2-mini" onClick={() => updateSelectedParticleCue((cue) => ({ ...cue, square: selectedSquare }))}>Use Selected Square</button>
                <button className={`studio2-mini ${boardPickMode === 'particle.square' ? '' : 'ghost'}`} onClick={() => setBoardPickMode(boardPickMode === 'particle.square' ? null : 'particle.square')}>{boardPickMode === 'particle.square' ? 'Cancel Board Pick' : 'Pick Cue Square'}</button>
              </div>

              <label>Clear After (ms)</label>
              <div className="studio2-slider-row">
                <input type="range" min={150} max={5000} step={50} value={selectedParticleCue.clearAfterMs || 1200} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, clearAfterMs: Number(e.target.value || 0) })) }))} />
                <input type="number" value={selectedParticleCue.clearAfterMs || 1200} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, clearAfterMs: Number(e.target.value || 0) })) }))} />
              </div>

              {selectedParticleCue.arcanaId === 'edgerunner_overdrive' && (
                <>
                  <label>Target Square<input value={selectedParticleCue.editor?.targetSquare || ''} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, editor: { ...(k.editor || {}), targetSquare: e.target.value.toLowerCase() } })) }))} /></label>
                  <div className="studio2-row">
                    <button className="studio2-mini" onClick={() => setParticleEditorField('targetSquare', selectedSquare)}>Use Selected Square</button>
                    <button className={`studio2-mini ${boardPickMode === 'particle.targetSquare' ? '' : 'ghost'}`} onClick={() => setBoardPickMode(boardPickMode === 'particle.targetSquare' ? null : 'particle.targetSquare')}>{boardPickMode === 'particle.targetSquare' ? 'Cancel Board Pick' : 'Pick On Board'}</button>
                  </div>
                  <label>Dash Path (csv)<input value={selectedParticleCue.editor?.dashPathCsv || ''} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, editor: { ...(k.editor || {}), dashPathCsv: e.target.value.toLowerCase() } })) }))} /></label>
                  <div className="studio2-chip-row">
                    {dashPathSquares.map((sq, idx) => (
                      <button key={`${sq}-${idx}`} className="studio2-chip" onClick={() => setParticleEditorField('dashPathCsv', dashPathSquares.filter((_, i) => i !== idx).join(','))}>{sq} x</button>
                    ))}
                  </div>
                  <div className="studio2-row">
                    <button className="studio2-mini" onClick={() => setParticleEditorField('dashPathCsv', [...dashPathSquares, selectedSquare].join(','))}>Add Selected Square</button>
                    <button className={`studio2-mini ${boardPickMode === 'particle.dashPath' ? '' : 'ghost'}`} onClick={() => setBoardPickMode(boardPickMode === 'particle.dashPath' ? null : 'particle.dashPath')}>{boardPickMode === 'particle.dashPath' ? 'Cancel Board Pick' : 'Pick Next Dash Step'}</button>
                    <button className="studio2-mini ghost" onClick={() => setParticleEditorField('dashPathCsv', '')}>Clear Path</button>
                  </div>
                  <div className="studio2-grid2">
                    <label>Piece Type<select value={selectedParticleCue.editor?.pieceType || 'n'} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, editor: { ...(k.editor || {}), pieceType: e.target.value } })) }))}>{['p', 'n', 'b', 'r', 'q', 'k'].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
                    <label>Piece Color<select value={selectedParticleCue.editor?.pieceColor || 'w'} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, editor: { ...(k.editor || {}), pieceColor: e.target.value } })) }))}><option value="w">White</option><option value="b">Black</option></select></label>
                  </div>
                </>
              )}

              {selectedParticleCue.arcanaId === 'breaking_point' && (
                <>
                  <label>Shattered Square<input value={selectedParticleCue.editor?.shatteredSquare || ''} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, editor: { ...(k.editor || {}), shatteredSquare: e.target.value.toLowerCase() } })) }))} /></label>
                  <div className="studio2-row">
                    <button className="studio2-mini" onClick={() => setParticleEditorField('shatteredSquare', selectedSquare)}>Use Selected Square</button>
                    <button className={`studio2-mini ${boardPickMode === 'particle.shatteredSquare' ? '' : 'ghost'}`} onClick={() => setBoardPickMode(boardPickMode === 'particle.shatteredSquare' ? null : 'particle.shatteredSquare')}>{boardPickMode === 'particle.shatteredSquare' ? 'Cancel Board Pick' : 'Pick On Board'}</button>
                  </div>
                  <label>Displaced JSON<textarea value={selectedParticleCue.editor?.displacedJson || '[]'} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, editor: { ...(k.editor || {}), displacedJson: e.target.value } })) }))} /></label>
                  <div className="studio2-chip-row">
                    {displacedSquares.map((sq, idx) => (
                      <button key={`${idx}-${typeof sq === 'object' ? `${sq?.from || 'from'}-${sq?.to || 'to'}` : String(sq)}`} className="studio2-chip" onClick={() => setParticleEditorField('displacedJson', stringifySquares(displacedSquares.filter((_, i) => i !== idx)))}>{sq?.from && sq?.to ? `${sq.from}->${sq.to}` : String(sq)} x</button>
                    ))}
                  </div>
                  <div className="studio2-row">
                    <button className="studio2-mini" onClick={() => setParticleEditorField('displacedJson', stringifySquares([...displacedSquares, { from: selectedParticleCue.editor?.shatteredSquare || selectedParticleCue.square || selectedSquare, to: selectedSquare }]))}>Add Selected Square</button>
                    <button className={`studio2-mini ${boardPickMode === 'particle.displaced' ? '' : 'ghost'}`} onClick={() => setBoardPickMode(boardPickMode === 'particle.displaced' ? null : 'particle.displaced')}>{boardPickMode === 'particle.displaced' ? 'Cancel Board Pick' : 'Pick Displaced Square'}</button>
                    <button className="studio2-mini ghost" onClick={() => setParticleEditorField('displacedJson', '[]')}>Clear List</button>
                  </div>
                </>
              )}

              <label>Advanced Params JSON<textarea value={selectedParticleCue.paramsJson || '{}'} onChange={(e) => setProject((p) => ({ ...p, particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, paramsJson: e.target.value })) }))} /></label>
              <div className="studio2-row">
                <button className="studio2-mini" onClick={() => {
                  const params = buildParticleParams(selectedParticleCue, selectedSquare || 'd4');
                  setProject((p) => ({
                    ...p,
                    particleCues: replaceById(p.particleCues, selectedParticleCue.id, (k) => ({ ...k, paramsJson: JSON.stringify(params, null, 2) })),
                  }));
                }}>Sync JSON</button>
                <button className="studio2-mini" onClick={previewSelectedParticleCue}>Preview Cue</button>
              </div>
            </section>
          )}

          {selectedSoundCue && (
            <section className="studio2-prop-block">
              <h3>Sound Cue</h3>
              <label>Time (ms)<input type="number" value={selectedSoundCue.atMs} onChange={(e) => setProject((p) => ({ ...p, soundCues: replaceById(p.soundCues, selectedSoundCue.id, (k) => ({ ...k, atMs: Number(e.target.value || 0) })) }))} /></label>
              <label>Sound Key<input value={selectedSoundCue.key} onChange={(e) => setProject((p) => ({ ...p, soundCues: replaceById(p.soundCues, selectedSoundCue.id, (k) => ({ ...k, key: e.target.value })) }))} /></label>
              <button className="studio2-mini" onClick={() => { try { soundManager.play(selectedSoundCue.key); } catch {} }}>Test Sound</button>
            </section>
          )}

          {!selectedCameraKey && !selectedActor && !selectedActorKey && !selectedParticleCue && !selectedSoundCue && (
            <section className="studio2-prop-block">
              <h3>Scene Properties</h3>
              <div className="studio2-note">Use anchors when several shots or particles should point at the same board square. This makes the scene easier to edit and export.</div>
              <label>Target Anchor<input value={project.anchors.target || ''} onChange={(e) => setProject((p) => ({ ...p, anchors: { ...p.anchors, target: e.target.value.toLowerCase() } }))} /></label>
              <label>Dash 1<input value={project.anchors.dash1 || ''} onChange={(e) => setProject((p) => ({ ...p, anchors: { ...p.anchors, dash1: e.target.value.toLowerCase() } }))} /></label>
              <label>Dash 2<input value={project.anchors.dash2 || ''} onChange={(e) => setProject((p) => ({ ...p, anchors: { ...p.anchors, dash2: e.target.value.toLowerCase() } }))} /></label>
              <label>Dash 3<input value={project.anchors.dash3 || ''} onChange={(e) => setProject((p) => ({ ...p, anchors: { ...p.anchors, dash3: e.target.value.toLowerCase() } }))} /></label>
              <label>Displaced 1<input value={project.anchors.displaced1 || ''} onChange={(e) => setProject((p) => ({ ...p, anchors: { ...p.anchors, displaced1: e.target.value.toLowerCase() } }))} /></label>
              <label>Displaced 2<input value={project.anchors.displaced2 || ''} onChange={(e) => setProject((p) => ({ ...p, anchors: { ...p.anchors, displaced2: e.target.value.toLowerCase() } }))} /></label>
              <div className="studio2-note">If you are starting from scratch: add one camera key, one actor, one particle cue, then drag their markers on the timeline until the timing feels right.</div>
              <div className="studio2-status">{status}</div>
            </section>
          )}

          <section className="studio2-prop-block">
            <h3>Export Payload</h3>
            <textarea readOnly value={exportText} placeholder="Click Export To Game" />
          </section>
        </aside>
      </div>
    </div>
  );
}
