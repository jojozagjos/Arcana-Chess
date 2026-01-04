// Shared helper functions for arcana visual effects
import React, { useRef, useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Vector3, Color } from 'three';

/**
 * Convert chess square notation to 3D board position
 * @param {string} square - Chess square notation (e.g., 'e4')
 * @returns {[number, number, number]} - [x, y, z] position
 */
export function squareToPosition(square) {
  if (!square || square.length < 2) return [0, 0, 0];
  
  const file = square.charCodeAt(0) - 97; // 'a' = 0, 'h' = 7
  const rank = 8 - parseInt(square[1]);    // '8' = 0, '1' = 7
  
  // Center the board: file/rank go from -3.5 to 3.5
  const x = file - 3.5;
  const z = rank - 3.5;
  
  return [x, 0, z];
}

/**
 * Convert board position to chess square notation
 * @param {number} x - X position
 * @param {number} z - Z position
 * @returns {string} - Chess square notation
 */
export function positionToSquare(x, z) {
  const file = Math.round(x + 3.5);
  const rank = 8 - Math.round(z + 3.5);
  
  if (file < 0 || file > 7 || rank < 1 || rank > 8) {
    return null;
  }
  
  return String.fromCharCode(97 + file) + rank;
}

/**
 * Ghost piece component for visualizing phantom moves
 */
export function GhostPiece({ type, isWhite, fromSquare, toSquare }) {
  const [fx, , fz] = squareToPosition(fromSquare);
  const [tx, , tz] = squareToPosition(toSquare);
  const meshRef = useRef();
  
  useFrame((state) => {
    if (meshRef.current) {
      const t = (Math.sin(state.clock.elapsedTime * 2) + 1) / 2;
      meshRef.current.position.x = fx + (tx - fx) * t;
      meshRef.current.position.z = fz + (tz - fz) * t;
      meshRef.current.material.opacity = 0.3 + Math.sin(state.clock.elapsedTime * 3) * 0.1;
    }
  });
  
  return (
    <mesh ref={meshRef} position={[fx, 0.5, fz]}>
      <boxGeometry args={[0.6, 0.6, 0.6]} />
      <meshStandardMaterial
        color={isWhite ? '#ffffff' : '#333333'}
        transparent
        opacity={0.3}
        emissive={isWhite ? '#aaaaff' : '#ffaaaa'}
        emissiveIntensity={0.5}
      />
    </mesh>
  );
}

/**
 * Camera controller for cutscene animations
 */
export function CameraController({ targetPosition, active, onComplete }) {
  const { camera } = useThree();
  const startPos = useRef(null);
  const progress = useRef(0);
  
  useEffect(() => {
    if (active && targetPosition) {
      startPos.current = camera.position.clone();
      progress.current = 0;
    }
  }, [active, targetPosition, camera]);
  
  useFrame((state, delta) => {
    if (!active || !targetPosition || !startPos.current) return;
    
    progress.current = Math.min(progress.current + delta * 0.8, 1);
    
    const t = progress.current;
    const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; // ease in-out quad
    
    camera.position.lerpVectors(startPos.current, new Vector3(...targetPosition), eased);
    camera.lookAt(0, 0, 0);
    
    if (progress.current >= 1 && onComplete) {
      onComplete();
    }
  });
  
  return null;
}

/**
 * Grayscale post-processing effect
 */
export function GrayscaleEffect({ intensity = 1.0 }) {
  // Simplified grayscale effect without postprocessing dependency
  // This is a placeholder - full implementation would require postprocessing
  return null;
}

// Re-export commonly used Three.js utilities for convenience
export { Vector3, Color };
