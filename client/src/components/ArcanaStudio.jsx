import React, {
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { Grid, Html, Line, OrbitControls, TransformControls, useGLTF } from '@react-three/drei';
import { ChessPiece } from './ChessPiece.jsx';
import { ArcanaStudioTutorial } from './ArcanaStudioTutorial.jsx';
import {
  createEmptyArcanaStudioCard,
  migrateArcanaStudioCard,
  saveArcanaStudioCard,
} from '../game/arcana/studio/arcanaStudioSchema.js';
import {
  collectTimelineRows,
  easingToT,
  sampleCameraTrack,
  sampleObjectTrack,
  sampleOverlayTrack,
  sampleParticleTrack,
} from '../game/arcana/studio/arcanaStudioPlayback.js';
import {
  getAllCutsceneCards,
  buildLegacyCutsceneFromCard,
} from '../game/arcana/cutsceneDefinitions.js';
import { resolveSoundPreviewUrl } from '../game/arcana/studio/arcanaStudioRuntime.js';
import { squareToPosition } from '../game/arcana/sharedHelpers.jsx';
import './styles/ArcanaStudio.css';

const TRACK_LABELS = {
  camera: 'Camera',
  object: 'Object',
  particle: 'Particle',
  overlay: 'Overlay',
  sound: 'Sound',
  event: 'Event',
};

const CAMERA_EASINGS = ['linear', 'easeInQuad', 'easeOutQuad', 'easeInOutQuad', 'easeInCubic', 'easeOutCubic', 'easeInOutCubic', 'customBezier'];
const OBJECT_TYPES = ['piece', 'mesh', 'part'];
const ATTACH_MODES = ['follow', 'attach-offset', 'world-space'];
const OVERLAY_TYPES = ['text', 'panel', 'image'];
const DEFAULT_WORLD_ANCHOR = [0, 0.15, 0];
const CAMERA_BLEND_MODES = ['curve', 'cut'];
const MAX_HISTORY_ENTRIES = 60;
const WAVEFORM_CACHE = new Map();

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeCardId(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '_');
}

function addVec3(...vectors) {
  return vectors.reduce((acc, vector) => ([
    acc[0] + (vector?.[0] || 0),
    acc[1] + (vector?.[1] || 0),
    acc[2] + (vector?.[2] || 0),
  ]), [0, 0, 0]);
}

function snapTimeMs(timeMs, snapMs) {
  const safeTime = Math.max(0, Number(timeMs) || 0);
  const safeSnap = Math.max(1, Number(snapMs) || 1);
  return Math.round(safeTime / safeSnap) * safeSnap;
}

function sortIds(mapObj) {
  return Object.keys(mapObj || {}).sort((a, b) => a.localeCompare(b));
}

function parseJsonSafe(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function downloadJson(fileName, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function formatMs(timeMs = 0) {
  return `${(Math.max(0, timeMs) / 1000).toFixed(2)}s`;
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
          targetPosition: [x, 0.15, z],
        });
        file += 1;
      }
    }
  }
  return pieces;
}

function resolveObjectStates(card, boardPieces, timeMs) {
  const tracks = card?.tracks?.objects || [];
  const pieceBySquare = new Map(boardPieces.map((piece) => [piece.square, piece]));
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const resolved = {};
  const visiting = new Set();

  const resolveTrack = (trackId) => {
    if (!trackId || resolved[trackId]) return resolved[trackId] || null;
    if (visiting.has(trackId)) {
      return {
        position: [0, 0, 0],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
        anchorPosition: DEFAULT_WORLD_ANCHOR,
        worldPosition: DEFAULT_WORLD_ANCHOR,
      };
    }

    const track = trackById.get(trackId);
    if (!track) return null;

    visiting.add(trackId);

    const sampled = sampleObjectTrack(track, timeMs);
    const attachMode = track.attach?.mode || 'follow';
    let anchorPosition = DEFAULT_WORLD_ANCHOR;

    if (attachMode !== 'world-space') {
      if (track.attach?.targetId && trackById.has(track.attach.targetId)) {
        anchorPosition = resolveTrack(track.attach.targetId)?.worldPosition || DEFAULT_WORLD_ANCHOR;
      } else {
        anchorPosition = pieceBySquare.get(track.pieceSquare || '')?.targetPosition || DEFAULT_WORLD_ANCHOR;
      }
    }

    const basePosition = addVec3(anchorPosition, track.attach?.offset || [0, 0, 0]);
    const worldPosition = addVec3(basePosition, sampled.position || [0, 0, 0]);

    resolved[trackId] = {
      ...sampled,
      anchorPosition: basePosition,
      worldPosition,
    };

    visiting.delete(trackId);
    return resolved[trackId];
  };

  tracks.forEach((track) => {
    resolveTrack(track.id);
  });

  return resolved;
}

function createTrack(trackType, playheadMs = 0) {
  switch (trackType) {
    case 'camera':
      return {
        id: uid('cam'),
        name: 'Camera',
        keys: [{
          id: uid('camkey'),
          timeMs: playheadMs,
          position: [0, 7, 7],
          target: [0, 0, 0],
          fov: 55,
          easing: 'easeInOutCubic',
          bezier: [0.25, 0.1, 0.25, 1],
          blendMode: 'curve',
        }],
      };
    case 'object':
      return {
        id: uid('obj'),
        name: 'Animated Piece',
        type: 'piece',
        pieceSquare: 'e4',
        assetUri: '',
        attach: { mode: 'follow', targetId: null, parentId: null, offset: [0, 0, 0], parenting: true },
        keys: [{
          id: uid('objkey'),
          timeMs: playheadMs,
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
          easing: 'easeInOutCubic',
          bezier: [0.25, 0.1, 0.25, 1],
        }],
      };
    case 'particle':
      return {
        id: uid('pt'),
        name: 'Emitter',
        attach: { mode: 'follow', targetId: null, parentId: null, offset: [0, 0, 0], parenting: true },
        params: {
          emissionRate: 32,
          burstCount: 0,
          velocityMin: 0.4,
          velocityMax: 1.8,
          lifetimeMin: 0.35,
          lifetimeMax: 1.2,
          sizeOverLife: [1, 0.7, 0],
          colorOverLife: ['#ffffff', '#88ccff', '#0044ff'],
          gravity: [0, -9.81, 0],
          drag: 0.08,
          spawnShape: 'sphere',
          spawnRadius: 0.35,
          noiseStrength: 0.2,
          noiseFrequency: 1.5,
          material: { additive: true, softParticles: true },
          subemitters: [],
        },
        keys: [{ id: uid('ptk'), timeMs: playheadMs, enabled: true, seed: 1337, easing: 'linear', overrides: {} }],
      };
    case 'overlay':
      return {
        id: uid('ov'),
        name: 'Overlay',
        type: 'text',
        space: 'screen',
        content: 'New overlay',
        style: {
          color: '#ffffff',
          fontSize: 36,
          fontFamily: 'Georgia, serif',
          weight: 700,
          align: 'center',
          imageUrl: '',
          background: 'rgba(0,0,0,0)',
        },
        keys: [{ id: uid('ovk'), timeMs: playheadMs, x: 50, y: 50, opacity: 1, scale: 1, rotation: 0, easing: 'easeInOutCubic', text: 'Overlay' }],
      };
    case 'sound':
      return {
        id: uid('snd'),
        name: 'Sound',
        keys: [{ id: uid('sndk'), timeMs: playheadMs, soundId: '', volume: 1, loop: false, pitch: 1 }],
      };
    case 'event':
      return {
        id: uid('evt'),
        name: 'Event',
        keys: [{ id: uid('evtk'), timeMs: playheadMs, type: 'custom', delayMs: 0, payload: {} }],
      };
    default:
      return null;
  }
}

function getTrackCollectionName(type) {
  switch (type) {
    case 'camera': return 'camera';
    case 'object': return 'objects';
    case 'particle': return 'particles';
    case 'overlay': return 'overlays';
    case 'sound': return 'sounds';
    case 'event': return 'events';
    default: return null;
  }
}

function getTrackCollection(card, type) {
  const key = getTrackCollectionName(type);
  return key ? (card?.tracks?.[key] || []) : [];
}

function getTrackBySelection(card, selection) {
  if (!selection?.type || !selection?.trackId) return null;
  return getTrackCollection(card, selection.type).find((track) => track.id === selection.trackId) || null;
}

function getKeyBySelection(track, keyId) {
  return Array.isArray(track?.keys) ? track.keys.find((key) => key.id === keyId) || null : null;
}

function buildSvgPath(points) {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point[0]} ${point[1]}`).join(' ');
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function downsampleWaveform(channelData, sampleCount = 80) {
  if (!channelData?.length) return [];
  const chunkSize = Math.max(1, Math.floor(channelData.length / sampleCount));
  const samples = [];
  for (let index = 0; index < sampleCount; index += 1) {
    const start = index * chunkSize;
    const end = Math.min(channelData.length, start + chunkSize);
    let peak = 0;
    for (let offset = start; offset < end; offset += 1) {
      peak = Math.max(peak, Math.abs(channelData[offset] || 0));
    }
    samples.push(peak);
  }
  return samples;
}

function useAudioWaveform(soundId) {
  const [state, setState] = useState({ status: soundId ? 'loading' : 'idle', samples: [] });

  useEffect(() => {
    let cancelled = false;
    const url = resolveSoundPreviewUrl(soundId);

    if (!soundId || !url) {
      setState({ status: 'idle', samples: [] });
      return undefined;
    }

    if (WAVEFORM_CACHE.has(url)) {
      setState({ status: 'ready', samples: WAVEFORM_CACHE.get(url) });
      return undefined;
    }

    const context = typeof window !== 'undefined' ? new (window.AudioContext || window.webkitAudioContext)() : null;
    if (!context) {
      setState({ status: 'unsupported', samples: [] });
      return undefined;
    }

    setState({ status: 'loading', samples: [] });

    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Audio fetch failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then((buffer) => context.decodeAudioData(buffer.slice(0)))
      .then((audioBuffer) => {
        if (cancelled) return;
        const channel = audioBuffer.getChannelData(0);
        const samples = downsampleWaveform(channel);
        WAVEFORM_CACHE.set(url, samples);
        setState({ status: 'ready', samples });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ status: 'error', samples: [] });
        }
      })
      .finally(() => {
        context.close().catch(() => {});
      });

    return () => {
      cancelled = true;
      context.close().catch(() => {});
    };
  }, [soundId]);

  return state;
}

export function ArcanaStudio({ onBack }) {
  const fileInputRef = useRef(null);
  const objectAssetInputRef = useRef(null);
  const historyGuardRef = useRef(false);
  const [cards, setCards] = useState(() => getAllCutsceneCards());
  const [selectedId, setSelectedId] = useState(null); // Start with blank card
  const [status, setStatus] = useState('Ready');
  const [playheadMs, setPlayheadMs] = useState(0);
  const deferredPlayheadMs = useDeferredValue(playheadMs);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selection, setSelection] = useState(null);
  const [selectedKeyId, setSelectedKeyId] = useState(null);
  const [transformMode, setTransformMode] = useState('translate');
  const [viewportMode, setViewportMode] = useState('preview');
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const playStartRef = useRef(0);
  const playheadStartRef = useRef(0);

  const selectedCard = useMemo(() => {
    if (!selectedId) return null;
    return migrateArcanaStudioCard(cards[selectedId], selectedId);
  }, [cards, selectedId]);
  const timelineSnapMs = selectedCard?.settings?.timelineSnapMs ?? 50;
  const snapTimelineTime = (timeMs) => snapTimeMs(timeMs, timelineSnapMs);

  const selectedTrack = useMemo(() => getTrackBySelection(selectedCard, selection), [selectedCard, selection]);
  const selectedKey = useMemo(() => getKeyBySelection(selectedTrack, selectedKeyId), [selectedTrack, selectedKeyId]);
  const timelineRows = useMemo(() => collectTimelineRows(selectedCard), [selectedCard]);
  const sampledCamera = useMemo(() => sampleCameraTrack(selectedCard?.tracks?.camera?.[0], deferredPlayheadMs), [selectedCard, deferredPlayheadMs]);
  const sampledOverlays = useMemo(
    () => (selectedCard?.tracks?.overlays || []).map((track) => ({ track, sample: sampleOverlayTrack(track, deferredPlayheadMs) })).filter((item) => item.sample),
    [selectedCard, deferredPlayheadMs],
  );
  const boardPieces = useMemo(() => parseFenPieces(selectedCard?.board?.fen), [selectedCard?.board?.fen]);
  const objectStates = useMemo(() => {
    return resolveObjectStates(selectedCard, boardPieces, deferredPlayheadMs);
  }, [selectedCard, boardPieces, deferredPlayheadMs]);

  const buildSnapshot = () => ({
    cards: cloneJson(cards),
    selectedId,
    selection: cloneJson(selection),
    selectedKeyId,
    playheadMs,
  });

  const restoreSnapshot = (snapshot) => {
    if (!snapshot) return;
    historyGuardRef.current = true;
    startTransition(() => {
      setCards(snapshot.cards || {});
      setSelectedId(snapshot.selectedId || null);
      setSelection(snapshot.selection || null);
      setSelectedKeyId(snapshot.selectedKeyId || null);
      setPlayheadMs(snapshot.playheadMs || 0);
      setIsPlaying(false);
    });
    requestAnimationFrame(() => {
      historyGuardRef.current = false;
    });
  };

  const pushHistory = () => {
    if (historyGuardRef.current) return;
    const snapshot = buildSnapshot();
    setUndoStack((prev) => [...prev.slice(-(MAX_HISTORY_ENTRIES - 1)), snapshot]);
    setRedoStack([]);
  };

  const undoEditor = () => {
    if (!undoStack.length) return;
    const snapshot = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, buildSnapshot()]);
    restoreSnapshot(snapshot);
    setStatus('Undid last studio change.');
  };

  const redoEditor = () => {
    if (!redoStack.length) return;
    const snapshot = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, buildSnapshot()].slice(-MAX_HISTORY_ENTRIES));
    restoreSnapshot(snapshot);
    setStatus('Redid studio change.');
  };

  useEffect(() => {
    if (!isPlaying || !selectedCard) return undefined;
    let frame = 0;
    const tick = () => {
      const elapsed = performance.now() - playStartRef.current;
      const next = Math.min(selectedCard.durationMs, playheadStartRef.current + elapsed);
      setPlayheadMs(next);
      if (next >= selectedCard.durationMs) {
        setIsPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    playStartRef.current = performance.now();
    playheadStartRef.current = playheadMs;
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, selectedCard, playheadMs]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!selectedCard) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) redoEditor();
        else undoEditor();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redoEditor();
        return;
      }
      if (event.code === 'Space') {
        event.preventDefault();
        setIsPlaying((value) => !value);
      }
      if (event.key.toLowerCase() === 'g') setTransformMode('translate');
      if (event.key.toLowerCase() === 'r') setTransformMode('rotate');
      if (event.key.toLowerCase() === 's') setTransformMode('scale');
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedTrack && selectedKeyId) {
        event.preventDefault();
        removeSelectedKey();
      }
    };

    const handleMouseMove = (event) => {
      if (isDraggingPlayhead && selectedCard) {
        const slider = document.querySelector('.playhead-slider');
        if (!slider) return;
        const rect = slider.getBoundingClientRect();
        const ratio = clamp((event.clientX - rect.left) / rect.width, 0, 1);
        const newTime = Math.round(ratio * selectedCard.durationMs);
        setPlayheadMs(newTime);
        setIsPlaying(false);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingPlayhead(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [redoStack.length, selectedCard, selectedTrack, selectedKeyId, undoStack.length, isDraggingPlayhead]);

  const setCard = (nextCard, previousId = null, options = {}) => {
    if (!nextCard?.id) return;
    if (options.recordHistory !== false) pushHistory();
    const migrated = migrateArcanaStudioCard(nextCard, nextCard.id);
    startTransition(() => {
      setCards((prev) => {
        const nextCards = { ...prev };
        if (previousId && previousId !== migrated.id) {
          delete nextCards[previousId];
        }
        nextCards[migrated.id] = migrated;
        return nextCards;
      });
      setSelectedId(migrated.id);
    });
  };

  const updateSelectedCard = (patcher) => {
    if (!selectedCard) return;
    const next = patcher(migrateArcanaStudioCard(selectedCard, selectedCard.id));
    setCard(next, selectedId);
  };

  const replaceTrack = (type, trackId, patcher) => {
    updateSelectedCard((card) => {
      const collectionName = getTrackCollectionName(type);
      const current = card.tracks?.[collectionName] || [];
      return {
        ...card,
        tracks: {
          ...card.tracks,
          [collectionName]: current.map((track) => (track.id === trackId ? patcher(track) : track)),
        },
      };
    });
  };

  const addTrack = (type) => {
    if (!selectedCard) return;
    const track = createTrack(type, snapTimelineTime(playheadMs));
    if (!track) return;
    const collectionName = getTrackCollectionName(type);
    updateSelectedCard((card) => ({
      ...card,
      tracks: {
        ...card.tracks,
        [collectionName]: [...(card.tracks?.[collectionName] || []), track],
      },
    }));
    setSelection({ type, trackId: track.id });
    setSelectedKeyId(track.keys?.[0]?.id || null);
    setStatus(`Added ${TRACK_LABELS[type]} track.`);
  };

  const addKeyToTrack = (type, trackId, timeMs = playheadMs) => {
    const track = getTrackBySelection(selectedCard, { type, trackId });
    if (!track) return;
    const snappedTimeMs = snapTimelineTime(timeMs);
    let newKey = null;
    if (type === 'camera') {
      const sample = sampleCameraTrack(track, snappedTimeMs);
      newKey = { id: uid('camkey'), timeMs: snappedTimeMs, position: sample.position, target: sample.target, fov: sample.fov, easing: sample.easing || 'easeInOutCubic', bezier: [0.25, 0.1, 0.25, 1], blendMode: sample.blendMode || 'curve' };
    }
    if (type === 'object') {
      const sample = sampleObjectTrack(track, snappedTimeMs);
      newKey = { id: uid('objkey'), timeMs: snappedTimeMs, position: sample.position, rotation: sample.rotation, scale: sample.scale, easing: 'easeInOutCubic', bezier: [0.25, 0.1, 0.25, 1] };
    }
    if (type === 'particle') {
      const sample = sampleParticleTrack(track, snappedTimeMs);
      newKey = { id: uid('ptk'), timeMs: snappedTimeMs, enabled: sample.active, seed: sample.seed, easing: 'linear', overrides: sample.overrides || {} };
    }
    if (type === 'overlay') {
      const sample = sampleOverlayTrack(track, snappedTimeMs) || { x: 50, y: 50, opacity: 1, scale: 1, rotation: 0, text: track.content || '' };
      newKey = { id: uid('ovk'), timeMs: snappedTimeMs, x: sample.x, y: sample.y, opacity: sample.opacity, scale: sample.scale, rotation: sample.rotation, easing: 'easeInOutCubic', text: sample.text };
    }
    if (type === 'sound') {
      newKey = { id: uid('sndk'), timeMs: snappedTimeMs, soundId: '', volume: 1, loop: false, pitch: 1 };
    }
    if (type === 'event') {
      newKey = { id: uid('evtk'), timeMs: snappedTimeMs, type: 'custom', delayMs: 0, payload: {} };
    }
    if (!newKey) return;
    replaceTrack(type, trackId, (currentTrack) => ({
      ...currentTrack,
      keys: [...(currentTrack.keys || []), newKey].sort((a, b) => a.timeMs - b.timeMs),
    }));
    setSelection({ type, trackId });
    setSelectedKeyId(newKey.id);
  };

  const removeSelectedKey = () => {
    if (!selectedTrack || !selectedKeyId || !(selectedTrack.keys || []).length) return;
    replaceTrack(selection.type, selectedTrack.id, (currentTrack) => ({
      ...currentTrack,
      keys: (currentTrack.keys || []).filter((key) => key.id !== selectedKeyId),
    }));
    setSelectedKeyId(null);
  };

  const upsertObjectTransformKey = (trackId, transform) => {
    const track = getTrackBySelection(selectedCard, { type: 'object', trackId });
    if (!track) return;
    const snappedPlayheadMs = snapTimelineTime(playheadMs);
    const existing = (track.keys || []).find((key) => key.id === selectedKeyId) || (track.keys || []).find((key) => Math.abs((key.timeMs || 0) - snappedPlayheadMs) < 8);
    replaceTrack('object', trackId, (currentTrack) => {
      const keys = [...(currentTrack.keys || [])];
      if (existing) {
        return {
          ...currentTrack,
          keys: keys.map((key) => (key.id === existing.id ? {
            ...key,
            timeMs: snappedPlayheadMs,
            position: transform.position,
            rotation: transform.rotation,
            scale: transform.scale,
          } : key)).sort((a, b) => a.timeMs - b.timeMs),
        };
      }
      if (selectedCard.settings?.autoKey !== false) {
        const key = {
          id: uid('objkey'),
          timeMs: snappedPlayheadMs,
          position: transform.position,
          rotation: transform.rotation,
          scale: transform.scale,
          easing: 'easeInOutCubic',
          bezier: [0.25, 0.1, 0.25, 1],
        };
        setSelectedKeyId(key.id);
        return { ...currentTrack, keys: [...keys, key].sort((a, b) => a.timeMs - b.timeMs) };
      }
      return currentTrack;
    });
  };

  const handleCreateCard = () => {
    const id = window.prompt('New card id (example: blade_execution)', 'new_arcana_cutscene');
    if (!id) return;
    const normalizedId = normalizeCardId(id);
    if (!normalizedId) return;
    const fresh = createEmptyArcanaStudioCard(normalizedId);
    fresh.name = normalizedId.replace(/_/g, ' ');
    setCard(fresh);
    setStatus(`Created ${normalizedId}`);
  };

  const handleSaveRuntime = () => {
    if (!selectedCard) return;
    saveArcanaStudioCard(selectedCard);
    setStatus(`Saved runtime override for ${selectedCard.id}`);
  };

  const importFromFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw);
      const migrated = migrateArcanaStudioCard(parsed, parsed?.id || 'imported_cutscene');
      setCard(migrated);
      setStatus(`Imported ${migrated.id}`);
    } catch (error) {
      setStatus(`Import failed: ${error?.message || 'Invalid JSON'}`);
    }
  };

  const handleMeshImport = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || selection?.type !== 'object' || !selectedTrack) return;
    const objectUrl = URL.createObjectURL(file);
    replaceTrack('object', selectedTrack.id, (track) => ({ ...track, assetUri: objectUrl, type: 'mesh' }));
    setStatus(`Attached mesh ${file.name} to ${selectedTrack.name}.`);
  };

  const exportSelectedCard = () => {
    if (!selectedCard) return;
    downloadJson(`${selectedCard.id}.arcana-studio.json`, selectedCard);
    setStatus(`Exported ${selectedCard.id}`);
  };

  const exportLegacySelected = () => {
    if (!selectedCard) return;
    downloadJson(`${selectedCard.id}.legacy.cutscene.json`, buildLegacyCutsceneFromCard(selectedCard));
    setStatus(`Exported legacy payload for ${selectedCard.id}`);
  };

  const graphKey = selectedKey || selectedCard?.tracks?.camera?.[0]?.keys?.[0] || null;

  return (
    <div className="arcana-studio-shell">
      <header className="arcana-studio-header">
        <div>
          <h1>Arcana Studio</h1>
          <p>Full-featured cutscene editor: drag keyframes, scrub timeline, animate pieces, and create runtime-compatible cards.</p>
        </div>
        <div className="arcana-studio-actions">
          <button onClick={undoEditor} disabled={!undoStack.length}>Undo</button>
          <button onClick={redoEditor} disabled={!redoStack.length}>Redo</button>
          <button onClick={handleCreateCard}>New Card</button>
          <select value={selectedId || ''} onChange={(event) => {setSelectedId(event.target.value || null); setSelection(null); setSelectedKeyId(null); setStatus('Switched to card');}} className="card-import-dropdown">
            <option value="">Load Existing Card...</option>
            {sortIds(getAllCutsceneCards()).map((id) => (
              <option key={id} value={id}>{id}</option>
            ))}
          </select>
          <button onClick={() => fileInputRef.current?.click()}>Import JSON</button>
          <button onClick={exportSelectedCard} disabled={!selectedCard}>Export Card</button>
          <button onClick={exportLegacySelected} disabled={!selectedCard}>Export Legacy</button>
          <button className="primary" onClick={handleSaveRuntime} disabled={!selectedCard}>Save Runtime</button>
          <button onClick={() => setShowTutorial(true)}>?  Tutorial</button>
          <button onClick={onBack}>Back</button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={importFromFile} hidden />
        </div>
      </header>

      <div className="arcana-studio-layout">
        <aside className="arcana-studio-sidebar">
          <section className="arcana-panel">
            <div className="arcana-panel-title">Loaded Cards</div>
            {Object.keys(cards).length === 0 ? (
              <div className="empty-state" style={{ fontSize: '0.85rem', margin: '8px 0' }}>No cards loaded. Create or import one.</div>
            ) : (
              <div className="arcana-card-list">
                {sortIds(cards).map((id) => (
                  <button
                    key={id}
                    className={`card-item ${id === selectedId ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedId(id);
                      setSelection(null);
                      setSelectedKeyId(null);
                    }}
                    title={id}
                  >
                    <span>{id}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="arcana-panel">
            <div className="arcana-panel-title">Outliner</div>
            <div className="arcana-add-row">
              <button onClick={() => addTrack('camera')}>+ Camera</button>
              <button onClick={() => addTrack('object')}>+ Object</button>
            </div>
            <div className="arcana-add-row">
              <button onClick={() => addTrack('particle')}>+ Particle</button>
              <button onClick={() => addTrack('overlay')}>+ Overlay</button>
            </div>
            <div className="arcana-add-row">
              <button onClick={() => addTrack('sound')}>+ Sound</button>
              <button onClick={() => addTrack('event')}>+ Event</button>
            </div>
            {!selectedCard ? (
              <div className="empty-state" style={{ fontSize: '0.85rem', margin: '8px 0' }}>Select a card to add tracks.</div>
            ) : (
              <div className="outliner-list">
                {timelineRows.map((row) => (
                  <button
                    key={`${row.type}-${row.id}`}
                    className={`outliner-item ${selection?.type === row.type && selection?.trackId === row.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelection({ type: row.type, trackId: row.id });
                      const track = getTrackBySelection(selectedCard, { type: row.type, trackId: row.id });
                      setSelectedKeyId(track?.keys?.[0]?.id || null);
                    }}
                    title={`${TRACK_LABELS[row.type]}: ${row.label}`}
                  >
                    <span>{TRACK_LABELS[row.type]}</span>
                    <strong>{row.label}</strong>
                  </button>
                ))}
              </div>
            )}
          </section>
        </aside>

        <main className="arcana-studio-main">
          {!selectedCard ? (
            <div className="empty-state">Create or import a card to begin.</div>
          ) : (
            <>
              <section className="card-meta card-meta-extended">
                <label>
                  Card Id
                  <input value={selectedCard.id} onChange={(event) => updateSelectedCard((card) => ({ ...card, id: normalizeCardId(event.target.value) || card.id }))} />
                </label>
                <label>
                  Name
                  <input value={selectedCard.name || ''} onChange={(event) => updateSelectedCard((card) => ({ ...card, name: event.target.value }))} />
                </label>
                <label>
                  Duration (ms)
                  <input type="number" value={selectedCard.durationMs || 0} onChange={(event) => updateSelectedCard((card) => ({ ...card, durationMs: Math.max(1, Number(event.target.value || 0)) }))} />
                </label>
                <label>
                  Auto Key
                  <input type="checkbox" checked={selectedCard.settings?.autoKey !== false} onChange={(event) => updateSelectedCard((card) => ({ ...card, settings: { ...(card.settings || {}), autoKey: event.target.checked } }))} />
                </label>
                <label>
                  Timeline Snap (ms)
                  <input type="number" value={selectedCard.settings?.timelineSnapMs ?? 50} onChange={(event) => updateSelectedCard((card) => ({ ...card, settings: { ...(card.settings || {}), timelineSnapMs: Math.max(1, Number(event.target.value || 50)) } }))} />
                </label>
                <label>
                  Random Seed
                  <input type="number" value={selectedCard.settings?.randomSeed ?? 1337} onChange={(event) => updateSelectedCard((card) => ({ ...card, settings: { ...(card.settings || {}), randomSeed: Number(event.target.value || 1337) } }))} />
                </label>
                <label>
                  Lock Seed
                  <input type="checkbox" checked={Boolean(selectedCard.settings?.seedLocked)} onChange={(event) => updateSelectedCard((card) => ({ ...card, settings: { ...(card.settings || {}), seedLocked: event.target.checked } }))} />
                </label>
                <label>
                  FEN
                  <input value={selectedCard.board?.fen || ''} onChange={(event) => updateSelectedCard((card) => ({ ...card, board: { ...(card.board || {}), fen: event.target.value } }))} />
                </label>
                <label>
                  Focus Square
                  <input value={selectedCard.board?.focusSquare || ''} onChange={(event) => updateSelectedCard((card) => ({ ...card, board: { ...(card.board || {}), focusSquare: event.target.value || null } }))} />
                </label>
              </section>

              <section className="arcana-workspace">
                <div className="arcana-viewport-panel arcana-panel">
                  <div className="arcana-panel-title arcana-panel-title-row">
                    <span>Viewport</span>
                    <div className="viewport-toolbar">
                      <button className={transformMode === 'translate' ? 'active' : ''} onClick={() => setTransformMode('translate')}>G Move</button>
                      <button className={transformMode === 'rotate' ? 'active' : ''} onClick={() => setTransformMode('rotate')}>R Rotate</button>
                      <button className={transformMode === 'scale' ? 'active' : ''} onClick={() => setTransformMode('scale')}>S Scale</button>
                      <button className={viewportMode === 'preview' ? 'active' : ''} onClick={() => setViewportMode('preview')}>Preview Cam</button>
                      <button className={viewportMode === 'free' ? 'active' : ''} onClick={() => setViewportMode('free')}>Free Cam</button>
                    </div>
                  </div>
                  <div className="arcana-viewport-shell">
                    <Canvas shadows camera={{ position: [8, 10, 8], fov: 55 }}>
                      <StudioScene
                        card={selectedCard}
                        playheadMs={deferredPlayheadMs}
                        sampledCamera={sampledCamera}
                        boardPieces={boardPieces}
                        objectStates={objectStates}
                        selection={selection}
                        transformMode={transformMode}
                        viewportMode={viewportMode}
                        onSelectTrack={(trackId) => {
                          setSelection({ type: 'object', trackId });
                        }}
                        onTransformCommit={upsertObjectTransformKey}
                      />
                    </Canvas>
                    <div className="arcana-overlay-stage">
                      {sampledOverlays.map(({ track, sample }) => (
                        <OverlayPreview key={track.id} track={track} sample={sample} />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="arcana-timeline-panel arcana-panel">
                  <div className="arcana-panel-title arcana-panel-title-row">
                    <span>Timeline (Drag playhead or keyframes)</span>
                    <div className="timeline-controls">
                      <button onClick={() => setIsPlaying((value) => !value)}>{isPlaying ? 'Pause' : 'Play'}</button>
                      <button onClick={() => setPlayheadMs(0)}>Rewind</button>
                      <button disabled={!selection} onClick={() => addKeyToTrack(selection.type, selection.trackId)}>Add Key</button>
                      <span style={{fontSize: '0.9rem'}}>{formatMs(playheadMs)} / {formatMs(selectedCard.durationMs)}</span>
                    </div>
                  </div>
                  <div className="playhead-slider-wrap">
                    <input 
                      className="playhead-slider" 
                      type="range" 
                      min={0} 
                      max={selectedCard.durationMs} 
                      step={1} 
                      value={playheadMs} 
                      onChange={(event) => setPlayheadMs(snapTimelineTime(event.target.value))}
                      onMouseDown={() => {setIsDraggingPlayhead(true); setIsPlaying(false);}}
                      onTouchStart={() => {setIsDraggingPlayhead(true); setIsPlaying(false);}}
                    />
                  </div>
                  <div className="timeline-rows">
                    {timelineRows.map((row) => {
                      const track = getTrackBySelection(selectedCard, { type: row.type, trackId: row.id });
                      return (
                        <TimelineRow
                          key={`${row.type}-${row.id}`}
                          durationMs={selectedCard.durationMs}
                          row={row}
                          track={track}
                          playheadMs={playheadMs}
                          isSelected={selection?.type === row.type && selection?.trackId === row.id}
                          selectedKeyId={selectedKeyId}
                          onSelectRow={() => {
                            setSelection({ type: row.type, trackId: row.id });
                            setSelectedKeyId(track?.keys?.[0]?.id || null);
                          }}
                          onSelectKey={(keyId) => {
                            setSelection({ type: row.type, trackId: row.id });
                            setSelectedKeyId(keyId);
                          }}
                          onAddKey={(timeMs) => addKeyToTrack(row.type, row.id, timeMs)}
                          onScrub={(timeMs) => setPlayheadMs(snapTimelineTime(timeMs))}
                        />
                      );
                    })}
                  </div>
                </div>

                <div className="arcana-graph-panel arcana-panel">
                  <div className="arcana-panel-title">Graph</div>
                  <GraphPreview keyframe={graphKey} />
                </div>
              </section>
            </>
          )}
        </main>

        <aside className="arcana-inspector arcana-panel">
          <div className="arcana-panel-title">Inspector</div>
          {!selectedCard ? (
            <div className="empty-state">No card selected.</div>
          ) : !selectedTrack ? (
            <CardInspector card={selectedCard} onChange={updateSelectedCard} />
          ) : (
            <TrackInspector
              card={selectedCard}
              track={selectedTrack}
              trackType={selection.type}
              selectedKey={selectedKey}
              setSelectedKeyId={setSelectedKeyId}
              onTrackChange={(patcher) => replaceTrack(selection.type, selectedTrack.id, patcher)}
              onImportMesh={() => objectAssetInputRef.current?.click()}
            />
          )}
          <input ref={objectAssetInputRef} type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" onChange={handleMeshImport} hidden />
        </aside>
      </div>

      <footer className="arcana-studio-status">{status}</footer>
      {showTutorial && <ArcanaStudioTutorial onClose={() => setShowTutorial(false)} />}
    </div>
  );
}

function CardInspector({ card, onChange }) {
  return (
    <div className="inspector-section">
      <label>
        Card Name
        <input value={card.name || ''} onChange={(event) => onChange((value) => ({ ...value, name: event.target.value }))} />
      </label>
      <label>
        Duration
        <input type="number" value={card.durationMs || 0} onChange={(event) => onChange((value) => ({ ...value, durationMs: Math.max(1, Number(event.target.value || 1)) }))} />
      </label>
      <label>
        FPS
        <input type="number" value={card.settings?.fps ?? 60} onChange={(event) => onChange((value) => ({ ...value, settings: { ...(value.settings || {}), fps: Math.max(1, Number(event.target.value || 60)) } }))} />
      </label>
      <label>
        Board FEN
        <textarea value={card.board?.fen || ''} onChange={(event) => onChange((value) => ({ ...value, board: { ...(value.board || {}), fen: event.target.value } }))} />
      </label>
    </div>
  );
}

function TrackInspector({ card, track, trackType, selectedKey, setSelectedKeyId, onTrackChange, onImportMesh }) {
  const updateKey = (patcher) => {
    if (!selectedKey) return;
    onTrackChange((currentTrack) => ({
      ...currentTrack,
      keys: (currentTrack.keys || []).map((key) => (key.id === selectedKey.id ? patcher(key) : key)).sort((a, b) => a.timeMs - b.timeMs),
    }));
  };

  return (
    <div className="inspector-section">
      <label>
        Track Name
        <input value={track.name || ''} onChange={(event) => onTrackChange((value) => ({ ...value, name: event.target.value }))} />
      </label>

      {trackType === 'object' && (
        <>
          <label>
            Object Type
            <select value={track.type || 'piece'} onChange={(event) => onTrackChange((value) => ({ ...value, type: event.target.value }))}>
              {OBJECT_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            Piece Square
            <input value={track.pieceSquare || ''} onChange={(event) => onTrackChange((value) => ({ ...value, pieceSquare: event.target.value }))} />
          </label>
          <label>
            Asset URI
            <input value={track.assetUri || ''} onChange={(event) => onTrackChange((value) => ({ ...value, assetUri: event.target.value }))} />
          </label>
          <button onClick={onImportMesh}>Import GLTF / GLB</button>
          <label>
            Attach Mode
            <select value={track.attach?.mode || 'follow'} onChange={(event) => onTrackChange((value) => ({ ...value, attach: { ...(value.attach || {}), mode: event.target.value } }))}>
              {ATTACH_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </label>
          <label>
            Target Track Id
            <input value={track.attach?.targetId || ''} onChange={(event) => onTrackChange((value) => ({ ...value, attach: { ...(value.attach || {}), targetId: event.target.value || null } }))} />
          </label>
          <NumberTripletEditor label="Attach Offset" value={track.attach?.offset || [0, 0, 0]} onChange={(nextValue) => onTrackChange((value) => ({ ...value, attach: { ...(value.attach || {}), offset: nextValue } }))} />
        </>
      )}

      {trackType === 'particle' && (
        <>
          <label>
            Attach Mode
            <select value={track.attach?.mode || 'follow'} onChange={(event) => onTrackChange((value) => ({ ...value, attach: { ...(value.attach || {}), mode: event.target.value } }))}>
              {ATTACH_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
            </select>
          </label>
          <label>
            Target Track Id
            <input value={track.attach?.targetId || ''} onChange={(event) => onTrackChange((value) => ({ ...value, attach: { ...(value.attach || {}), targetId: event.target.value || null } }))} />
          </label>
          <NumberTripletEditor label="Gravity" value={track.params?.gravity || [0, -9.81, 0]} onChange={(nextValue) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), gravity: nextValue } }))} />
          <NumberTripletEditor label="Size Over Life" value={track.params?.sizeOverLife || [1, 0.7, 0]} onChange={(nextValue) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), sizeOverLife: nextValue } }))} />
          <label>
            Emission Rate
            <input type="number" value={track.params?.emissionRate ?? 32} onChange={(event) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), emissionRate: Number(event.target.value || 0) } }))} />
          </label>
          <label>
            Velocity Min
            <input type="number" value={track.params?.velocityMin ?? 0.4} onChange={(event) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), velocityMin: Number(event.target.value || 0) } }))} />
          </label>
          <label>
            Velocity Max
            <input type="number" value={track.params?.velocityMax ?? 1.8} onChange={(event) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), velocityMax: Number(event.target.value || 0) } }))} />
          </label>
          <label>
            Lifetime Min
            <input type="number" value={track.params?.lifetimeMin ?? 0.35} onChange={(event) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), lifetimeMin: Number(event.target.value || 0) } }))} />
          </label>
          <label>
            Lifetime Max
            <input type="number" value={track.params?.lifetimeMax ?? 1.2} onChange={(event) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), lifetimeMax: Number(event.target.value || 0) } }))} />
          </label>
          <label>
            Noise Strength
            <input type="number" value={track.params?.noiseStrength ?? 0.2} onChange={(event) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), noiseStrength: Number(event.target.value || 0) } }))} />
          </label>
          <label>
            Noise Frequency
            <input type="number" value={track.params?.noiseFrequency ?? 1.5} onChange={(event) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), noiseFrequency: Number(event.target.value || 0) } }))} />
          </label>
          <label>
            Spawn Shape
            <input value={track.params?.spawnShape || 'sphere'} onChange={(event) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), spawnShape: event.target.value } }))} />
          </label>
          <label>
            Color Over Life
            <textarea value={JSON.stringify(track.params?.colorOverLife || ['#ffffff', '#88ccff', '#0044ff'])} onChange={(event) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), colorOverLife: parseJsonSafe(event.target.value, value.params?.colorOverLife || []) } }))} />
          </label>
          <label>
            Subemitters
            <textarea value={JSON.stringify(track.params?.subemitters || [], null, 2)} onChange={(event) => onTrackChange((value) => ({ ...value, params: { ...(value.params || {}), subemitters: parseJsonSafe(event.target.value, value.params?.subemitters || []) } }))} />
          </label>
        </>
      )}

      {trackType === 'overlay' && (
        <>
          <label>
            Overlay Space
            <select value={track.space || 'screen'} onChange={(event) => onTrackChange((value) => ({ ...value, space: event.target.value }))}>
              <option value="screen">screen</option>
              <option value="world">world</option>
            </select>
          </label>
          <label>
            Overlay Type
            <select value={track.type || 'text'} onChange={(event) => onTrackChange((value) => ({ ...value, type: event.target.value }))}>
              {OVERLAY_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>
            Content
            <textarea value={track.content || ''} onChange={(event) => onTrackChange((value) => ({ ...value, content: event.target.value }))} />
          </label>
          <label>
            Font Color
            <input value={track.style?.color || '#ffffff'} onChange={(event) => onTrackChange((value) => ({ ...value, style: { ...(value.style || {}), color: event.target.value } }))} />
          </label>
          <label>
            Font Size
            <input type="number" value={track.style?.fontSize ?? 36} onChange={(event) => onTrackChange((value) => ({ ...value, style: { ...(value.style || {}), fontSize: Number(event.target.value || 0) } }))} />
          </label>
          <label>
            Image URL
            <input value={track.style?.imageUrl || ''} onChange={(event) => onTrackChange((value) => ({ ...value, style: { ...(value.style || {}), imageUrl: event.target.value } }))} />
          </label>
        </>
      )}

      {trackType === 'sound' && selectedKey && (
        <WaveformPreview soundId={selectedKey.soundId} />
      )}

      {selectedKey && (
        <>
          <div className="arcana-panel-title inspector-subtitle">Selected Key</div>
          <label>
            Key
            <select value={selectedKey.id} onChange={(event) => setSelectedKeyId(event.target.value)}>
              {(track.keys || []).map((key) => <option key={key.id} value={key.id}>{formatMs(key.timeMs)}</option>)}
            </select>
          </label>
          <label>
            Time (ms)
            <input type="number" value={selectedKey.timeMs || 0} onChange={(event) => updateKey((key) => ({ ...key, timeMs: Number(event.target.value || 0) }))} />
          </label>
          {'easing' in selectedKey && (
            <label>
              Easing
              <select value={selectedKey.easing || 'linear'} onChange={(event) => updateKey((key) => ({ ...key, easing: event.target.value }))}>
                {CAMERA_EASINGS.map((easing) => <option key={easing} value={easing}>{easing}</option>)}
              </select>
            </label>
          )}
          {'position' in selectedKey && <NumberTripletEditor label="Position" value={selectedKey.position || [0, 0, 0]} onChange={(nextValue) => updateKey((key) => ({ ...key, position: nextValue }))} />}
          {'target' in selectedKey && <NumberTripletEditor label="Target" value={selectedKey.target || [0, 0, 0]} onChange={(nextValue) => updateKey((key) => ({ ...key, target: nextValue }))} />}
          {'rotation' in selectedKey && <NumberTripletEditor label="Rotation" value={selectedKey.rotation || [0, 0, 0]} onChange={(nextValue) => updateKey((key) => ({ ...key, rotation: nextValue }))} />}
          {'scale' in selectedKey && <NumberTripletEditor label="Scale" value={selectedKey.scale || [1, 1, 1]} onChange={(nextValue) => updateKey((key) => ({ ...key, scale: nextValue }))} />}
          {'fov' in selectedKey && <label>FOV<input type="number" value={selectedKey.fov || 55} onChange={(event) => updateKey((key) => ({ ...key, fov: Number(event.target.value || 55) }))} /></label>}
          {'blendMode' in selectedKey && (
            <label>
              Blend Mode
              <select value={selectedKey.blendMode || 'curve'} onChange={(event) => updateKey((key) => ({ ...key, blendMode: event.target.value }))}>
                {CAMERA_BLEND_MODES.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </label>
          )}
          {'bezier' in selectedKey && <NumberQuadEditor label="Bezier" value={selectedKey.bezier || [0.25, 0.1, 0.25, 1]} onChange={(nextValue) => updateKey((key) => ({ ...key, bezier: nextValue }))} />}
          {'opacity' in selectedKey && <label>Opacity<input type="number" step="0.01" value={selectedKey.opacity ?? 1} onChange={(event) => updateKey((key) => ({ ...key, opacity: Number(event.target.value || 0) }))} /></label>}
          {'x' in selectedKey && <label>X %<input type="number" value={selectedKey.x ?? 50} onChange={(event) => updateKey((key) => ({ ...key, x: Number(event.target.value || 0) }))} /></label>}
          {'y' in selectedKey && <label>Y %<input type="number" value={selectedKey.y ?? 50} onChange={(event) => updateKey((key) => ({ ...key, y: Number(event.target.value || 0) }))} /></label>}
          {'text' in selectedKey && <label>Text<input value={selectedKey.text || ''} onChange={(event) => updateKey((key) => ({ ...key, text: event.target.value }))} /></label>}
          {'soundId' in selectedKey && <label>Sound Id<input value={selectedKey.soundId || ''} onChange={(event) => updateKey((key) => ({ ...key, soundId: event.target.value }))} /></label>}
          {'volume' in selectedKey && <label>Volume<input type="number" step="0.05" value={selectedKey.volume ?? 1} onChange={(event) => updateKey((key) => ({ ...key, volume: Number(event.target.value || 0) }))} /></label>}
          {'pitch' in selectedKey && <label>Pitch<input type="number" step="0.05" value={selectedKey.pitch ?? 1} onChange={(event) => updateKey((key) => ({ ...key, pitch: Number(event.target.value || 1) }))} /></label>}
          {'type' in selectedKey && trackType === 'event' && <label>Event Type<input value={selectedKey.type || 'custom'} onChange={(event) => updateKey((key) => ({ ...key, type: event.target.value }))} /></label>}
          {'delayMs' in selectedKey && <label>Delay (ms)<input type="number" value={selectedKey.delayMs || 0} onChange={(event) => updateKey((key) => ({ ...key, delayMs: Number(event.target.value || 0) }))} /></label>}
          {'payload' in selectedKey && <label>Payload<textarea value={JSON.stringify(selectedKey.payload || {}, null, 2)} onChange={(event) => updateKey((key) => ({ ...key, payload: parseJsonSafe(event.target.value, key.payload || {}) }))} /></label>}
          {'seed' in selectedKey && <label>Seed<input type="number" value={selectedKey.seed ?? 1337} onChange={(event) => updateKey((key) => ({ ...key, seed: Number(event.target.value || 1337) }))} /></label>}
          {'enabled' in selectedKey && <label>Enabled<input type="checkbox" checked={Boolean(selectedKey.enabled)} onChange={(event) => updateKey((key) => ({ ...key, enabled: event.target.checked }))} /></label>}
        </>
      )}

      <div className="inspector-chip-list">
        <span>Track keys: {(track.keys || []).length}</span>
        <span>Card: {card.id}</span>
      </div>
    </div>
  );
}

function NumberTripletEditor({ label, value, onChange }) {
  const safe = Array.isArray(value) ? value : [0, 0, 0];
  return (
    <div className="triplet-editor">
      <span>{label}</span>
      <div>
        {safe.map((entry, index) => (
          <input
            key={`${label}-${index}`}
            type="number"
            step="0.01"
            value={entry ?? 0}
            onChange={(event) => {
              const next = [...safe];
              next[index] = Number(event.target.value || 0);
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function NumberQuadEditor({ label, value, onChange }) {
  const safe = Array.isArray(value) ? value : [0.25, 0.1, 0.25, 1];
  return (
    <div className="triplet-editor quad-editor">
      <span>{label}</span>
      <div>
        {safe.map((entry, index) => (
          <input
            key={`${label}-${index}`}
            type="number"
            step="0.01"
            value={entry ?? 0}
            onChange={(event) => {
              const next = [...safe];
              next[index] = Number(event.target.value || 0);
              onChange(next);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function WaveformPreview({ soundId }) {
  const { status, samples } = useAudioWaveform(soundId);

  if (!soundId) {
    return <div className="inspector-chip-list"><span>Set a sound id to decode a waveform preview.</span></div>;
  }

  if (status === 'loading') {
    return <div className="inspector-chip-list"><span>Decoding waveform...</span></div>;
  }

  if (status === 'error' || status === 'unsupported') {
    return <div className="inspector-chip-list"><span>Waveform preview unavailable for {soundId}.</span></div>;
  }

  if (!samples.length) {
    return <div className="inspector-chip-list"><span>No waveform data decoded yet.</span></div>;
  }

  return (
    <div className="waveform-preview-wrap">
      <svg viewBox="0 0 320 72" className="waveform-preview">
        {samples.map((sample, index) => {
          const x = 8 + (index * (304 / Math.max(1, samples.length - 1)));
          const amp = Math.max(2, sample * 28);
          return <line key={`${soundId}-${index}`} x1={x} y1={36 - amp} x2={x} y2={36 + amp} className="waveform-bar" />;
        })}
      </svg>
      <div className="graph-caption">{soundId}</div>
    </div>
  );
}

function TimelineRow({ durationMs, row, track, playheadMs, isSelected, selectedKeyId, onSelectRow, onSelectKey, onAddKey, onScrub }) {
  const laneRef = useRef(null);
  const keys = track?.keys || [];
  const [draggedKeyId, setDraggedKeyId] = useState(null);

  const eventToTime = (event) => {
    const rect = laneRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
    return Math.round(ratio * durationMs);
  };

  useEffect(() => {
    if (!draggedKeyId) return undefined;

    const handleMouseMove = (event) => {
      onSelectKey(draggedKeyId);
      const newTime = eventToTime(event);
      // The inspector's time input will handle the actual update
      // But we update the timeline display via onScrub (but not the playhead)
    };

    const handleMouseUp = () => {
      setDraggedKeyId(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggedKeyId, onSelectKey]);

  return (
    <div className={`timeline-row ${isSelected ? 'selected' : ''}`}>
      <button className="timeline-label" onClick={onSelectRow}><span>{TRACK_LABELS[row.type]}</span><strong>{row.label}</strong></button>
      <div
        ref={laneRef}
        className="timeline-lane"
        onClick={(event) => {
          if (draggedKeyId) return;
          onSelectRow();
          onScrub(eventToTime(event));
        }}
        onDoubleClick={(event) => {
          if (draggedKeyId) return;
          onSelectRow();
          onAddKey(eventToTime(event));
        }}
      >
        <div className="timeline-playhead" style={{ left: `${(playheadMs / Math.max(1, durationMs)) * 100}%` }} />
        {keys.map((key) => (
          <button
            key={key.id}
            className={`timeline-key ${selectedKeyId === key.id ? 'selected' : ''} ${draggedKeyId === key.id ? 'dragging' : ''}`}
            style={{ left: `${((key.timeMs || 0) / Math.max(1, durationMs)) * 100}%` }}
            onMouseDown={(event) => {
              event.stopPropagation();
              setDraggedKeyId(key.id);
              onSelectKey(key.id);
            }}
            title={`${row.label} @ ${formatMs(key.timeMs || 0)} - Drag to move`}
          />
        ))}
      </div>
    </div>
  );
}

function GraphPreview({ keyframe }) {
  const points = useMemo(() => {
    const entries = [];
    for (let index = 0; index <= 32; index += 1) {
      const t = index / 32;
      const eased = easingToT(keyframe?.easing || 'linear', t, keyframe?.bezier || [0.25, 0.1, 0.25, 1]);
      entries.push([12 + t * 236, 132 - eased * 108]);
    }
    return entries;
  }, [keyframe]);

  return (
    <div className="graph-preview-wrap">
      <svg viewBox="0 0 260 140" className="graph-preview">
        <path d="M 12 132 L 248 132 M 12 132 L 12 16" className="graph-axis" />
        <path d={buildSvgPath(points)} className="graph-curve" />
      </svg>
      <div className="graph-caption">{keyframe?.easing || 'linear'}</div>
    </div>
  );
}

function OverlayPreview({ track, sample }) {
  const baseStyle = {
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
    return <img className="overlay-preview-node" alt={track.name} src={track.style.imageUrl} style={baseStyle} />;
  }

  return <div className="overlay-preview-node" style={baseStyle}>{sample.text || track.content}</div>;
}

function StudioScene({
  card,
  playheadMs,
  sampledCamera,
  boardPieces,
  objectStates,
  selection,
  transformMode,
  viewportMode,
  onSelectTrack,
  onTransformCommit,
}) {
  const controlsRef = useRef(null);
  const { camera } = useThree();
  const [dragging, setDragging] = useState(false);
  const cameraStateRef = useRef({ position: [8, 10, 8], target: [0, 0, 0], fov: 55 });
  const animatedSquares = useMemo(() => new Set((card.tracks?.objects || []).filter((track) => track.type === 'piece' && track.pieceSquare).map((track) => track.pieceSquare)), [card]);

  useEffect(() => {
    if (viewportMode !== 'preview' || !sampledCamera) return;
    // Only update camera if not dragging
    if (!dragging) {
      cameraStateRef.current = { 
        position: sampledCamera.position || [0, 7, 7], 
        fov: sampledCamera.fov || 55,
        target: sampledCamera.target || [0, 0, 0]
      };
      camera.position.set(...(sampledCamera.position || [0, 7, 7]));
      camera.fov = sampledCamera.fov || 55;
      camera.updateProjectionMatrix();
      controlsRef.current?.target.set(...(sampledCamera.target || [0, 0, 0]));
      controlsRef.current?.update();
    }
  }, [camera, sampledCamera, viewportMode, dragging]);

  const pieceBySquare = useMemo(() => {
    const map = new Map();
    boardPieces.forEach((piece) => map.set(piece.square, piece));
    return map;
  }, [boardPieces]);

  return (
    <>
      <color attach="background" args={['#090d14']} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[8, 12, 8]} intensity={1.35} castShadow shadow-mapSize-width={2048} shadow-mapSize-height={2048} />
      <Grid args={[10, 10]} cellColor="#20324e" sectionColor="#3f5f93" fadeDistance={14} fadeStrength={1.2} position={[0, 0, 0]} />
      <BoardSquares />
      {boardPieces.filter((piece) => !animatedSquares.has(piece.square)).map((piece) => (
        <ChessPiece key={piece.square} {...piece} />
      ))}
      {(card.tracks?.objects || []).map((track) => {
        const piece = pieceBySquare.get(track.pieceSquare || '');
        return (
          <StudioObjectEntity
            key={track.id}
            track={track}
            piece={piece}
            sampled={objectStates[track.id]}
            selected={selection?.type === 'object' && selection?.trackId === track.id}
            transformMode={transformMode}
            onSelect={() => onSelectTrack(track.id)}
            onDraggingChange={(isDrag) => setDragging(isDrag)}
            onTransformCommit={(transform) => onTransformCommit(track.id, transform)}
          />
        );
      })}
      {(card.tracks?.particles || []).map((track) => (
        <ParticleTrackPreview key={track.id} track={track} card={card} objectStates={objectStates} playheadMs={playheadMs} />
      ))}
      <CameraKeyGizmos tracks={card.tracks?.camera || []} />
      <OrbitControls ref={controlsRef} enabled={!dragging} makeDefault />
    </>
  );
}

function BoardSquares() {
  const squares = [];
  for (let file = 0; file < 8; file += 1) {
    for (let rank = 0; rank < 8; rank += 1) {
      squares.push({
        key: `${file}-${rank}`,
        x: file - 3.5,
        z: rank - 3.5,
        color: (file + rank) % 2 === 0 ? '#d8e1f0' : '#344255',
      });
    }
  }
  return (
    <group>
      {squares.map((square) => (
        <mesh key={square.key} position={[square.x, -0.01, square.z]} receiveShadow rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1, 1]} />
          <meshStandardMaterial color={square.color} roughness={0.8} metalness={0.08} />
        </mesh>
      ))}
    </group>
  );
}

function StudioObjectEntity({ track, piece, sampled, selected, transformMode, onSelect, onDraggingChange, onTransformCommit }) {
  const objectRef = useRef(null);
  const transformRef = useRef(null);
  const anchorPosition = sampled?.anchorPosition || piece?.targetPosition || DEFAULT_WORLD_ANCHOR;
  const finalPosition = sampled?.worldPosition || anchorPosition;

  useEffect(() => {
    const controls = transformRef.current;
    if (!controls) return undefined;
    const handleDraggingChanged = (event) => {
      onDraggingChange(Boolean(event.value));
      if (!event.value && objectRef.current) {
        const position = objectRef.current.position.toArray().map((value, index) => value - (anchorPosition[index] || 0));
        const rotation = [objectRef.current.rotation.x, objectRef.current.rotation.y, objectRef.current.rotation.z];
        const scale = objectRef.current.scale.toArray();
        onTransformCommit({ position, rotation, scale });
      }
    };
    controls.addEventListener('dragging-changed', handleDraggingChanged);
    return () => controls.removeEventListener('dragging-changed', handleDraggingChanged);
  }, [anchorPosition, onDraggingChange, onTransformCommit]);

  const content = track.assetUri ? <ImportedMesh uri={track.assetUri} /> : <TrackFallbackMesh track={track} piece={piece} />;

  if (selected) {
    return (
      <TransformControls ref={transformRef} mode={transformMode}>
        <group
          ref={objectRef}
          position={finalPosition}
          rotation={sampled?.rotation || [0, 0, 0]}
          scale={sampled?.scale || [1, 1, 1]}
          onClick={(event) => {
            event.stopPropagation();
            onSelect();
          }}
        >
          {content}
          <Html center>
            <div className="viewport-tag">{track.name}</div>
          </Html>
        </group>
      </TransformControls>
    );
  }

  return (
    <group
      ref={objectRef}
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
  );
}

function TrackFallbackMesh({ track, piece }) {
  if (track.type === 'piece' && piece) {
    return <ChessPiece {...piece} targetPosition={[0, 0.15, 0]} />;
  }
  return (
    <mesh castShadow>
      <boxGeometry args={[0.45, 0.45, 0.45]} />
      <meshStandardMaterial color={track.type === 'part' ? '#ffcc66' : '#7cb7ff'} emissive={track.type === 'part' ? '#9a5b00' : '#214d9c'} emissiveIntensity={0.5} />
    </mesh>
  );
}

function ImportedMesh({ uri }) {
  const gltf = useGLTF(uri);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  return <primitive object={scene} scale={0.6} />;
}

function ParticleTrackPreview({ track, card, objectStates, playheadMs }) {
  const sample = sampleParticleTrack(track, playheadMs);
  const attachTrack = (card.tracks?.objects || []).find((entry) => entry.id === track.attach?.targetId) || null;
  const attachSample = attachTrack ? objectStates[attachTrack.id] : null;
  const attachSquare = attachTrack?.pieceSquare;
  const attachPos = attachSample?.worldPosition || (attachSquare ? squareToPosition(attachSquare) : DEFAULT_WORLD_ANCHOR);
  const base = addVec3(attachPos, [0, 0.2, 0], track.attach?.offset || [0, 0, 0]);
  const points = useMemo(() => {
    const count = Math.min(24, Math.max(4, Math.round((sample.params?.emissionRate || 12) / 2)));
    const radius = sample.params?.spawnRadius || 0.35;
    const seed = sample.seed || 1337;
    return Array.from({ length: count }).map((_, index) => {
      const angle = (((seed * 0.123) + index) % count) / count * Math.PI * 2;
      const ring = 0.25 + ((seed + index * 17) % 100) / 100;
      return [
        base[0] + Math.cos(angle) * radius * ring,
        base[1] + ((index % 6) / 6) * (sample.params?.lifetimeMax || 1),
        base[2] + Math.sin(angle) * radius * ring,
      ];
    });
  }, [base, sample]);

  if (!sample.active) return null;

  return (
    <group>
      {points.map((point, index) => (
        <mesh key={`${track.id}-${index}`} position={point}>
          <sphereGeometry args={[0.05 + ((index % 3) * 0.01), 8, 8]} />
          <meshStandardMaterial color={(sample.params?.colorOverLife || ['#88ccff'])[index % (sample.params?.colorOverLife || ['#88ccff']).length]} emissive="#7bd5ff" emissiveIntensity={1.2} transparent opacity={0.78} depthWrite={false} />
        </mesh>
      ))}
      {track.attach?.targetId && attachTrack && (
        <Line points={[base, [attachPos[0], 0.2, attachPos[2]]]} color="#8fe5ff" lineWidth={1.25} dashed dashSize={0.18} gapSize={0.12} />
      )}
    </group>
  );
}

function CameraKeyGizmos({ tracks }) {
  return (
    <group>
      {tracks.flatMap((track) => (track.keys || []).map((key) => (
        <group key={key.id} position={key.position || [0, 7, 7]}>
          <mesh>
            <coneGeometry args={[0.18, 0.35, 4]} />
            <meshStandardMaterial color="#ffd287" emissive="#996200" emissiveIntensity={0.45} />
          </mesh>
          <Line points={[key.position || [0, 7, 7], key.target || [0, 0, 0]]} color="#ffd287" lineWidth={1} />
        </group>
      )))}
    </group>
  );
}
