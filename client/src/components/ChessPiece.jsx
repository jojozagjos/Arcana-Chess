import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export function ChessPiece({ type, isWhite, targetPosition, square }) {
  const color = isWhite ? '#eceff4' : '#2e3440';
  const emissive = isWhite ? '#d8dee9' : '#1a1d28';
  const groupRef = useRef();
  const currentPos = useRef(targetPosition.slice());

  // Smooth lerp animation
  useFrame(() => {
    if (groupRef.current) {
      const lerpFactor = 0.15; // Adjust for speed (0.1 = slower, 0.3 = faster)
      currentPos.current[0] += (targetPosition[0] - currentPos.current[0]) * lerpFactor;
      currentPos.current[1] += (targetPosition[1] - currentPos.current[1]) * lerpFactor;
      currentPos.current[2] += (targetPosition[2] - currentPos.current[2]) * lerpFactor;
      groupRef.current.position.set(...currentPos.current);
    }
  });

  return (
    <group ref={groupRef} position={targetPosition} castShadow>
      {type === 'p' && <PawnGeometry color={color} emissive={emissive} />}
      {type === 'r' && <RookGeometry color={color} emissive={emissive} />}
      {type === 'n' && <KnightGeometry color={color} emissive={emissive} />}
      {type === 'b' && <BishopGeometry color={color} emissive={emissive} />}
      {type === 'q' && <QueenGeometry color={color} emissive={emissive} />}
      {type === 'k' && <KingGeometry color={color} emissive={emissive} />}
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
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.3, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.22, 0.2, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      {/* Crenellations */}
      <mesh position={[0.15, 0.55, 0]} castShadow>
        <boxGeometry args={[0.1, 0.15, 0.1]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[-0.15, 0.55, 0]} castShadow>
        <boxGeometry args={[0.1, 0.15, 0.1]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.55, 0.15]} castShadow>
        <boxGeometry args={[0.1, 0.15, 0.1]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
      <mesh position={[0, 0.55, -0.15]} castShadow>
        <boxGeometry args={[0.1, 0.15, 0.1]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.4} roughness={0.5} />
      </mesh>
    </>
  );
}

function KnightGeometry({ color, emissive }) {
  return (
    <>
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.27, 0.3, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.27, 0.2, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Horse head approximation */}
      <mesh position={[0.1, 0.4, 0]} rotation={[0, 0, Math.PI / 6]} castShadow>
        <boxGeometry args={[0.15, 0.4, 0.2]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[0.15, 0.6, 0.05]} castShadow>
        <boxGeometry args={[0.1, 0.15, 0.12]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.1} metalness={0.3} roughness={0.6} />
      </mesh>
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
      <mesh position={[0, 0, 0]} castShadow>
        <cylinderGeometry args={[0.28, 0.32, 0.15, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.15, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.28, 0.3, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.24, 0.2, 0.2, 16]} />
        <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.15} metalness={0.5} roughness={0.4} />
      </mesh>
      {/* Crown points */}
      {[0, 1, 2, 3, 4].map((i) => {
        const angle = (i / 5) * Math.PI * 2;
        const x = Math.cos(angle) * 0.18;
        const z = Math.sin(angle) * 0.18;
        return (
          <mesh key={i} position={[x, 0.65, z]} castShadow>
            <coneGeometry args={[0.06, 0.2, 8]} />
            <meshStandardMaterial color={color} emissive={emissive} emissiveIntensity={0.2} metalness={0.6} roughness={0.3} />
          </mesh>
        );
      })}
      <mesh position={[0, 0.8, 0]} castShadow>
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
