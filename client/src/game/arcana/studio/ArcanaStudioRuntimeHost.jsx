import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Html, Line, useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ChessPiece } from '../../../components/ChessPiece.jsx';
import { sampleCameraTrack, sampleObjectTrack, sampleOverlayTrack, sampleParticleTrack } from './arcanaStudioPlayback.js';
import { getScreenOverlaySamples, resolveRuntimeSquare } from './arcanaStudioRuntime.js';
import { squareToPosition } from '../sharedHelpers.jsx';

const DEFAULT_WORLD_ANCHOR = [0, 0.15, 0];

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

function addVec3(...vectors) {
  return vectors.reduce((acc, vector) => ([
    acc[0] + (vector?.[0] || 0),
    acc[1] + (vector?.[1] || 0),
    acc[2] + (vector?.[2] || 0),
  ]), [0, 0, 0]);
}

function resolveTrackStates(card, eventParams, boardPieces, timeMs) {
  const tracks = card?.tracks?.objects || [];
  const pieceBySquare = new Map(boardPieces.map((piece) => [piece.square, piece]));
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const resolved = {};
  const visiting = new Set();

  const resolveSquareAnchor = (track) => {
    const alias = resolveRuntimeSquare(track?.pieceSquare, eventParams, track?.pieceSquare);
    const piece = pieceBySquare.get(alias || '');
    if (piece) return piece.targetPosition;
    if (alias && /^[a-h][1-8]$/i.test(alias)) {
      const [x, , z] = squareToPosition(alias);
      return [x, 0.15, z];
    }
    return DEFAULT_WORLD_ANCHOR;
  };

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
        anchorPosition = resolveSquareAnchor(track);
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

  tracks.forEach((track) => resolveTrack(track.id));
  return resolved;
}

function ImportedMesh({ uri }) {
  const gltf = useGLTF(uri);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  return <primitive object={scene} scale={0.6} />;
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

function RuntimeObjectEntity({ track, piece, sampled }) {
  const position = sampled?.worldPosition || sampled?.anchorPosition || piece?.targetPosition || DEFAULT_WORLD_ANCHOR;
  const content = track.assetUri ? <ImportedMesh uri={track.assetUri} /> : <TrackFallbackMesh track={track} piece={piece} />;
  return (
    <group position={position} rotation={sampled?.rotation || [0, 0, 0]} scale={sampled?.scale || [1, 1, 1]}>
      {content}
    </group>
  );
}

function RuntimeParticleTrack({ track, card, eventParams, objectStates, playheadMs }) {
  const sample = sampleParticleTrack(track, playheadMs);
  const attachTrack = (card.tracks?.objects || []).find((entry) => entry.id === track.attach?.targetId) || null;
  const attachSample = attachTrack ? objectStates[attachTrack.id] : null;
  const attachAlias = resolveRuntimeSquare(attachTrack?.pieceSquare || track.attach?.targetId, eventParams, eventParams?.targetSquare || eventParams?.square || null);
  const attachPos = attachSample?.worldPosition || (attachAlias && /^[a-h][1-8]$/i.test(attachAlias) ? squareToPosition(attachAlias) : DEFAULT_WORLD_ANCHOR);
  const base = addVec3(attachPos, [0, 0.2, 0], track.attach?.offset || [0, 0, 0]);
  const colors = sample.params?.colorOverLife || ['#88ccff'];

  const points = useMemo(() => {
    const count = Math.min(24, Math.max(4, Math.round((sample.params?.emissionRate || 12) / 2)));
    const radius = sample.params?.spawnRadius || 0.35;
    const seed = sample.seed || 1337;
    return Array.from({ length: count }).map((_, index) => {
      const angle = ((((seed * 0.123) + index) % count) / count) * Math.PI * 2;
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
          <meshStandardMaterial color={colors[index % colors.length]} emissive="#7bd5ff" emissiveIntensity={1.2} transparent opacity={0.78} depthWrite={false} />
        </mesh>
      ))}
      {track.attach?.targetId && attachTrack && (
        <Line points={[base, [attachPos[0], 0.2, attachPos[2]]]} color="#8fe5ff" lineWidth={1.25} dashed dashSize={0.18} gapSize={0.12} />
      )}
    </group>
  );
}

function RuntimeWorldOverlay({ track, sample, eventParams, card }) {
  const alias = resolveRuntimeSquare(track.anchorSquare || track.pieceSquare || eventParams?.targetSquare, eventParams, card?.board?.focusSquare || null);
  const position = alias && /^[a-h][1-8]$/i.test(alias)
    ? (() => {
        const [x, , z] = squareToPosition(alias);
        return [x, 1.25, z];
      })()
    : [0, 1.25, 0];

  return (
    <Html position={position} center transform>
      <div
        style={{
          color: track.style?.color || '#ffffff',
          fontSize: `${track.style?.fontSize || 28}px`,
          fontFamily: track.style?.fontFamily || 'Georgia, serif',
          fontWeight: track.style?.weight || 700,
          textAlign: track.style?.align || 'center',
          background: track.style?.background || 'transparent',
          opacity: sample.opacity,
          transform: `scale(${sample.scale}) rotate(${sample.rotation}deg)`,
          whiteSpace: 'pre-wrap',
          textShadow: '0 6px 18px rgba(0,0,0,0.5)',
          padding: '0.15rem 0.35rem',
          borderRadius: '0.35rem',
        }}
      >
        {sample.text || track.content}
      </div>
    </Html>
  );
}

export function ArcanaStudioRuntimeHost({ session, controlsRef, myColor, onComplete }) {
  const { camera } = useThree();
  const savedStateRef = useRef(null);
  const [playheadMs, setPlayheadMs] = useState(0);

  const boardPieces = useMemo(() => parseFenPieces(session?.card?.board?.fen), [session?.card?.board?.fen]);
  const objectStates = useMemo(() => resolveTrackStates(session?.card, session?.eventParams, boardPieces, playheadMs), [session?.card, session?.eventParams, boardPieces, playheadMs]);
  const pieceBySquare = useMemo(() => new Map(boardPieces.map((piece) => [piece.square, piece])), [boardPieces]);
  const worldOverlayEntries = useMemo(() => (
    (session?.card?.tracks?.overlays || [])
      .filter((track) => track.space === 'world')
      .map((track) => ({ track, sample: sampleOverlayTrack(track, playheadMs) }))
      .filter((entry) => entry.sample)
  ), [session?.card, playheadMs]);

  useEffect(() => {
    if (!session?.id) {
      setPlayheadMs(0);
      return undefined;
    }

    const controls = controlsRef?.current;
    savedStateRef.current = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      fov: camera.fov,
      target: controls?.target?.clone() || new THREE.Vector3(0, 0, 0),
      controlsEnabled: controls?.enabled ?? true,
    };
    if (controls) controls.enabled = false;

    let frame = 0;
    const tick = () => {
      const elapsed = Math.max(0, performance.now() - session.startedAt);
      const next = Math.min(session.durationMs, elapsed);
      setPlayheadMs(next);
      if (next >= session.durationMs) {
        onComplete?.();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      const savedState = savedStateRef.current;
      if (savedState) {
        camera.position.copy(savedState.position);
        camera.quaternion.copy(savedState.quaternion);
        camera.fov = savedState.fov;
        camera.updateProjectionMatrix();
        if (controls) {
          controls.target.copy(savedState.target);
          controls.enabled = savedState.controlsEnabled;
          controls.update();
        }
      }
    };
  }, [camera, controlsRef, onComplete, session]);

  useEffect(() => {
    if (!session?.card) return;
    const cameraTrack = session.card.tracks?.camera?.[0];
    if (!cameraTrack) return;
    const sample = sampleCameraTrack(cameraTrack, playheadMs);
    camera.position.set(...(sample.position || [0, 7, 7]));
    camera.fov = sample.fov || 55;
    camera.updateProjectionMatrix();
    const controls = controlsRef?.current;
    if (controls) {
      controls.target.set(...(sample.target || [0, 0, 0]));
      controls.update();
    }
  }, [camera, controlsRef, playheadMs, session]);

  if (!session?.card) return null;

  return (
    <group>
      {(session.card.tracks?.objects || []).map((track) => {
        const alias = resolveRuntimeSquare(track.pieceSquare, session.eventParams, track.pieceSquare);
        const piece = pieceBySquare.get(alias || '');
        return <RuntimeObjectEntity key={track.id} track={track} piece={piece} sampled={objectStates[track.id]} />;
      })}
      {(session.card.tracks?.particles || []).map((track) => (
        <RuntimeParticleTrack key={track.id} track={track} card={session.card} eventParams={session.eventParams} objectStates={objectStates} playheadMs={playheadMs} />
      ))}
      {worldOverlayEntries.map(({ track, sample }) => (
        <RuntimeWorldOverlay key={track.id} track={track} sample={sample} eventParams={session.eventParams} card={session.card} />
      ))}
    </group>
  );
}

export function ArcanaStudioScreenOverlay({ session }) {
  const [playheadMs, setPlayheadMs] = useState(0);

  useEffect(() => {
    if (!session?.id) {
      setPlayheadMs(0);
      return undefined;
    }
    let frame = 0;
    const tick = () => {
      const elapsed = Math.max(0, performance.now() - session.startedAt);
      const next = Math.min(session.durationMs, elapsed);
      setPlayheadMs(next);
      if (next < session.durationMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [session]);

  const overlays = useMemo(() => getScreenOverlaySamples(session?.card, playheadMs), [playheadMs, session?.card]);
  if (!session?.card || overlays.length === 0) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9998 }}>
      {overlays.map(({ track, sample }) => {
        const style = {
          position: 'absolute',
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
          textShadow: '0 6px 18px rgba(0,0,0,0.5)',
          whiteSpace: 'pre-wrap',
        };

        if (track.type === 'image' && track.style?.imageUrl) {
          return <img key={track.id} alt={track.name} src={track.style.imageUrl} style={style} />;
        }

        return <div key={track.id} style={style}>{sample.text || track.content}</div>;
      })}
    </div>
  );
}