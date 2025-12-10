/**
 * Shared helper components and utilities for arcana visuals
 * Used by both GameScene and CardBalancingToolV2
 */
import React, { useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ChessPiece } from '../../components/ChessPiece';

// Helper to convert square notation to 3D position
export function squareToPosition(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = 8 - parseInt(square[1]);
  const x = file - 3.5;
  const z = rank - 3.5;
  return [x, 0, z];
}

// Ghost piece for Temporal Echo
export function GhostPiece({ type, isWhite, fromSquare, toSquare, delay = 0 }) {
  const groupRef = useRef();
  const [progress, setProgress] = useState(0);

  useFrame((state, delta) => {
    if (progress < 1) {
      setProgress(prev => Math.min(prev + delta * 0.3, 1));
    }
    if (groupRef.current && progress > delay) {
      const t = (progress - delay) / (1 - delay);
      groupRef.current.position.y = Math.sin(t * Math.PI) * 0.5;
    }
  });

  const fromFile = fromSquare.charCodeAt(0) - 97;
  const fromRank = 8 - parseInt(fromSquare[1]);
  const toFile = toSquare.charCodeAt(0) - 97;
  const toRank = 8 - parseInt(toSquare[1]);

  const t = Math.max(0, (progress - delay) / (1 - delay));
  const x = (fromFile - 3.5) + ((toFile - fromFile) * t);
  const z = (fromRank - 3.5) + ((toRank - fromRank) * t);

  return (
    <group position={[x, 0.15, z]} ref={groupRef}>
      <ChessPiece
        type={type}
        isWhite={isWhite}
        targetPosition={[0, 0, 0]}
      />
      <mesh>
        <boxGeometry args={[0.6, 0.6, 0.6]} />
        <meshStandardMaterial
          color={isWhite ? '#d8dee9' : '#2e3440'}
          transparent
          opacity={0.3 * (1 - t)}
          emissive={isWhite ? '#88c0d0' : '#5e81ac'}
          emissiveIntensity={0.5}
        />
      </mesh>
    </group>
  );
}

// Camera movement controller for cutscenes
export function CameraController({ targetPosition, onComplete, active }) {
  const { camera } = useThree();
  const startPos = useRef(null);
  const progress = useRef(0);

  useFrame((state, delta) => {
    if (!active) return;

    if (!startPos.current) {
      startPos.current = camera.position.clone();
    }

    progress.current += delta * 0.5;

    if (progress.current >= 1) {
      camera.position.copy(targetPosition);
      if (onComplete) onComplete();
      return;
    }

    const t = progress.current;
    const easeT = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    camera.position.lerpVectors(startPos.current, targetPosition, easeT);
    camera.lookAt(0, 0, 0);
  });

  return null;
}

// Grayscale post-processing effect
export function GrayscaleEffect({ intensity }) {
  const { scene } = useThree();
  
  React.useEffect(() => {
    if (intensity > 0) {
      scene.fog = new THREE.Fog(0x808080, 10, 50);
    } else {
      scene.fog = null;
    }
    return () => {
      scene.fog = null;
    };
  }, [intensity, scene]);

  return null;
}
