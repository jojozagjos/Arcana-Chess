import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Line } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ChessPiece } from '../../../components/ChessPiece.jsx';
import { sampleCameraTrack, sampleObjectTrack } from './arcanaStudioPlayback.js';
import { resolveRuntimeSquare } from './arcanaStudioRuntime.js';
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

function rotateBoardSpaceForBlack(vec3, myColor) {
  if (!Array.isArray(vec3) || vec3.length < 3) return [0, 0, 0];
  if (myColor !== 'black') return vec3;
  // Rotate 180 degrees around board center (origin in scene board-space).
  return [-(Number(vec3[0]) || 0), Number(vec3[1]) || 0, -(Number(vec3[2]) || 0)];
}

function resolveTrackRuntimeSquare(track, eventParams) {
  const explicitSquare = typeof track?.pieceSquare === 'string' ? track.pieceSquare.trim() : '';
  if (explicitSquare === 'target' || explicitSquare === 'source') {
    return resolveRuntimeSquare(explicitSquare, eventParams, explicitSquare);
  }

  const targetSquare = eventParams?.targetSquare || eventParams?.square || '';
  if (track?.type === 'piece' && targetSquare) {
    return resolveRuntimeSquare('target', eventParams, targetSquare);
  }

  return resolveRuntimeSquare(explicitSquare, eventParams, explicitSquare);
}

function resolveTrackStates(card, eventParams, boardPieces, timeMs, orientPosition) {
  const tracks = card?.tracks?.objects || [];
  const pieceBySquare = new Map(boardPieces.map((piece) => [piece.square, piece]));
  const trackById = new Map(tracks.map((track) => [track.id, track]));
  const resolved = {};
  const visiting = new Set();

  const resolveSquareAnchor = (track) => {
    const alias = resolveTrackRuntimeSquare(track, eventParams);
    const piece = pieceBySquare.get(alias || '');
    if (piece) return orientPosition(piece.targetPosition);
    if (alias && /^[a-h][1-8]$/i.test(alias)) {
      const [x, , z] = squareToPosition(alias);
      return orientPosition([x, 0.15, z]);
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
      anchorPosition: orientPosition(basePosition),
      worldPosition: orientPosition(worldPosition),
    };
    visiting.delete(trackId);
    return resolved[trackId];
  };

  tracks.forEach((track) => resolveTrack(track.id));
  return resolved;
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
  if (track?.type === 'piece') return null;
  const position = sampled?.worldPosition || sampled?.anchorPosition || piece?.targetPosition || DEFAULT_WORLD_ANCHOR;
  return (
    <group position={position} rotation={sampled?.rotation || [0, 0, 0]} scale={sampled?.scale || [1, 1, 1]}>
      <TrackFallbackMesh track={track} piece={piece} />
    </group>
  );
}

export function ArcanaStudioRuntimeHost({ session, controlsRef, myColor, onComplete, runtimePieces = null, onPieceMotionsChange = null }) {
  const { camera } = useThree();
  const savedStateRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  const cameraTransitionRef = useRef(null);
  const previousPlayheadRef = useRef(0);
  const [playheadMs, setPlayheadMs] = useState(0);
  const hasCameraTimeline = useMemo(
    () => (session?.card?.tracks?.camera || []).some((track) => (track?.keys || []).length > 0),
    [session?.card?.tracks?.camera],
  );
  const viewerFlip = myColor === 'black' ? -1 : 1;

  const orientPosition = (position) => {
    const source = Array.isArray(position) ? position : [0, 0, 0];
    return viewerFlip === -1 ? [-source[0], source[1], -source[2]] : source;
  };

  const orientRotation = (rotation) => {
    const source = Array.isArray(rotation) ? rotation : [0, 0, 0];
    return viewerFlip === -1 ? [source[0], source[1] + Math.PI, -source[2]] : source;
  };

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  const fallbackFenPieces = useMemo(() => {
    // Use runtime FEN from params if available (actual game board state),
    // otherwise fall back to card's preview FEN (for Studio editing)
    const runtimeFen = session?.eventParams?.fen;
    const fenToUse = runtimeFen || session?.card?.board?.fen;
    return parseFenPieces(fenToUse).map((piece) => ({
      ...piece,
      targetPosition: orientPosition(piece.targetPosition),
    }));
  }, [session?.card?.board?.fen, session?.eventParams?.fen]);
  const boardPieces = useMemo(() => {
    if (Array.isArray(runtimePieces) && runtimePieces.length > 0) {
      return runtimePieces
        .filter((piece) => piece && typeof piece.square === 'string' && Array.isArray(piece.targetPosition))
        .map((piece) => ({
          square: piece.square,
          type: piece.type,
          isWhite: piece.isWhite,
          targetPosition: orientPosition(piece.targetPosition),
        }));
    }
    return fallbackFenPieces;
  }, [runtimePieces, fallbackFenPieces]);
  const pieceBySquare = useMemo(() => new Map(boardPieces.map((piece) => [piece.square, piece])), [boardPieces]);
  const cameraAnchorPosition = useMemo(() => {
    const anchorMode = String(session?.eventParams?.cameraAnchorMode || 'auto').toLowerCase();
    if (anchorMode === 'board' || anchorMode === 'center') return null;

    const anchorSquare = resolveRuntimeSquare(
      session?.eventParams?.cameraAnchorSquare || session?.eventParams?.focusSquare || session?.eventParams?.targetSquare || session?.eventParams?.square,
      session?.eventParams,
      null,
    );

    if (!anchorSquare && anchorMode === 'piece') return [0, 0.15, 0];
    if (!anchorSquare) return null;
    const anchoredPiece = pieceBySquare.get(anchorSquare);
    if (anchoredPiece && Array.isArray(anchoredPiece.targetPosition)) {
      return orientPosition(anchoredPiece.targetPosition);
    }
    const [x, , z] = squareToPosition(anchorSquare);
    return orientPosition([x, 0.15, z]);
  }, [pieceBySquare, session?.eventParams?.cameraAnchorMode, session?.eventParams?.cameraAnchorSquare, session?.eventParams?.focusSquare, session?.eventParams?.square, session?.eventParams?.targetSquare]);
  const objectStates = useMemo(
    () => resolveTrackStates(session?.card, session?.eventParams, boardPieces, playheadMs, orientPosition),
    [session?.card, session?.eventParams, boardPieces, playheadMs, orientPosition],
  );

  useEffect(() => {
    if (typeof onPieceMotionsChange !== 'function') return undefined;
    if (!session?.card) {
      onPieceMotionsChange({});
      return undefined;
    }

    const nextMotions = {};
    (session.card.tracks?.objects || []).forEach((track) => {
      if (track?.type !== 'piece') return;
      const alias = resolveTrackRuntimeSquare(track, session.eventParams);
      if (!alias) return;
      const piece = pieceBySquare.get(alias);
      const sampled = objectStates?.[track.id];
      if (!piece || !sampled) return;

      const basePosition = Array.isArray(piece.targetPosition) ? piece.targetPosition : DEFAULT_WORLD_ANCHOR;
      const worldPosition = Array.isArray(sampled.worldPosition) ? sampled.worldPosition : basePosition;
      nextMotions[alias] = {
        active: true,
        mode: 'studio-runtime',
        positionOffset: [
          (worldPosition[0] || 0) - (basePosition[0] || 0),
          (worldPosition[1] || 0) - (basePosition[1] || 0),
          (worldPosition[2] || 0) - (basePosition[2] || 0),
        ],
        rotation: orientRotation(sampled.rotation || [0, 0, 0]),
        scale: sampled.scale || [1, 1, 1],
      };
    });

    onPieceMotionsChange(nextMotions);
    return () => {
      onPieceMotionsChange({});
    };
  }, [objectStates, onPieceMotionsChange, pieceBySquare, session]);
  useEffect(() => {
    if (!session?.id) {
      const savedState = savedStateRef.current;
      if (savedState) {
        const controls = controlsRef?.current;
        const startPosition = camera.position.clone();
        const startQuaternion = camera.quaternion.clone();
        const startTarget = controls?.target?.clone() || new THREE.Vector3(0, 0, 0);
        const startFov = camera.fov;
        const startTime = performance.now();
        const durationMs = 360;
        if (controls) controls.enabled = false;

        let frame = 0;
        const animateRestore = () => {
          const progress = Math.min(1, (performance.now() - startTime) / durationMs);
          const eased = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

          camera.position.lerpVectors(startPosition, savedState.position, eased);
          camera.quaternion.slerpQuaternions(startQuaternion, savedState.quaternion, eased);
          camera.fov = THREE.MathUtils.lerp(startFov, savedState.fov, eased);
          camera.updateProjectionMatrix();

          if (controls) {
            controls.target.lerpVectors(startTarget, savedState.target, eased);
            controls.update();
          }

          if (progress < 1) {
            frame = requestAnimationFrame(animateRestore);
            return;
          }

          if (controls) {
            controls.enabled = savedState.controlsEnabled;
            controls.update();
          }

          savedStateRef.current = null;
        };

        frame = requestAnimationFrame(animateRestore);
        setPlayheadMs(0);
        return () => {
          cancelAnimationFrame(frame);
          savedStateRef.current = null;
        };
      }
      setPlayheadMs(0);
      return undefined;
    }

    const controls = controlsRef?.current;
    if (hasCameraTimeline && !savedStateRef.current) {
      savedStateRef.current = {
        position: camera.position.clone(),
        quaternion: camera.quaternion.clone(),
        fov: camera.fov,
        target: controls?.target?.clone() || new THREE.Vector3(0, 0, 0),
        controlsEnabled: controls?.enabled ?? true,
      };
      if (controls) controls.enabled = false;
    }

    setPlayheadMs(0);
    let frame = 0;
    const tick = () => {
      const elapsed = Math.max(0, performance.now() - session.startedAt);
      const next = Math.min(session.durationMs, elapsed);
      setPlayheadMs(next);
      if (next >= session.durationMs) {
        onCompleteRef.current?.();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [camera, controlsRef, hasCameraTimeline, session?.id]);

  useEffect(() => {
    if (!session?.card || !hasCameraTimeline) return;
    const cameraTrack = (session.card.tracks?.camera || []).find((track) => (track?.keys || []).length > 0);
    if (!cameraTrack) return;

    // Treat reverse jumps as scrubbing. Forward playback cadence can vary by FPS
    // and should not trigger transition mode.
    const playheadDelta = playheadMs - previousPlayheadRef.current;
    const isScrubbing = playheadDelta < -1;
    previousPlayheadRef.current = playheadMs;

    const sample = sampleCameraTrack(cameraTrack, playheadMs);
    const targetOffset = cameraAnchorPosition || null;
    const basePosition = sample.position || [0, 7, 7];
    const baseTarget = sample.target || [0, 0, 0];
    const targetPosition = targetOffset ? addVec3(basePosition, targetOffset) : basePosition;
    const targetCameraTarget = targetOffset ? addVec3(baseTarget, targetOffset) : baseTarget;
    const orientedTargetPosition = orientPosition(targetPosition);
    const orientedCameraTarget = orientPosition(targetCameraTarget);
    const targetFov = sample.fov || 55;

    const controls = controlsRef?.current;

    // If scrubbing, animate smoothly; otherwise snap
    if (isScrubbing) {
      // Cancel any existing transition
      if (cameraTransitionRef.current?.frameId) {
        cancelAnimationFrame(cameraTransitionRef.current.frameId);
      }

      const startPosition = camera.position.clone();
      const startQuaternion = camera.quaternion.clone();
      const startFov = camera.fov;
      const startTarget = controls?.target?.clone() || new THREE.Vector3(0, 0, 0);
      const startTime = performance.now();
      const durationMs = 200; // Scrubbing animation duration (slower, ~200ms)
      const targetPositionVec = new THREE.Vector3(...orientedTargetPosition);
      const targetCameraTargetVec = new THREE.Vector3(...orientedCameraTarget);

      const targetQuaternion = new THREE.Quaternion();
      const lookAtMatrix = new THREE.Matrix4();
      lookAtMatrix.lookAt(targetPositionVec, targetCameraTargetVec, camera.up);
      targetQuaternion.setFromRotationMatrix(lookAtMatrix);

      const animateToTarget = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / durationMs);

        // Easing: easeInOutCubic for smooth acceleration/deceleration
        const eased = progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        camera.position.lerpVectors(startPosition, targetPositionVec, eased);
        camera.quaternion.slerpQuaternions(startQuaternion, targetQuaternion, eased);
        camera.fov = THREE.MathUtils.lerp(startFov, targetFov, eased);
        camera.updateProjectionMatrix();

        if (controls) {
          controls.target.lerpVectors(startTarget, targetCameraTargetVec, eased);
          controls.update();
        }

        if (progress < 1) {
          cameraTransitionRef.current.frameId = requestAnimationFrame(animateToTarget);
        } else {
          cameraTransitionRef.current = null;
        }
      };

      cameraTransitionRef.current = { frameId: requestAnimationFrame(animateToTarget) };
    } else {
      // Not scrubbing - apply immediately (playback is running)
      // Position
      camera.position.set(...orientedTargetPosition);
      
      // FOV
      camera.fov = targetFov;

      // Keep camera orientation target-driven to match Studio preview.
      if (!controls) {
        camera.lookAt(...orientedCameraTarget);
      }

      camera.updateProjectionMatrix();

      if (controls) {
        // Always update controls to look at the target
        controls.target.set(...orientedCameraTarget);
        controls.update();
      }
    }

    return () => {
      if (cameraTransitionRef.current?.frameId) {
        cancelAnimationFrame(cameraTransitionRef.current.frameId);
      }
    };
  }, [camera, cameraAnchorPosition, controlsRef, hasCameraTimeline, myColor, playheadMs, session]);

  if (!session?.card) return null;

  const objectTracks = session.card.tracks?.objects || [];

  return (
    <group>
      {objectTracks.map((track) => {
        const alias = resolveTrackRuntimeSquare(track, session.eventParams);
        const piece = pieceBySquare.get(alias || '');
        const sampled = objectStates[track.id];
        return <RuntimeObjectEntity key={track.id} track={track} piece={piece} sampled={sampled} />;
      })}
    </group>
  );
}

export function ArcanaStudioScreenOverlay({ session }) {
  return null;
}