import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export function ChessPiece({ type, isWhite, targetPosition, square, isMirrorDuplicate = false, onClickSquare, cutsceneMotion = null }) {
  const color = isWhite ? '#eceff4' : '#2e3440';
  const emissive = isWhite ? '#d8dee9' : '#1a1d28';
  const groupRef = useRef();
  // Ensure we have a valid position array to avoid slice() errors when data is missing
  const safeTarget = Array.isArray(targetPosition) && targetPosition.length === 3 ? targetPosition : [0, 0, 0];
  const currentPos = useRef(safeTarget.slice());

  // Smooth lerp animation
  useFrame((state) => {
    if (groupRef.current) {
      const lerpFactor = 0.15; // Adjust for speed (0.1 = slower, 0.3 = faster)
      const tgt = Array.isArray(targetPosition) && targetPosition.length === 3 ? targetPosition : safeTarget;
      currentPos.current[0] += (tgt[0] - currentPos.current[0]) * lerpFactor;
      currentPos.current[1] += (tgt[1] - currentPos.current[1]) * lerpFactor;
      currentPos.current[2] += (tgt[2] - currentPos.current[2]) * lerpFactor;

      let x = currentPos.current[0];
      let y = currentPos.current[1];
      let z = currentPos.current[2];

      if (cutsceneMotion?.active) {
        const t = state.clock.elapsedTime;
        const intensity = Math.max(0.05, cutsceneMotion.intensity || 0.18);
        const profile = cutsceneMotion.profile || 'pulse';
        const phase = cutsceneMotion.phase || 0;

        if (profile === 'overdrive') {
          y += Math.sin(t * 20 + phase) * intensity * 0.22 + intensity * 0.16;
          x += Math.cos(t * 16 + phase) * intensity * 0.05;
          z += Math.sin(t * 14 + phase) * intensity * 0.05;
          groupRef.current.rotation.x = Math.sin(t * 24 + phase) * 0.06;
          groupRef.current.rotation.z = Math.cos(t * 20 + phase) * 0.05;
          groupRef.current.rotation.y = Math.sin(t * 18 + phase) * 0.04;
        } else if (profile === 'fracture') {
          y += Math.abs(Math.sin(t * 14 + phase)) * intensity * 0.12;
          x += Math.sin(t * 30 + phase) * intensity * 0.07;
          z += Math.cos(t * 28 + phase) * intensity * 0.07;
          groupRef.current.rotation.x = Math.sin(t * 22 + phase) * 0.05;
          groupRef.current.rotation.z = Math.cos(t * 19 + phase) * 0.05;
          groupRef.current.rotation.y = Math.sin(t * 12 + phase) * 0.03;
        } else {
          y += Math.sin(t * 8 + phase) * intensity * 0.16;
          groupRef.current.rotation.x = Math.sin(t * 6 + phase) * 0.03;
          groupRef.current.rotation.z = Math.cos(t * 6 + phase) * 0.03;
          groupRef.current.rotation.y = 0;
        }
      } else {
        groupRef.current.rotation.set(0, 0, 0);
      }

      groupRef.current.position.set(x, y, z);
    }
  });

  return (
    <group
      ref={groupRef}
      position={currentPos.current}
      castShadow
      onPointerDown={(e) => {
        e.stopPropagation();
        if (typeof onClickSquare === 'function') onClickSquare(square);
      }}
    >
      {type === 'p' && <PawnGeometry color={color} emissive={emissive} />}
      {type === 'r' && <RookGeometry color={color} emissive={emissive} />}
      {type === 'n' && <KnightGeometry color={color} emissive={emissive} isWhite={isWhite} />}
      {type === 'b' && <BishopGeometry color={color} emissive={emissive} />}
      {type === 'q' && <QueenGeometry color={color} emissive={emissive} />}
      {type === 'k' && <KingGeometry color={color} emissive={emissive} />}

      {isMirrorDuplicate && (
        <group position={[0, 1.02, 0]}>
          <mesh>
            <torusGeometry args={[0.14, 0.028, 10, 24]} />
            <meshStandardMaterial
              color="#d7a7ff"
              emissive="#8f3cff"
              emissiveIntensity={1.1}
              metalness={0.25}
              roughness={0.35}
            />
          </mesh>
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.04, 12, 10]} />
            <meshStandardMaterial
              color="#f0d6ff"
              emissive="#b566ff"
              emissiveIntensity={1.2}
              metalness={0.2}
              roughness={0.25}
            />
          </mesh>
        </group>
      )}
    </group>
  );
}

function PawnGeometry({ color, emissive }) {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.28, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.25, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <sphereGeometry args={[0.15, 16, 12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
    </>
  );
}

function RookGeometry({ color, emissive }) {
  return (
    <>
      {/* Base */}
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.3, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Middle body */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Upper tower */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.22, 0.2, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Castle wall ring (connects the battlements) */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.25, 0.08, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Battlements (8 around the circle for classic castle look) */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const angle = (i / 8) * Math.PI * 2;
        const x = Math.cos(angle) * 0.22;
        const z = Math.sin(angle) * 0.22;
        return (
          <mesh key={i} position={[x, 0.58, z]} castShadow>
            <boxGeometry args={[0.08, 0.12, 0.08]} />
            <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
          </mesh>
        );
      })}
    </>
  );
}

function KnightGeometry({ color, emissive, isWhite }) {
  const yRot = isWhite ? Math.PI / 2 : -Math.PI / 2;
  return (
    <>
      {/* Rotate entire knight to face the correct side depending on color */}
      <group rotation={[0, yRot, 0]}>
      {/* Base */}
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.3, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Lower body */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.27, 0.2, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Neck (straight, no odd angle) */}
      <mesh position={[0, 0.35, 0]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.115, 0.15, 0.24, 12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.12} metalness={0.32} roughness={0.58} />
      </mesh>
      {/* Skull - smooth rounded head instead of a block */}
      <mesh position={[0.0, 0.56, 0]} rotation={[0, 0, 0]} castShadow>
        <sphereGeometry args={[0.11, 20, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.12} metalness={0.33} roughness={0.56} />
      </mesh>
      {/* Snout/muzzle - elongated but not blocky */}
      <mesh position={[0.12, 0.55, 0]} rotation={[0, 0, 0]} castShadow>
        <boxGeometry args={[0.12, 0.12, 0.12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.32} roughness={0.58} />
      </mesh>
      {/* Small bevel on snout to avoid blocky look */}
      <mesh position={[0.19, 0.55, 0]} rotation={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.12, 12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.08} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Ears (attached and slightly tilted) */}
      <mesh position={[-0.07, 0.67, -0.05]} rotation={[-Math.PI / 8, 0, Math.PI / 12]} castShadow>
        <coneGeometry args={[0.045, 0.12, 8]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.12} metalness={0.3} roughness={0.55} />
      </mesh>
      <mesh position={[-0.07, 0.67, 0.05]} rotation={[Math.PI / 12, 0, Math.PI / 12]} castShadow>
        <coneGeometry args={[0.045, 0.12, 8]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.12} metalness={0.3} roughness={0.55} />
      </mesh>
      {/* Mane detail - subtle curved panel behind the skull */}
      <mesh position={[-0.10, 0.55, 0]} rotation={[0, 0, -Math.PI / 10]} castShadow>
        <boxGeometry args={[0.06, 0.18, 0.12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.14} metalness={0.35} roughness={0.5} />
      </mesh>
      </group>
    </>
  );
}

function BishopGeometry({ color, emissive }) {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.3, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.27, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.18, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.35} roughness={0.55} />
      </mesh>
      <mesh position={[0, 0.65, 0]} castShadow>
        <sphereGeometry args={[0.12, 16, 12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.35} roughness={0.55} />
      </mesh>
      {/* Bishop's slit */}
      <mesh position={[0, 0.72, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[0.04, 0.02, 8, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} metalness={0.5} roughness={0.4} />
      </mesh>
    </>
  );
}

function QueenGeometry({ color, emissive }) {
  return (
    <>
      {/* Base */}
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Middle body */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Upper body */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.2, 0.2, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Crown base ring (connects crown points - prevents floating) */}
      <mesh position={[0, 0.52, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.24, 0.08, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Crown points (attached to base ring) */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i / 5) * Math.PI * 2;
        const x = Math.cos(angle) * 0.18;
        const z = Math.sin(angle) * 0.18;
        return (
          <mesh key={i} position={[x, 0.62, z]} castShadow>
            <coneGeometry args={[0.06, 0.22, 8]} />
            <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} metalness={0.6} roughness={0.3} />
          </mesh>
        );
      })}
      {/* Top sphere */}
      <mesh position={[0, 0.78, 0]} castShadow>
        <sphereGeometry args={[0.08, 16, 12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} metalness={0.6} roughness={0.3} />
      </mesh>
    </>
  );
}

function KingGeometry({ color, emissive }) {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.2, 0.25, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Cross on top */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[0.08, 0.3, 0.08]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} metalness={0.6} roughness={0.3} />
      </mesh>
      <mesh position={[0, 0.78, 0]} castShadow>
        <boxGeometry args={[0.2, 0.08, 0.08]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} metalness={0.6} roughness={0.3} />
      </mesh>
    </>
  );
}
