/**
 * Shared visual effects for arcana cards
 * Used by both GameScene and CardBalancingToolV2 to ensure consistency
 */
import React, { useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { squareToPosition } from './sharedHelpers.jsx';

// ===== PERSISTENT EFFECTS (shown on board during gameplay) =====

export function ShieldGlowEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Glowing shield around piece */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 0.8, 16, 1, true]} />
        <meshStandardMaterial
          emissive="#4c566a"
          emissiveIntensity={1.5}
          color="#4c566a"
          transparent
          opacity={0.4}
          side={2}
        />
      </mesh>
    </group>
  );
}

export function IronFortressEffect({ kingSquare }) {
  if (!kingSquare) return null;
  
  const [x, , z] = squareToPosition(kingSquare);
  
  return (
    <group position={[x, 0, z]}>
      {/* Fortress walls around king */}
      {[0, 1, 2, 3].map(i => {
        const angle = (i / 4) * Math.PI * 2;
        const wallX = Math.cos(angle) * 0.6;
        const wallZ = Math.sin(angle) * 0.6;
        return (
          <mesh key={i} position={[wallX, 0.4, wallZ]} rotation={[0, angle, 0]}>
            <boxGeometry args={[0.1, 0.8, 0.5]} />
            <meshStandardMaterial
              color="#5e81ac"
              emissive="#5e81ac"
              emissiveIntensity={0.8}
              metalness={0.8}
              roughness={0.2}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function BishopsBlessingEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Holy light beam */}
      <mesh position={[0, 2, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 4, 16, 1, true]} />
        <meshStandardMaterial
          emissive="#ebcb8b"
          emissiveIntensity={2}
          color="#ebcb8b"
          transparent
          opacity={0.6}
        />
      </mesh>
      <pointLight position={[0, 1, 0]} intensity={2} color="#ebcb8b" distance={3} />
    </group>
  );
}

export function SanctuaryEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Glowing dome */}
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.5, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          emissive="#a3be8c"
          emissiveIntensity={1.5}
          color="#a3be8c"
          transparent
          opacity={0.3}
          side={2}
        />
      </mesh>
    </group>
  );
}

export function CursedSquareEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Dark pulsing energy */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.5, 32]} />
        <meshStandardMaterial
          emissive="#bf616a"
          emissiveIntensity={2}
          color="#bf616a"
          transparent
          opacity={0.6}
        />
      </mesh>
    </group>
  );
}

export function MirrorImageEffect({ square, pieceType }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  
  return (
    <group position={[x, 0, z]}>
      {/* Shimmering ghost outline */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.4, 16, 16]} />
        <meshStandardMaterial
          emissive="#88c0d0"
          emissiveIntensity={1.5}
          color="#88c0d0"
          transparent
          opacity={0.3}
          wireframe
        />
      </mesh>
    </group>
  );
}

export function PoisonCloudEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const groupRef = useRef();
  
  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.5;
    }
  });
  
  return (
    <group position={[x, 0, z]} ref={groupRef}>
      {/* Toxic green smoke */}
      {[...Array(6)].map((_, i) => {
        const angle = (i / 6) * Math.PI * 2;
        const radius = 0.3;
        return (
          <mesh key={i} position={[Math.cos(angle) * radius, 0.3, Math.sin(angle) * radius]}>
            <sphereGeometry args={[0.15, 8, 8]} />
            <meshStandardMaterial
              emissive="#a3be8c"
              emissiveIntensity={2}
              color="#a3be8c"
              transparent
              opacity={0.4}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ===== CUTSCENE EFFECTS (one-time animations) =====

export function ExecutionCutscene({ targetSquare, square, onComplete }) {
  const sq = targetSquare || square;
  if (!sq) return null;
  
  const [x, , z] = squareToPosition(sq);
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.5;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group position={[x, 0, z]}>
      {/* Lightning bolt from above */}
      <mesh position={[0, 3 - progress * 3, 0]}>
        <cylinderGeometry args={[0.05, 0.15, 6, 8]} />
        <meshStandardMaterial
          emissive="#ebcb8b"
          emissiveIntensity={4}
          color="#ebcb8b"
          transparent
          opacity={1 - progress}
        />
      </mesh>
      {/* Impact ring */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1 + progress, 1 + progress, 1]}>
        <ringGeometry args={[0.3, 0.7, 32]} />
        <meshStandardMaterial
          emissive="#bf616a"
          emissiveIntensity={3}
          color="#bf616a"
          transparent
          opacity={1 - progress}
        />
      </mesh>
      <pointLight position={[0, 1, 0]} intensity={5 * (1 - progress)} color="#ebcb8b" />
    </group>
  );
}

export function SacrificeEffect({ square, onComplete }) {
  if (!square) return null;
  
  const groupRef = useRef();
  const [progress, setProgress] = useState(0);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.8;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });

    if (groupRef.current) {
      groupRef.current.position.y = -progress * 1.5;
      groupRef.current.rotation.y = progress * Math.PI * 2;
    }
  });

  const [x, , z] = squareToPosition(square);

  return (
    <group position={[x, 0, z]} ref={groupRef}>
      {/* Purple fire particles */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const radius = 0.3 + Math.sin(progress * Math.PI) * 0.2;
        return (
          <mesh key={i} position={[Math.cos(angle) * radius, progress * 0.5, Math.sin(angle) * radius]}>
            <sphereGeometry args={[0.08, 8, 8]} />
            <meshStandardMaterial
              color="#a855f7"
              emissive="#c084fc"
              emissiveIntensity={2}
              transparent
              opacity={1 - progress}
            />
          </mesh>
        );
      })}
      <pointLight position={[0, 0.5, 0]} intensity={3 * (1 - progress)} color="#a855f7" distance={3} />
    </group>
  );
}

export function TimeTravelCutscene({ onComplete }) {
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.3;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group>
      {/* Clockface particles spinning */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2 + progress * Math.PI * 4;
        const radius = 3;
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;
        return (
          <mesh key={i} position={[x, 2, z]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial
              emissive="#88c0d0"
              emissiveIntensity={3}
              color="#88c0d0"
              transparent
              opacity={1 - progress}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function MindControlCutscene({ targetSquare, square, onComplete }) {
  const sq = targetSquare || square;
  if (!sq) return null;
  
  const [x, , z] = squareToPosition(sq);
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.5;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group position={[x, 0, z]}>
      {/* Purple tendrils */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const dx = Math.cos(angle) * 0.3;
        const dz = Math.sin(angle) * 0.3;
        return (
          <mesh key={i} position={[dx, 0.5 + progress * 0.5, dz]} rotation={[0, angle, Math.PI / 6]}>
            <cylinderGeometry args={[0.02, 0.05, 1.2, 6]} />
            <meshStandardMaterial
              emissive="#b48ead"
              emissiveIntensity={2.5}
              color="#b48ead"
              transparent
              opacity={1 - progress}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function DivineInterventionCutscene({ kingSquare, square, onComplete }) {
  const sq = kingSquare || square;
  if (!sq) return null;
  
  const [x, , z] = squareToPosition(sq);
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.4;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group position={[x, 0, z]}>
      {/* Angelic wings */}
      <mesh position={[-0.5, 1, 0]} rotation={[0, 0, Math.PI / 6 * (1 - progress)]}>
        <planeGeometry args={[1.2, 0.8]} />
        <meshStandardMaterial
          emissive="#eceff4"
          emissiveIntensity={2}
          color="#eceff4"
          transparent
          opacity={1 - progress}
          side={2}
        />
      </mesh>
      <mesh position={[0.5, 1, 0]} rotation={[0, 0, -Math.PI / 6 * (1 - progress)]}>
        <planeGeometry args={[1.2, 0.8]} />
        <meshStandardMaterial
          emissive="#eceff4"
          emissiveIntensity={2}
          color="#eceff4"
          transparent
          opacity={1 - progress}
          side={2}
        />
      </mesh>
      <pointLight position={[0, 1.5, 0]} intensity={4 * (1 - progress)} color="#eceff4" />
    </group>
  );
}

export function RebirthBeam({ targetSquare, square, onComplete }) {
  const sq = targetSquare || square;
  if (!sq) return null;
  
  const [x, , z] = squareToPosition(sq);
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.6;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group position={[x, 0, z]}>
      {/* Light beam from sky */}
      <mesh position={[0, 5 - progress * 5, 0]}>
        <cylinderGeometry args={[0.3, 0.3, 10, 16]} />
        <meshStandardMaterial
          emissive="#a3be8c"
          emissiveIntensity={3}
          color="#a3be8c"
          transparent
          opacity={0.7 * (1 - progress)}
        />
      </mesh>
      <pointLight position={[0, 0.5, 0]} intensity={5 * (1 - progress)} color="#a3be8c" />
    </group>
  );
}

export function ChainLightningEffect({ origin, targets, squares, chained, onComplete }) {
  const targetList = targets || squares || chained;
  if (!origin && (!targetList || targetList.length === 0)) return null;
  
  // If no origin but we have targets, use first target as origin
  const originSquare = origin || (targetList && targetList[0]);
  const targetSquares = origin ? targetList : (targetList && targetList.slice(1)) || [];
  
  if (!originSquare || !targetSquares || targetSquares.length === 0) return null;
  
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.7;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  const [originX, , originZ] = squareToPosition(originSquare);
  
  return (
    <group>
      {targetSquares.map((target, i) => {
        const [targetX, , targetZ] = squareToPosition(target);
        const midX = (originX + targetX) / 2;
        const midZ = (originZ + targetZ) / 2;
        const delay = i * 0.3;
        const localProgress = Math.max(0, Math.min(1, (progress - delay) / 0.3));
        
        return (
          <group key={target}>
            <mesh position={[midX, 0.5, midZ]}>
              <cylinderGeometry args={[0.03, 0.03, Math.hypot(targetX - originX, targetZ - originZ), 8]} />
              <meshStandardMaterial
                emissive="#81a1c1"
                emissiveIntensity={4 * (1 - localProgress)}
                color="#81a1c1"
                transparent
                opacity={1 - localProgress}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export function PromotionRitualEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.5;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group position={[x, 0, z]}>
      {/* Ascending crown */}
      <mesh position={[0, progress * 2, 0]} rotation={[0, progress * Math.PI * 2, 0]}>
        <torusGeometry args={[0.3, 0.05, 8, 16]} />
        <meshStandardMaterial
          emissive="#d08770"
          emissiveIntensity={3}
          color="#d08770"
          transparent
          opacity={1 - progress}
        />
      </mesh>
      <pointLight position={[0, progress * 2, 0]} intensity={3 * (1 - progress)} color="#d08770" />
    </group>
  );
}

export function MetamorphosisEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.6;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group position={[x, 0, z]}>
      {/* Swirling transformation particles */}
      {[...Array(16)].map((_, i) => {
        const angle = (i / 16) * Math.PI * 2 + progress * Math.PI * 4;
        const radius = 0.4 * (1 - progress);
        const height = Math.sin(progress * Math.PI) * 1.5;
        return (
          <mesh key={i} position={[Math.cos(angle) * radius, height, Math.sin(angle) * radius]}>
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial
              emissive="#b48ead"
              emissiveIntensity={2}
              color="#b48ead"
              transparent
              opacity={1 - progress}
            />
          </mesh>
        );
      })}
    </group>
  );
}

export function TimeFreezeEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.4;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group>
      {/* Ice crystals spreading across board */}
      {[...Array(20)].map((_, i) => {
        const x = (Math.random() - 0.5) * 8;
        const z = (Math.random() - 0.5) * 8;
        const delay = (i / 20) * 0.5;
        const localProgress = Math.max(0, Math.min(1, (progress - delay) / 0.5));
        
        return (
          <mesh key={i} position={[x, 0.1, z]} rotation={[0, Math.random() * Math.PI, 0]}>
            <coneGeometry args={[0.1, 0.3, 6]} />
            <meshStandardMaterial
              emissive="#88c0d0"
              emissiveIntensity={2 * (1 - localProgress)}
              color="#88c0d0"
              transparent
              opacity={1 - localProgress}
            />
          </mesh>
        );
      })}
    </group>
  );
}
