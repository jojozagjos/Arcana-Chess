import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Line } from '@react-three/drei';
import * as THREE from 'three';
import { ChessPiece } from './ChessPiece.jsx';
import { ArcanaVisualHost } from '../game/arcana/ArcanaVisualHost.jsx';
import { CameraCutscene, useCameraCutscene } from '../game/arcana/CameraCutscene.jsx';
import CutsceneOverlay from './CutsceneOverlay.jsx';
import { soundManager } from '../game/soundManager.js';
import { getCutsceneConfig } from '../game/arcana/cutsceneDefinitions.js';
import { ARCANA_DEFINITIONS } from '../game/arcanaDefinitions.js';
import './styles/CutsceneStudio.css';

const STORAGE_KEY = 'arcana.cutsceneStudio.templates.v1';
const TUTORIAL_DISMISS_KEY = 'arcana.cutsceneStudio.tutorial.dismissed';
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

const ANCHOR_KEYS = ['target', 'dash1', 'dash2', 'dash3', 'displaced1', 'displaced2'];
const STUDIO_TABS = ['import', 'camera', 'sound', 'vfx', 'pieces', 'templates'];

function id(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function toColorCode(isWhite) {
  return isWhite ? 'w' : 'b';
}

function parseFenPieces(fen) {
  if (!fen) return [];
  const chess = new Chess();
  chess.load(fen);
  const out = [];
  const files = 'abcdefgh';
  for (let rank = 8; rank >= 1; rank--) {
    for (let file = 0; file < 8; file++) {
      const sq = `${files[file]}${rank}`;
      const p = chess.get(sq);
      if (!p) continue;
      const x = file - 3.5;
      const z = 8 - rank - 3.5;
      out.push({
        id: `${sq}-${p.type}-${p.color}`,
        type: p.type,
        isWhite: p.color === 'w',
        square: sq,
        position: [x, 0.15, z],
      });
    }
  }
  return out;
}

function squareToPosition(square) {
  if (!square || typeof square !== 'string' || square.length !== 2) return [0, 0.15, 0];
  const file = 'abcdefgh'.indexOf(square[0]);
  const rank = parseInt(square[1], 10);
  if (file < 0 || rank < 1 || rank > 8) return [0, 0.15, 0];
  return [file - 3.5, 0.15, 8 - rank - 3.5];
}

function msLabel(v) {
  return `${Math.round(v)}ms`;
}

function prettyJson(obj) {
  return JSON.stringify(obj, null, 2);
}

function slugToTitle(s) {
  return String(s || '')
    .split('_')
    .filter(Boolean)
    .map((x) => x.charAt(0).toUpperCase() + x.slice(1))
    .join(' ');
}

function defaultStudioProject() {
  return {
    id: 'custom_cutscene',
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
    camera: {
      shots: [
        {
          id: id('shot'),
          anchor: 'target',
          square: '',
          zoom: 2.1,
          duration: 320,
          holdDuration: 340,
          returnDuration: 280,
          offset: [2.2, 2.7, 1.6],
          lookAtYOffset: 0.32,
        },
        {
          id: id('shot'),
          anchor: 'dash1',
          square: '',
          zoom: 2.35,
          duration: 310,
          holdDuration: 300,
          returnDuration: 260,
          offset: [-1.9, 2.6, -1.4],
          lookAtYOffset: 0.26,
        },
        {
          id: id('shot'),
          anchor: 'dash2',
          square: '',
          zoom: 2.5,
          duration: 290,
          holdDuration: 260,
          returnDuration: 260,
          offset: [0.2, 3.3, 1.9],
          lookAtYOffset: 0.22,
        },
      ],
    },
    soundCues: [
      { id: id('snd'), atMs: 0, key: 'arcana:edgerunner_overdrive_activation' },
      { id: id('snd'), atMs: 700, key: 'arcana:edgerunner_overdrive_rush' },
      { id: id('snd'), atMs: 2200, key: 'arcana:edgerunner_overdrive_release' },
    ],
    particleCues: [
      {
        id: id('vfx'),
        atMs: 0,
        arcanaId: 'edgerunner_overdrive',
        square: 'd4',
        paramsJson: '{"dashPath":["e5","f6","g7"],"pieceType":"n","pieceColor":"w"}',
        clearAfterMs: 2000,
      },
      {
        id: id('vfx'),
        atMs: 1300,
        arcanaId: 'breaking_point',
        square: 'f6',
        paramsJson: '{"displaced":[{"from":"f6","to":"e6"},{"from":"g7","to":"f7"}]}'
        ,clearAfterMs: 1700,
      },
    ],
    pieceActors: [
      {
        id: id('actor'),
        label: 'Attacker',
        type: 'n',
        isWhite: true,
        square: 'd4',
        defaultProfile: 'none',
        defaultIntensity: 0.18,
      },
      {
        id: id('actor'),
        label: 'Defender',
        type: 'b',
        isWhite: false,
        square: 'f6',
        defaultProfile: 'none',
        defaultIntensity: 0.14,
      },
    ],
    pieceKeyframes: [
      { id: id('kf'), actorId: '', atMs: 0, square: 'd4', profile: 'none', intensity: 0 },
      { id: id('kf'), actorId: '', atMs: 700, square: 'e5', profile: 'none', intensity: 0 },
      { id: id('kf'), actorId: '', atMs: 1200, square: 'f6', profile: 'none', intensity: 0 },
      { id: id('kf'), actorId: '', atMs: 1700, square: 'g7', profile: 'none', intensity: 0 },
      { id: id('kf'), actorId: '', atMs: 900, square: 'f6', profile: 'none', intensity: 0 },
      { id: id('kf'), actorId: '', atMs: 1500, square: 'e6', profile: 'none', intensity: 0 },
    ],
  };
}

function SceneTap({ onCameraState, controlsRef }) {
  return (
    <CameraProbe onCameraState={onCameraState} controlsRef={controlsRef} />
  );
}

function CameraProbe({ onCameraState, controlsRef }) {
  const sentRef = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      const camera = controlsRef.current?.object;
      if (!camera) return;
      const now = Date.now();
      if (now - sentRef.current < 120) return;
      sentRef.current = now;
      const target = controlsRef.current?.target;
      onCameraState?.({
        cameraPosition: camera.position.toArray(),
        target: target ? target.toArray() : [0, 0, 0],
      });
    }, 120);
    return () => clearInterval(t);
  }, [controlsRef, onCameraState]);
  return null;
}

function ShotCameraGizmo({ index, shot, lookSquare }) {
  const shotData = useMemo(() => {
    const [sx, sy, sz] = squareToPosition(lookSquare);
    const zoom = Number(shot?.zoom || 1.8);
    const offset = Array.isArray(shot?.offset) && shot.offset.length === 3 ? shot.offset : [2, 3, 2];
    const lookAtY = sy + Number(shot?.lookAtYOffset || 0);
    const cameraPos = new THREE.Vector3(
      sx + Number(offset[0]) / zoom,
      sy + Number(offset[1]) / zoom,
      sz + Number(offset[2]) / zoom,
    );
    const lookAt = new THREE.Vector3(sx, lookAtY, sz);
    const dir = lookAt.clone().sub(cameraPos).normalize();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    const conePos = cameraPos.clone().add(dir.clone().multiplyScalar(0.34));
    return {
      cameraPos: cameraPos.toArray(),
      lookAt: lookAt.toArray(),
      conePos: conePos.toArray(),
      quaternion: quat,
      color: `hsl(${(index * 49) % 360}, 88%, 64%)`,
    };
  }, [index, lookSquare, shot]);

  return (
    <group>
      <Line points={[shotData.cameraPos, shotData.lookAt]} color={shotData.color} transparent opacity={0.72} lineWidth={1} />
      <mesh position={shotData.cameraPos}>
        <boxGeometry args={[0.22, 0.14, 0.14]} />
        <meshStandardMaterial color={shotData.color} emissive={shotData.color} emissiveIntensity={0.55} />
      </mesh>
      <mesh position={shotData.conePos} quaternion={shotData.quaternion}>
        <coneGeometry args={[0.08, 0.22, 12]} />
        <meshStandardMaterial color={shotData.color} emissive={shotData.color} emissiveIntensity={0.34} transparent opacity={0.82} />
      </mesh>
    </group>
  );
}

function CameraRigGizmos({ shots, resolveSquare, visible }) {
  if (!visible) return null;
  if (!Array.isArray(shots) || shots.length === 0) return null;

  return (
    <group>
      {shots.map((shot, idx) => {
        const lookSquare = resolveSquare(shot?.square, shot?.anchor);
        return (
          <ShotCameraGizmo
            key={shot?.id || `shot-gizmo-${idx}`}
            index={idx}
            shot={shot}
            lookSquare={lookSquare}
          />
        );
      })}
    </group>
  );
}

export function CutsceneStudio({ onBack }) {
  const controlsRef = useRef();
  const overlayRef = useRef();
  const { cutsceneTarget, triggerCutscene, clearCutscene } = useCameraCutscene();
  const eventTimersRef = useRef([]);
  const rafRef = useRef(null);

  const [effectsModule, setEffectsModule] = useState(null);
  const [project, setProject] = useState(() => {
    const p = defaultStudioProject();
    if (p.pieceActors.length > 0 && p.pieceKeyframes.length > 0) {
      p.pieceKeyframes[0].actorId = p.pieceActors[0].id;
      p.pieceKeyframes[1].actorId = p.pieceActors[0].id;
      p.pieceKeyframes[2].actorId = p.pieceActors[0].id;
      p.pieceKeyframes[3].actorId = p.pieceActors[0].id;
      p.pieceKeyframes[4].actorId = p.pieceActors[1].id;
      p.pieceKeyframes[5].actorId = p.pieceActors[1].id;
    }
    return p;
  });

  const [selectedSquare, setSelectedSquare] = useState('d4');
  const [picker, setPicker] = useState(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [activeVisualArcana, setActiveVisualArcana] = useState(null);
  const [templateName, setTemplateName] = useState('My Cutscene');
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [clipboardExport, setClipboardExport] = useState('');
  const [cameraLive, setCameraLive] = useState({ cameraPosition: [8, 10, 8], target: [0, 0, 0] });
  const [livePreviewSquare, setLivePreviewSquare] = useState('d4');
  const [activeTab, setActiveTab] = useState('import');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false);
  const [showCameraGizmos, setShowCameraGizmos] = useState(true);
  const [importCardId, setImportCardId] = useState('breaking_point');
  const [showTutorial, setShowTutorial] = useState(() => {
    try {
      return localStorage.getItem(TUTORIAL_DISMISS_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [selectedActorId, setSelectedActorId] = useState('');
  const [enableMotionFx, setEnableMotionFx] = useState(false);

  const allArcanaIds = useMemo(() => {
    return (ARCANA_DEFINITIONS || [])
      .map((a) => a?.id)
      .filter(Boolean)
      .sort((a, b) => String(a).localeCompare(String(b)));
  }, []);

  useEffect(() => {
    import('../game/arcana/arcanaVisuals.jsx')
      .then((m) => setEffectsModule(m))
      .catch(() => setEffectsModule({}));
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setSavedTemplates(parsed);
    } catch {
      setSavedTemplates([]);
    }
  }, []);

  useEffect(() => {
    if (!selectedActorId && project.pieceActors[0]?.id) {
      setSelectedActorId(project.pieceActors[0].id);
    }
    if (selectedActorId && !project.pieceActors.some((a) => a.id === selectedActorId)) {
      setSelectedActorId(project.pieceActors[0]?.id || '');
    }
  }, [project.pieceActors, selectedActorId]);

  const boardFallbackPieces = useMemo(() => parseFenPieces(project.fen), [project.fen]);

  const sortedKeyframes = useMemo(() => {
    return [...project.pieceKeyframes].sort((a, b) => a.atMs - b.atMs);
  }, [project.pieceKeyframes]);

  const actorStateAtTime = useMemo(() => {
    const byActor = new Map();
    for (const actor of project.pieceActors) {
      byActor.set(actor.id, {
        square: actor.square,
        profile: actor.defaultProfile || 'none',
        intensity: Number(actor.defaultIntensity || 0.14),
      });
    }

    for (const kf of sortedKeyframes) {
      if (!kf.actorId || kf.atMs > currentMs) continue;
      if (!byActor.has(kf.actorId)) continue;
      byActor.set(kf.actorId, {
        square: kf.square || byActor.get(kf.actorId).square,
        profile: kf.profile || byActor.get(kf.actorId).profile,
        intensity: Number(kf.intensity || byActor.get(kf.actorId).intensity),
      });
    }
    return byActor;
  }, [project.pieceActors, sortedKeyframes, currentMs]);

  const actorAnimationMeta = useMemo(() => {
    const byActor = new Map();
    for (const actor of project.pieceActors) {
      byActor.set(actor.id, { hasAnimation: false, firstKeyframeMs: Number.POSITIVE_INFINITY });
    }
    for (const kf of sortedKeyframes) {
      if (!kf?.actorId || !byActor.has(kf.actorId)) continue;
      const prev = byActor.get(kf.actorId);
      byActor.set(kf.actorId, {
        hasAnimation: true,
        firstKeyframeMs: Math.min(prev.firstKeyframeMs, Number(kf.atMs || 0)),
      });
    }
    return byActor;
  }, [project.pieceActors, sortedKeyframes]);

  const previewPieces = useMemo(() => {
    const actors = project.pieceActors.map((actor) => {
      const animMeta = actorAnimationMeta.get(actor.id) || { hasAnimation: false, firstKeyframeMs: Number.POSITIVE_INFINITY };
      const state = actorStateAtTime.get(actor.id) || {
        square: actor.square,
        profile: actor.defaultProfile || 'none',
        intensity: Number(actor.defaultIntensity || 0.14),
      };
      const [x, y, z] = squareToPosition(state.square);
      const hasMotionProfile = !!state.profile && state.profile !== 'none';
      const shouldAnimate = enableMotionFx && hasMotionProfile && animMeta.hasAnimation && currentMs >= animMeta.firstKeyframeMs;
      return {
        id: actor.id,
        type: actor.type,
        isWhite: !!actor.isWhite,
        square: state.square,
        position: [x, y, z],
        motion: shouldAnimate
          ? {
              active: true,
              profile: state.profile,
              intensity: Number(state.intensity || 0.12),
              phase: actor.id.length * 7,
            }
          : null,
      };
    });

    if (actors.length > 0) return actors;
    return boardFallbackPieces.map((p) => ({
      id: p.id,
      type: p.type,
      isWhite: p.isWhite,
      square: p.square,
      position: p.position,
      motion: null,
    }));
  }, [project.pieceActors, actorStateAtTime, actorAnimationMeta, boardFallbackPieces, currentMs]);

  const totalTimelineMs = useMemo(() => {
    const cameraTotal = project.camera.shots.reduce(
      (acc, s) => acc + Number(s.duration || 0) + Number(s.holdDuration || 0) + Number(s.returnDuration || 0),
      0,
    );
    const cueMax = Math.max(
      0,
      ...project.soundCues.map((c) => Number(c.atMs || 0)),
      ...project.particleCues.map((c) => Number(c.atMs || 0) + Number(c.clearAfterMs || 1200)),
      ...project.pieceKeyframes.map((k) => Number(k.atMs || 0)),
    );
    const explicit = Number(project.duration || 0);
    return Math.max(explicit, cameraTotal, cueMax, 1200);
  }, [project]);

  useEffect(() => {
    setProject((prev) => {
      if (Number(prev.duration || 0) === totalTimelineMs) return prev;
      return { ...prev, duration: totalTimelineMs };
    });
  }, [totalTimelineMs]);

  const clearAllTimers = () => {
    eventTimersRef.current.forEach((t) => clearTimeout(t));
    eventTimersRef.current = [];
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const stopPlayback = () => {
    clearAllTimers();
    clearCutscene();
    setIsPlaying(false);
    setActiveVisualArcana(null);
    setStatus('Playback stopped');
  };

  useEffect(() => {
    return () => {
      clearAllTimers();
    };
  }, []);

  const resolveSquare = (square, anchor) => {
    if (square) return square;
    if (anchor && project.anchors[anchor]) return project.anchors[anchor];
    return project.anchors.target || selectedSquare || 'd4';
  };

  const cameraBeats = useMemo(() => {
    const beats = [];
    let acc = 0;
    const shots = project.camera.shots || [];
    for (const shot of shots) {
      beats.push(acc);
      acc += Number(shot.duration || 0) + Number(shot.holdDuration || 0) + Number(shot.returnDuration || 0);
    }
    return beats;
  }, [project.camera.shots]);

  const playProject = () => {
    stopPlayback();
    const duration = Number(project.duration || 3000);
    setStatus('Playing timeline');
    setIsPlaying(true);
    setCurrentMs(0);

    let cameraDelay = 0;
    const shots = project.camera.shots || [];
    shots.forEach((shot, idx) => {
      const timer = setTimeout(() => {
        const shotSquare = resolveSquare(shot.square, shot.anchor);
        triggerCutscene(shotSquare, {
          zoom: Number(shot.zoom || 1.8),
          duration: Number(shot.duration || 300),
          holdDuration: Number(shot.holdDuration || 240),
          returnDuration: Number(shot.returnDuration || 250),
          offset: [
            Number(shot.offset?.[0] || 2),
            Number(shot.offset?.[1] || 3),
            Number(shot.offset?.[2] || 2),
          ],
          lookAtYOffset: Number(shot.lookAtYOffset || 0.2),
          sequenceStart: idx === 0,
          sequenceEnd: idx === shots.length - 1,
          holdPosition: idx !== shots.length - 1,
        });
      }, cameraDelay);
      eventTimersRef.current.push(timer);
      cameraDelay += Number(shot.duration || 0) + Number(shot.holdDuration || 0) + Number(shot.returnDuration || 0);
    });

    for (const cue of project.soundCues) {
      const timer = setTimeout(() => {
        if (cue.key) {
          try {
            soundManager.play(cue.key);
          } catch {
            setStatus(`Sound key failed: ${cue.key}`);
          }
        }
      }, Number(cue.atMs || 0));
      eventTimersRef.current.push(timer);
    }

    for (const cue of project.particleCues) {
      const timer = setTimeout(() => {
        let params = {};
        try {
          params = cue.paramsJson ? JSON.parse(cue.paramsJson) : {};
        } catch {
          params = {};
        }
        const square = resolveSquare(cue.square, cue.anchor);
        const merged = {
          ...params,
          square,
          targetSquare: params.targetSquare || square,
          beatTimingsMs: cameraBeats,
          syncDurationMs: duration,
        };

        setActiveVisualArcana({ arcanaId: cue.arcanaId || 'breaking_point', params: merged });
        const clearTimer = setTimeout(() => setActiveVisualArcana(null), Number(cue.clearAfterMs || 1200));
        eventTimersRef.current.push(clearTimer);
      }, Number(cue.atMs || 0));
      eventTimersRef.current.push(timer);
    }

    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      if (elapsed >= duration) {
        setCurrentMs(duration);
        setIsPlaying(false);
        setStatus('Playback complete');
        return;
      }
      setCurrentMs(elapsed);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    const doneTimer = setTimeout(() => {
      setIsPlaying(false);
      setStatus('Playback complete');
      clearCutscene();
    }, duration + 80);
    eventTimersRef.current.push(doneTimer);
  };

  const previewShot = (shot, index) => {
    const square = resolveSquare(shot.square, shot.anchor);
    triggerCutscene(square, {
      zoom: Number(shot.zoom || 2),
      duration: Number(shot.duration || 320),
      holdDuration: Number(shot.holdDuration || 280),
      returnDuration: Number(shot.returnDuration || 260),
      offset: [
        Number(shot.offset?.[0] || 2),
        Number(shot.offset?.[1] || 3),
        Number(shot.offset?.[2] || 2),
      ],
      lookAtYOffset: Number(shot.lookAtYOffset || 0.2),
      sequenceStart: index === 0,
      sequenceEnd: true,
      holdPosition: false,
    });
  };

  const applyPickedSquare = (square) => {
    if (!picker) {
      setSelectedSquare(square);
      return;
    }

    setProject((prev) => {
      const next = { ...prev };
      if (picker.kind === 'anchor') {
        next.anchors = { ...next.anchors, [picker.anchorKey]: square };
      } else if (picker.kind === 'shotSquare') {
        next.camera = {
          ...next.camera,
          shots: next.camera.shots.map((s) => (s.id === picker.id ? { ...s, square } : s)),
        };
      } else if (picker.kind === 'particleSquare') {
        next.particleCues = next.particleCues.map((c) => (c.id === picker.id ? { ...c, square } : c));
      } else if (picker.kind === 'pieceBase') {
        next.pieceActors = next.pieceActors.map((a) => (a.id === picker.id ? { ...a, square } : a));
      } else if (picker.kind === 'pieceKeyframeSquare') {
        next.pieceKeyframes = next.pieceKeyframes.map((k) => (k.id === picker.id ? { ...k, square } : k));
      }
      return next;
    });

    setSelectedSquare(square);
    setPicker(null);
  };

  const captureCurrentViewToShot = (shotId) => {
    const shot = project.camera.shots.find((s) => s.id === shotId);
    if (!shot) return;
    const lookSquare = resolveSquare(shot.square, shot.anchor);
    const [sx, sy, sz] = squareToPosition(lookSquare);
    const cp = cameraLive.cameraPosition || [8, 10, 8];
    const offset = [
      Number((cp[0] - sx).toFixed(2)),
      Number((cp[1] - (sy + (shot.lookAtYOffset || 0))).toFixed(2)),
      Number((cp[2] - sz).toFixed(2)),
    ];
    setProject((prev) => ({
      ...prev,
      camera: {
        ...prev.camera,
        shots: prev.camera.shots.map((s) => (s.id === shotId ? { ...s, offset } : s)),
      },
    }));
    setStatus(`Captured current camera into shot offset for ${lookSquare}`);
  };

  const addCameraShot = () => {
    setProject((prev) => ({
      ...prev,
      camera: {
        ...prev.camera,
        shots: [
          ...prev.camera.shots,
          {
            id: id('shot'),
            anchor: 'target',
            square: '',
            zoom: 2,
            duration: 320,
            holdDuration: 280,
            returnDuration: 260,
            offset: [2, 2.8, 1.8],
            lookAtYOffset: 0.22,
          },
        ],
      },
    }));
  };

  const addSoundCue = () => {
    setProject((prev) => ({
      ...prev,
      soundCues: [...prev.soundCues, { id: id('snd'), atMs: 0, key: 'arcana:impact' }],
    }));
  };

  const addParticleCue = () => {
    setProject((prev) => ({
      ...prev,
      particleCues: [
        ...prev.particleCues,
        {
          id: id('vfx'),
          atMs: 0,
          arcanaId: 'breaking_point',
          square: prev.anchors.target || 'd4',
          anchor: 'target',
          paramsJson: '{}',
          clearAfterMs: 1400,
        },
      ],
    }));
  };

  const addPieceActor = () => {
    const newActor = {
      id: id('actor'),
      label: `Actor ${project.pieceActors.length + 1}`,
      type: 'n',
      isWhite: true,
      square: 'd4',
      defaultProfile: 'none',
      defaultIntensity: 0,
    };
    setProject((prev) => ({ ...prev, pieceActors: [...prev.pieceActors, newActor] }));
  };

  const addPieceKeyframe = () => {
    const firstActorId = selectedActorId || project.pieceActors[0]?.id || '';
    setProject((prev) => ({
      ...prev,
      pieceKeyframes: [
        ...prev.pieceKeyframes,
        {
          id: id('kf'),
          actorId: firstActorId,
          atMs: Math.round(currentMs),
          square: prev.anchors.target || 'd4',
          profile: 'none',
          intensity: 0,
        },
      ],
    }));
  };

  const addKeyframeForSelectedActorAtPlayhead = () => {
    if (!selectedActorId) {
      setStatus('Select an actor first before adding a keyframe.');
      return;
    }
    const actor = project.pieceActors.find((a) => a.id === selectedActorId);
    const state = actorStateAtTime.get(selectedActorId);
    const square = state?.square || actor?.square || selectedSquare || 'd4';
    setProject((prev) => ({
      ...prev,
      pieceKeyframes: [
        ...prev.pieceKeyframes,
        {
          id: id('kf'),
          actorId: selectedActorId,
          atMs: Math.round(currentMs),
          square,
          profile: state?.profile || actor?.defaultProfile || 'none',
          intensity: Number(state?.intensity ?? actor?.defaultIntensity ?? 0),
        },
      ],
    }));
    setStatus(`Added keyframe at ${msLabel(currentMs)} for ${actor?.label || 'actor'}`);
  };

  const nudgePlayhead = (deltaMs) => {
    setCurrentMs((prev) => clamp(prev + deltaMs, 0, project.duration));
  };

  const importExistingCutscene = (cardId) => {
    const cfg = getCutsceneConfig(cardId);
    if (!cfg?.config?.camera) {
      setProject((prev) => ({
        ...prev,
        id: `${cardId}_customized`,
        particleCues: [
          {
            id: id('vfx'),
            atMs: 0,
            arcanaId: cardId,
            square: prev.anchors?.target || 'd4',
            anchor: 'target',
            paramsJson: '{}',
            clearAfterMs: 1500,
          },
        ],
      }));
      setStatus(`Imported ${cardId} as particle-focused template (no built-in camera cutscene found)`);
      return;
    }

    const shots = Array.isArray(cfg.config.camera.shots) ? cfg.config.camera.shots : [];
    const mappedShots = shots.map((s) => ({
      id: id('shot'),
      anchor: s.anchor || 'target',
      square: s.square || '',
      zoom: Number(s.zoom || cfg.config.camera.targetZoom || 1.8),
      duration: Number(s.duration || cfg.config.camera.duration || 320),
      holdDuration: Number(s.holdDuration || cfg.config.camera.holdDuration || 260),
      returnDuration: Number(s.returnDuration || cfg.config.camera.returnDuration || cfg.config.camera.duration || 260),
      offset: [
        Number(s.offset?.[0] || cfg.config.camera.offset?.[0] || 2),
        Number(s.offset?.[1] || cfg.config.camera.offset?.[1] || 3),
        Number(s.offset?.[2] || cfg.config.camera.offset?.[2] || 2),
      ],
      lookAtYOffset: Number(s.lookAtYOffset ?? cfg.config.camera.lookAtYOffset ?? 0.2),
    }));

    const soundEntries = cfg.config?.sound ? Object.values(cfg.config.sound) : [];
    const soundCues = soundEntries.map((key, i) => ({ id: id('snd'), atMs: i * 600, key: String(key) }));

    setProject((prev) => ({
      ...prev,
      id: `${cardId}_customized`,
      duration: Number(cfg.duration || prev.duration),
      camera: { shots: mappedShots.length ? mappedShots : prev.camera.shots },
      soundCues: soundCues.length ? soundCues : prev.soundCues,
    }));
    setStatus(`Imported ${cardId} cutscene into studio`);
  };

  const saveTemplate = () => {
    const tpl = {
      id: id('tpl'),
      name: templateName || 'Untitled Template',
      savedAt: Date.now(),
      project,
    };
    const next = [tpl, ...savedTemplates].slice(0, 30);
    setSavedTemplates(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setStatus(`Saved template: ${tpl.name}`);
  };

  const loadTemplate = (tplId) => {
    const tpl = savedTemplates.find((t) => t.id === tplId);
    if (!tpl) return;
    setProject(tpl.project);
    setStatus(`Loaded template: ${tpl.name}`);
  };

  const deleteTemplate = (tplId) => {
    const tpl = savedTemplates.find((t) => t.id === tplId);
    const next = savedTemplates.filter((t) => t.id !== tplId);
    setSavedTemplates(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setStatus(`Deleted template: ${tpl?.name || tplId}`);
  };

  const dismissTutorial = (dontShowAgain = false) => {
    setShowTutorial(false);
    if (dontShowAgain) {
      try {
        localStorage.setItem(TUTORIAL_DISMISS_KEY, '1');
      } catch {
        // ignore storage errors
      }
    }
  };

  const exportBundle = () => {
    const shots = project.camera.shots.map((s) => ({
      ...(s.anchor ? { anchor: s.anchor } : {}),
      ...(s.square ? { square: s.square } : {}),
      zoom: Number(s.zoom || 1.8),
      duration: Number(s.duration || 300),
      holdDuration: Number(s.holdDuration || 280),
      returnDuration: Number(s.returnDuration || 260),
      offset: [
        Number(s.offset?.[0] || 2),
        Number(s.offset?.[1] || 3),
        Number(s.offset?.[2] || 2),
      ],
      lookAtYOffset: Number(s.lookAtYOffset || 0.2),
    }));

    const soundMap = {};
    project.soundCues.forEach((cue, idx) => {
      soundMap[`cue_${idx + 1}`] = cue.key;
    });

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
          studioParticleCues: project.particleCues,
          studioPieceAnimation: {
            actors: project.pieceActors,
            keyframes: project.pieceKeyframes,
          },
        },
        sound: soundMap,
        phases: [
          {
            name: 'studio_sequence',
            duration: Number(project.duration || 3000),
            actions: ['camera_move', 'vfx_particles', 'sound_cues', 'piece_animation'],
          },
        ],
      },
      studioData: {
        anchors: project.anchors,
        soundCues: project.soundCues,
        particleCues: project.particleCues,
        pieceActors: project.pieceActors,
        pieceKeyframes: project.pieceKeyframes,
        fen: project.fen,
      },
      integrationHint: {
        whereToPaste: 'client/src/game/arcana/cutsceneDefinitions.js',
        addToGetConfigMap: true,
        passEventParamsForAnchors: true,
      },
    };

    const txt = prettyJson(payload);
    setClipboardExport(txt);
    navigator.clipboard?.writeText(txt).then(() => {
      setStatus('Copied export bundle to clipboard');
    }).catch(() => {
      setStatus('Export generated below (clipboard unavailable)');
    });
  };

  const syncDurationFromContent = () => {
    setProject((prev) => ({ ...prev, duration: totalTimelineMs }));
    setStatus('Duration synced to longest timeline track');
  };

  return (
    <div className="studio-shell">
      <header className="studio-topbar">
        <div className="studio-top-left">
          <button className="studio-btn ghost" onClick={onBack}>Back To Menu</button>
          <div className="studio-title-wrap">
            <h1>Cutscene Studio</h1>
            <p>Advanced editor for camera choreography, piece fights, sound timing, and particle sync.</p>
          </div>
        </div>

        <div className="studio-top-actions">
          <button className="studio-btn ghost" onClick={() => setShowTutorial(true)}>Tutorial</button>
          <button className="studio-btn" onClick={playProject} disabled={isPlaying}>Play Timeline</button>
          <button className="studio-btn ghost" onClick={stopPlayback}>Stop</button>
          <button className="studio-btn" onClick={exportBundle}>Copy Game Export</button>
        </div>
      </header>

      {showTutorial && (
        <section className="studio-tutorial">
          <div className="studio-tutorial-head">
            <h2>Cutscene Studio Quick Tutorial</h2>
            <button className="studio-btn tiny ghost" onClick={() => dismissTutorial(false)}>Hide</button>
          </div>
          <div className="studio-tutorial-grid">
            <div>
              <h3>1. Start Fast</h3>
              <p>Go to Import tab, select a card, click Import Selected Card. Then press Play Timeline.</p>
            </div>
            <div>
              <h3>2. Camera Authoring</h3>
              <p>In Camera tab, edit shots or click Capture View after moving orbit camera. Toggle Show Camera Rigs to see physical camera markers.</p>
            </div>
            <div>
              <h3>3. Piece Animation</h3>
              <p>In Pieces tab, choose Selected Actor, scrub timeline, click Add Keyframe At Playhead. Piece position changes via square keyframes.</p>
            </div>
            <div>
              <h3>4. Shake vs Move</h3>
              <p>Pieces always move between keyframe squares. Shake/wobble only happens if Enable Motion FX is ON and keyframe profile is not none.</p>
            </div>
            <div>
              <h3>5. Particles & Sound</h3>
              <p>Use Sound and Particles tabs to time cues in milliseconds. Use Preview on each cue to test quickly.</p>
            </div>
            <div>
              <h3>6. Export To Game</h3>
              <p>Click Copy Game Export, then paste into cutscene definitions and map the new ID in getCutsceneConfig.</p>
            </div>
          </div>
          <div className="studio-row wrap">
            <button className="studio-btn tiny" onClick={() => dismissTutorial(true)}>Hide And Do Not Show Again</button>
            <button className="studio-btn tiny ghost" onClick={() => dismissTutorial(false)}>Keep Showing On Open</button>
          </div>
        </section>
      )}

      <div className="studio-meta-row">
        <label>Cutscene ID
          <input value={project.id} onChange={(e) => setProject((p) => ({ ...p, id: e.target.value }))} />
        </label>
        <label>Duration (ms)
          <input
            type="number"
            value={project.duration}
            onChange={(e) => setProject((p) => ({ ...p, duration: clamp(Number(e.target.value || 0), 300, 30000) }))}
          />
        </label>
        <label>Preview FEN
          <input value={project.fen} onChange={(e) => setProject((p) => ({ ...p, fen: e.target.value }))} />
        </label>
        <button className="studio-btn ghost" onClick={syncDurationFromContent}>Auto Sync Duration</button>
        <div className="studio-status">{status}</div>
      </div>

      <div className={`studio-main-grid ${leftPanelCollapsed ? 'left-collapsed' : ''}`}>
        <aside className={`studio-left ${leftPanelCollapsed ? 'collapsed' : ''}`}>
          <section className="studio-card studio-tabs-card">
            <div className="studio-row wrap">
              {STUDIO_TABS.map((tab) => (
                <button
                  key={tab}
                  className={`studio-chip ${activeTab === tab ? 'active' : ''}`}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'vfx' ? 'Particles/VFX' : tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>
            <div className="studio-row wrap">
              <button className="studio-btn tiny ghost" onClick={() => setLeftPanelCollapsed((v) => !v)}>
                {leftPanelCollapsed ? 'Open Editor Panel' : 'Collapse Editor Panel'}
              </button>
              <button className={`studio-btn tiny ${showCameraGizmos ? '' : 'ghost'}`} onClick={() => setShowCameraGizmos((v) => !v)}>
                {showCameraGizmos ? 'Hide Camera Rigs' : 'Show Camera Rigs'}
              </button>
            </div>
          </section>

          <section className="studio-card" style={{ display: activeTab === 'import' ? 'block' : 'none' }}>
            <h2>Import Existing Card Cutscene</h2>
            <div className="studio-row wrap">
              {CUTSCENE_CARD_IDS.map((cardId) => (
                <button key={cardId} className="studio-chip" onClick={() => importExistingCutscene(cardId)}>{slugToTitle(cardId)}</button>
              ))}
            </div>
            <div className="studio-grid-2">
              <label>Import Any Card ID
                <select value={importCardId} onChange={(e) => setImportCardId(e.target.value)}>
                  {allArcanaIds.map((cardId) => <option key={cardId} value={cardId}>{cardId}</option>)}
                </select>
              </label>
              <label>Current Project ID
                <input value={project.id} onChange={(e) => setProject((p) => ({ ...p, id: e.target.value }))} />
              </label>
            </div>
            <div className="studio-row wrap">
              <button className="studio-btn tiny" onClick={() => importExistingCutscene(importCardId)}>Import Selected Card</button>
              <button className="studio-btn tiny ghost" onClick={() => importExistingCutscene(project.id.replace(/_customized$/, ''))}>Import Current ID</button>
            </div>
          </section>

          <section className="studio-card" style={{ display: activeTab === 'camera' ? 'block' : 'none' }}>
            <h2>Anchor Squares</h2>
            {ANCHOR_KEYS.map((key) => (
              <div className="studio-row" key={key}>
                <label>{key}</label>
                <input
                  value={project.anchors[key] || ''}
                  onChange={(e) => setProject((p) => ({ ...p, anchors: { ...p.anchors, [key]: e.target.value.toLowerCase() } }))}
                />
                <button className="studio-btn tiny" onClick={() => setPicker({ kind: 'anchor', anchorKey: key })}>Pick</button>
              </div>
            ))}
          </section>

          <section className="studio-card" style={{ display: activeTab === 'camera' ? 'block' : 'none' }}>
            <h2>Camera Shots</h2>
            <div className="studio-row">
              <button className="studio-btn tiny" onClick={addCameraShot}>Add Shot</button>
            </div>

            {project.camera.shots.map((shot, idx) => (
              <div className="studio-item" key={shot.id}>
                <div className="studio-item-head">
                  <strong>Shot {idx + 1}</strong>
                  <div className="studio-row">
                    <button className="studio-btn tiny" onClick={() => previewShot(shot, idx)}>Preview</button>
                    <button className="studio-btn tiny" onClick={() => captureCurrentViewToShot(shot.id)}>Capture View</button>
                    <button
                      className="studio-btn tiny danger"
                      onClick={() => setProject((p) => ({
                        ...p,
                        camera: { ...p.camera, shots: p.camera.shots.filter((s) => s.id !== shot.id) },
                      }))}
                    >Delete</button>
                  </div>
                </div>

                <div className="studio-grid-2">
                  <label>Anchor
                    <select
                      value={shot.anchor || ''}
                      onChange={(e) => setProject((p) => ({
                        ...p,
                        camera: {
                          ...p.camera,
                          shots: p.camera.shots.map((s) => (s.id === shot.id ? { ...s, anchor: e.target.value } : s)),
                        },
                      }))}
                    >
                      <option value="">(none)</option>
                      {ANCHOR_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </label>
                  <label>Square Override
                    <div className="studio-row">
                      <input
                        value={shot.square || ''}
                        onChange={(e) => setProject((p) => ({
                          ...p,
                          camera: {
                            ...p.camera,
                            shots: p.camera.shots.map((s) => (s.id === shot.id ? { ...s, square: e.target.value.toLowerCase() } : s)),
                          },
                        }))}
                      />
                      <button className="studio-btn tiny" onClick={() => setPicker({ kind: 'shotSquare', id: shot.id })}>Pick</button>
                    </div>
                  </label>

                  <label>Zoom
                    <input
                      type="number"
                      step="0.05"
                      value={shot.zoom}
                      onChange={(e) => setProject((p) => ({
                        ...p,
                        camera: {
                          ...p.camera,
                          shots: p.camera.shots.map((s) => (s.id === shot.id ? { ...s, zoom: Number(e.target.value || 1) } : s)),
                        },
                      }))}
                    />
                  </label>
                  <label>LookAt Y Offset
                    <input
                      type="number"
                      step="0.01"
                      value={shot.lookAtYOffset}
                      onChange={(e) => setProject((p) => ({
                        ...p,
                        camera: {
                          ...p.camera,
                          shots: p.camera.shots.map((s) => (s.id === shot.id ? { ...s, lookAtYOffset: Number(e.target.value || 0) } : s)),
                        },
                      }))}
                    />
                  </label>

                  <label>Move (ms)
                    <input
                      type="number"
                      value={shot.duration}
                      onChange={(e) => setProject((p) => ({
                        ...p,
                        camera: {
                          ...p.camera,
                          shots: p.camera.shots.map((s) => (s.id === shot.id ? { ...s, duration: Number(e.target.value || 0) } : s)),
                        },
                      }))}
                    />
                  </label>
                  <label>Hold (ms)
                    <input
                      type="number"
                      value={shot.holdDuration}
                      onChange={(e) => setProject((p) => ({
                        ...p,
                        camera: {
                          ...p.camera,
                          shots: p.camera.shots.map((s) => (s.id === shot.id ? { ...s, holdDuration: Number(e.target.value || 0) } : s)),
                        },
                      }))}
                    />
                  </label>

                  <label>Return (ms)
                    <input
                      type="number"
                      value={shot.returnDuration}
                      onChange={(e) => setProject((p) => ({
                        ...p,
                        camera: {
                          ...p.camera,
                          shots: p.camera.shots.map((s) => (s.id === shot.id ? { ...s, returnDuration: Number(e.target.value || 0) } : s)),
                        },
                      }))}
                    />
                  </label>
                </div>

                <div className="studio-grid-3">
                  {['x', 'y', 'z'].map((axis, axisIndex) => (
                    <label key={axis}>Offset {axis.toUpperCase()}
                      <input
                        type="number"
                        step="0.1"
                        value={shot.offset?.[axisIndex] ?? 0}
                        onChange={(e) => setProject((p) => ({
                          ...p,
                          camera: {
                            ...p.camera,
                            shots: p.camera.shots.map((s) => {
                              if (s.id !== shot.id) return s;
                              const nextOffset = [...(s.offset || [2, 3, 2])];
                              nextOffset[axisIndex] = Number(e.target.value || 0);
                              return { ...s, offset: nextOffset };
                            }),
                          },
                        }))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="studio-card" style={{ display: activeTab === 'sound' ? 'block' : 'none' }}>
            <h2>Sound Cues</h2>
            <div className="studio-row"><button className="studio-btn tiny" onClick={addSoundCue}>Add Sound Cue</button></div>
            {project.soundCues.map((cue) => (
              <div className="studio-row" key={cue.id}>
                <input
                  type="number"
                  value={cue.atMs}
                  onChange={(e) => setProject((p) => ({ ...p, soundCues: p.soundCues.map((c) => c.id === cue.id ? { ...c, atMs: Number(e.target.value || 0) } : c) }))}
                />
                <input
                  value={cue.key}
                  onChange={(e) => setProject((p) => ({ ...p, soundCues: p.soundCues.map((c) => c.id === cue.id ? { ...c, key: e.target.value } : c) }))}
                />
                <button className="studio-btn tiny" onClick={() => { try { soundManager.play(cue.key); } catch {} }}>Test</button>
                <button className="studio-btn tiny danger" onClick={() => setProject((p) => ({ ...p, soundCues: p.soundCues.filter((c) => c.id !== cue.id) }))}>Delete</button>
              </div>
            ))}
          </section>

          <section className="studio-card" style={{ display: activeTab === 'vfx' ? 'block' : 'none' }}>
            <h2>Particle / Visual Cues</h2>
            <div className="studio-row"><button className="studio-btn tiny" onClick={addParticleCue}>Add Visual Cue</button></div>
            {project.particleCues.map((cue) => (
              <div className="studio-item" key={cue.id}>
                <div className="studio-row">
                  <label>At (ms)<input type="number" value={cue.atMs} onChange={(e) => setProject((p) => ({ ...p, particleCues: p.particleCues.map((c) => c.id === cue.id ? { ...c, atMs: Number(e.target.value || 0) } : c) }))} /></label>
                  <label>Clear (ms)<input type="number" value={cue.clearAfterMs} onChange={(e) => setProject((p) => ({ ...p, particleCues: p.particleCues.map((c) => c.id === cue.id ? { ...c, clearAfterMs: Number(e.target.value || 0) } : c) }))} /></label>
                </div>
                <div className="studio-grid-2">
                  <label>Arcana Visual Id
                    <input value={cue.arcanaId} onChange={(e) => setProject((p) => ({ ...p, particleCues: p.particleCues.map((c) => c.id === cue.id ? { ...c, arcanaId: e.target.value } : c) }))} />
                  </label>
                  <label>Anchor
                    <select value={cue.anchor || ''} onChange={(e) => setProject((p) => ({ ...p, particleCues: p.particleCues.map((c) => c.id === cue.id ? { ...c, anchor: e.target.value } : c) }))}>
                      <option value="">(none)</option>
                      {ANCHOR_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </label>
                </div>
                <div className="studio-row">
                  <input value={cue.square || ''} onChange={(e) => setProject((p) => ({ ...p, particleCues: p.particleCues.map((c) => c.id === cue.id ? { ...c, square: e.target.value.toLowerCase() } : c) }))} />
                  <button className="studio-btn tiny" onClick={() => setPicker({ kind: 'particleSquare', id: cue.id })}>Pick</button>
                  <button
                    className="studio-btn tiny"
                    onClick={() => {
                      let params = {};
                      try { params = cue.paramsJson ? JSON.parse(cue.paramsJson) : {}; } catch {}
                      const square = resolveSquare(cue.square, cue.anchor);
                      setActiveVisualArcana({ arcanaId: cue.arcanaId, params: { ...params, square, targetSquare: square, beatTimingsMs: cameraBeats, syncDurationMs: project.duration } });
                    }}
                  >Preview</button>
                  <button className="studio-btn tiny danger" onClick={() => setProject((p) => ({ ...p, particleCues: p.particleCues.filter((c) => c.id !== cue.id) }))}>Delete</button>
                </div>
                <textarea
                  value={cue.paramsJson || '{}'}
                  onChange={(e) => setProject((p) => ({ ...p, particleCues: p.particleCues.map((c) => c.id === cue.id ? { ...c, paramsJson: e.target.value } : c) }))}
                />
              </div>
            ))}
          </section>

          <section className="studio-card" style={{ display: activeTab === 'pieces' ? 'block' : 'none' }}>
            <h2>Piece Animation</h2>
            <div className="studio-row wrap">
              <button className="studio-btn tiny" onClick={addPieceActor}>Add Actor</button>
              <button className="studio-btn tiny" onClick={addPieceKeyframe}>Add Keyframe</button>
              <button className="studio-btn tiny" onClick={addKeyframeForSelectedActorAtPlayhead}>Add Keyframe At Playhead</button>
            </div>
            <div className="studio-row wrap">
              <label>Selected Actor
                <select value={selectedActorId} onChange={(e) => setSelectedActorId(e.target.value)}>
                  {project.pieceActors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </label>
              <button className="studio-btn tiny" onClick={() => nudgePlayhead(-100)}>Playhead -100ms</button>
              <button className="studio-btn tiny" onClick={() => nudgePlayhead(100)}>Playhead +100ms</button>
              <button className={`studio-btn tiny ${enableMotionFx ? '' : 'ghost'}`} onClick={() => setEnableMotionFx((v) => !v)}>
                {enableMotionFx ? 'Motion FX On' : 'Motion FX Off'}
              </button>
            </div>

            {project.pieceActors.map((actor) => (
              <div className="studio-item" key={actor.id}>
                <div className="studio-item-head">
                  <strong>{actor.label}</strong>
                  <button className="studio-btn tiny danger" onClick={() => setProject((p) => ({ ...p, pieceActors: p.pieceActors.filter((a) => a.id !== actor.id), pieceKeyframes: p.pieceKeyframes.filter((k) => k.actorId !== actor.id) }))}>Delete</button>
                </div>
                <div className="studio-grid-3">
                  <label>Label<input value={actor.label} onChange={(e) => setProject((p) => ({ ...p, pieceActors: p.pieceActors.map((a) => a.id === actor.id ? { ...a, label: e.target.value } : a) }))} /></label>
                  <label>Piece Type
                    <select value={actor.type} onChange={(e) => setProject((p) => ({ ...p, pieceActors: p.pieceActors.map((a) => a.id === actor.id ? { ...a, type: e.target.value } : a) }))}>
                      {['p', 'n', 'b', 'r', 'q', 'k'].map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </label>
                  <label>Color
                    <select value={actor.isWhite ? 'w' : 'b'} onChange={(e) => setProject((p) => ({ ...p, pieceActors: p.pieceActors.map((a) => a.id === actor.id ? { ...a, isWhite: e.target.value === 'w' } : a) }))}>
                      <option value="w">White</option>
                      <option value="b">Black</option>
                    </select>
                  </label>
                </div>
                <div className="studio-row">
                  <input value={actor.square} onChange={(e) => setProject((p) => ({ ...p, pieceActors: p.pieceActors.map((a) => a.id === actor.id ? { ...a, square: e.target.value.toLowerCase() } : a) }))} />
                  <button className="studio-btn tiny" onClick={() => setPicker({ kind: 'pieceBase', id: actor.id })}>Pick Base Square</button>
                </div>
              </div>
            ))}

            {project.pieceKeyframes.map((kf) => (
              <div className="studio-row wrap" key={kf.id}>
                <select value={kf.actorId} onChange={(e) => setProject((p) => ({ ...p, pieceKeyframes: p.pieceKeyframes.map((k) => k.id === kf.id ? { ...k, actorId: e.target.value } : k) }))}>
                  {project.pieceActors.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
                <input type="number" value={kf.atMs} onChange={(e) => setProject((p) => ({ ...p, pieceKeyframes: p.pieceKeyframes.map((k) => k.id === kf.id ? { ...k, atMs: Number(e.target.value || 0) } : k) }))} />
                <input value={kf.square} onChange={(e) => setProject((p) => ({ ...p, pieceKeyframes: p.pieceKeyframes.map((k) => k.id === kf.id ? { ...k, square: e.target.value.toLowerCase() } : k) }))} />
                <button className="studio-btn tiny" onClick={() => setPicker({ kind: 'pieceKeyframeSquare', id: kf.id })}>Pick</button>
                <select value={kf.profile} onChange={(e) => setProject((p) => ({ ...p, pieceKeyframes: p.pieceKeyframes.map((k) => k.id === kf.id ? { ...k, profile: e.target.value } : k) }))}>
                  {['none', 'pulse', 'overdrive', 'fracture'].map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
                <input type="number" step="0.01" value={kf.intensity} onChange={(e) => setProject((p) => ({ ...p, pieceKeyframes: p.pieceKeyframes.map((k) => k.id === kf.id ? { ...k, intensity: Number(e.target.value || 0.1) } : k) }))} />
                <button className="studio-btn tiny danger" onClick={() => setProject((p) => ({ ...p, pieceKeyframes: p.pieceKeyframes.filter((k) => k.id !== kf.id) }))}>Delete</button>
              </div>
            ))}
          </section>

          <section className="studio-card" style={{ display: activeTab === 'templates' ? 'block' : 'none' }}>
            <h2>Template Library</h2>
            <div className="studio-row">
              <input value={templateName} onChange={(e) => setTemplateName(e.target.value)} />
              <button className="studio-btn tiny" onClick={saveTemplate}>Save</button>
            </div>
            <div className="studio-template-list">
              {savedTemplates.map((tpl) => (
                <div key={tpl.id} className="studio-template-item">
                  <button className="studio-template-load" onClick={() => loadTemplate(tpl.id)}>
                    <strong>{tpl.name}</strong>
                    <span>{new Date(tpl.savedAt).toLocaleString()}</span>
                  </button>
                  <button className="studio-btn tiny danger" onClick={() => deleteTemplate(tpl.id)}>Delete</button>
                </div>
              ))}
            </div>
          </section>
        </aside>

        <section className="studio-right">
          <div className="studio-canvas-wrap">
            <Canvas shadows camera={{ position: [8, 10, 8], fov: 45 }}>
              <ambientLight intensity={0.75} />
              <directionalLight position={[6, 10, 4]} intensity={0.7} castShadow />
              <Environment preset="city" />

              <group>
                {Array.from({ length: 8 }, (_, file) =>
                  Array.from({ length: 8 }, (_, rank) => {
                    const x = file - 3.5;
                    const z = rank - 3.5;
                    const square = `${'abcdefgh'[file]}${8 - rank}`;
                    const light = (file + rank) % 2 === 0;
                    const isAnchor = Object.values(project.anchors).includes(square);
                    const isSelected = selectedSquare === square;
                    return (
                      <mesh
                        key={square}
                        position={[x, 0, z]}
                        rotation={[-Math.PI / 2, 0, 0]}
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          applyPickedSquare(square);
                        }}
                        receiveShadow
                      >
                        <planeGeometry args={[1, 1]} />
                        <meshStandardMaterial
                          color={isSelected ? '#fff58a' : (isAnchor ? '#8af5d1' : (light ? '#dadde5' : '#455064'))}
                          metalness={0.08}
                          roughness={0.82}
                        />
                      </mesh>
                    );
                  }),
                )}
              </group>

              <CameraRigGizmos
                shots={project.camera.shots}
                resolveSquare={resolveSquare}
                visible={showCameraGizmos}
              />

              {previewPieces.map((piece) => (
                <ChessPiece
                  key={piece.id}
                  type={piece.type}
                  isWhite={piece.isWhite}
                  square={piece.square}
                  targetPosition={piece.position}
                  cutsceneMotion={piece.motion}
                  onClickSquare={(sq) => applyPickedSquare(sq)}
                />
              ))}

              <ArcanaVisualHost
                effectsModule={effectsModule}
                activeVisualArcana={activeVisualArcana}
                gameState={{ activeEffects: {} }}
                pawnShields={{ w: null, b: null }}
                showFog={false}
              />

              <CameraCutscene
                cutsceneTarget={cutsceneTarget}
                onCutsceneEnd={() => {}}
                myColor="white"
                controlsRef={controlsRef}
              />

              <SceneTap onCameraState={setCameraLive} controlsRef={controlsRef} />

              <OrbitControls ref={controlsRef} makeDefault />
            </Canvas>
            <CutsceneOverlay ref={overlayRef} />
          </div>

          <div className="studio-timeline-wrap">
            <div className="studio-timeline-head">
              <strong>Timeline Scrub</strong>
              <span>{msLabel(currentMs)} / {msLabel(project.duration)}</span>
              <span>Selected square: {selectedSquare}</span>
              <span>Picker: {picker ? JSON.stringify(picker) : 'none'}</span>
              <span>Live preview look-at: {livePreviewSquare}</span>
            </div>
            <input
              type="range"
              min={0}
              max={project.duration}
              value={Math.round(currentMs)}
              onChange={(e) => {
                if (isPlaying) return;
                setCurrentMs(Number(e.target.value || 0));
              }}
            />

            <div className="studio-events-lane">
              <div className="studio-events-track">
                {(cameraBeats || []).map((t, i) => (
                  <div key={`beat-${i}`} className="studio-event camera" style={{ left: `${(t / Math.max(1, project.duration)) * 100}%` }} title={`Camera shot ${i + 1} @ ${msLabel(t)}`} />
                ))}
                {(project.soundCues || []).map((c) => (
                  <div key={c.id} className="studio-event sound" style={{ left: `${(Number(c.atMs || 0) / Math.max(1, project.duration)) * 100}%` }} title={`Sound @ ${msLabel(c.atMs)} ${c.key}`} />
                ))}
                {(project.particleCues || []).map((c) => (
                  <div key={c.id} className="studio-event vfx" style={{ left: `${(Number(c.atMs || 0) / Math.max(1, project.duration)) * 100}%` }} title={`VFX @ ${msLabel(c.atMs)} ${c.arcanaId}`} />
                ))}
                {(project.pieceKeyframes || []).map((k) => (
                  <div key={k.id} className="studio-event piece" style={{ left: `${(Number(k.atMs || 0) / Math.max(1, project.duration)) * 100}%` }} title={`Piece keyframe @ ${msLabel(k.atMs)} ${k.square}`} />
                ))}
                <div className="studio-playhead" style={{ left: `${(currentMs / Math.max(1, project.duration)) * 100}%` }} />
              </div>
            </div>

            <div className="studio-quick-tools">
              <button className="studio-chip" onClick={() => setCurrentMs(0)}>Go Start</button>
              <button className="studio-chip" onClick={() => setCurrentMs(project.duration)}>Go End</button>
              <button className="studio-chip" onClick={() => nudgePlayhead(-33)}>-33ms</button>
              <button className="studio-chip" onClick={() => nudgePlayhead(33)}>+33ms</button>
              <button className="studio-chip" onClick={() => nudgePlayhead(-100)}>-100ms</button>
              <button className="studio-chip" onClick={() => nudgePlayhead(100)}>+100ms</button>
              <button className="studio-chip" onClick={addKeyframeForSelectedActorAtPlayhead}>Add Keyframe Here</button>
              <button className="studio-chip" onClick={() => setLivePreviewSquare(selectedSquare)}>Set Look-At Marker</button>
              <button className="studio-chip" onClick={() => {
                setProject((p) => ({
                  ...p,
                  camera: {
                    ...p.camera,
                    shots: p.camera.shots.map((s) => ({ ...s, square: s.square || selectedSquare })),
                  },
                }));
              }}>Fill Empty Shot Squares</button>
            </div>
          </div>

          <section className="studio-export-panel">
            <h2>Export Bundle</h2>
            <p>Copy-paste this into cutscene definitions, then wire the id into getCutsceneConfig map if it is new.</p>
            <textarea readOnly value={clipboardExport} placeholder="Click Copy Game Export to generate integration JSON" />
          </section>
        </section>
      </div>
    </div>
  );
}
