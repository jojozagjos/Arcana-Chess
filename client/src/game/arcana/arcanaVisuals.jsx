import React, { useState, useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { squareToPosition } from './sharedHelpers.jsx';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
const easeOutElastic = (t) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

// Generate points on a sphere
const spherePoint = (u, v) => {
  const theta = u * Math.PI * 2;
  const phi = v * Math.PI;
  return [
    Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta)
  ];
};

// ============================================================================
// SHIELD GLOW EFFECT - Magical protective barrier
// ============================================================================

export function ShieldGlowEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const groupRef = useRef();
  const innerRef = useRef();
  const outerRef = useRef();
  const runesRef = useRef();
  
  // Generate rune positions
  const runePositions = useMemo(() => {
    return [...Array(6)].map((_, i) => {
      const angle = (i / 6) * Math.PI * 2;
      return [Math.cos(angle) * 0.4, 0.5, Math.sin(angle) * 0.4];
    });
  }, []);
  
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.5;
    }
    
    if (innerRef.current) {
      const pulse = Math.sin(t * 4) * 0.08 + 1;
      innerRef.current.scale.set(pulse, 1, pulse);
      innerRef.current.material.opacity = 0.3 + Math.sin(t * 3) * 0.1;
    }
    
    if (outerRef.current) {
      outerRef.current.rotation.y = -t * 0.3;
      outerRef.current.material.opacity = 0.15 + Math.sin(t * 2) * 0.05;
    }
    
    if (runesRef.current) {
      runesRef.current.children.forEach((rune, i) => {
        const offset = (i / 6) * Math.PI * 2;
        rune.position.y = 0.5 + Math.sin(t * 2 + offset) * 0.1;
        rune.material.opacity = 0.6 + Math.sin(t * 3 + offset) * 0.3;
      });
    }
  });
  
  return (
    <group position={[x, 0, z]} ref={groupRef}>
      {/* Inner glowing cylinder */}
      <mesh ref={innerRef} position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 1, 32, 1, true]} />
        <meshStandardMaterial
          emissive="#4fc3f7"
          emissiveIntensity={2.5}
          color="#81d4fa"
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Outer rotating hexagonal shield */}
      <mesh ref={outerRef} position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.55, 0.55, 0.9, 6, 1, true]} />
        <meshStandardMaterial
          emissive="#29b6f6"
          emissiveIntensity={1.5}
          color="#4fc3f7"
          transparent
          opacity={0.2}
          wireframe
        />
      </mesh>
      
      {/* Floating rune particles */}
      <group ref={runesRef}>
        {runePositions.map((pos, i) => (
          <mesh key={i} position={pos}>
            <octahedronGeometry args={[0.08, 0]} />
            <meshStandardMaterial
              emissive="#e1f5fe"
              emissiveIntensity={3}
              color="#e1f5fe"
              transparent
              opacity={0.8}
            />
          </mesh>
        ))}
      </group>
      
      {/* Base glow ring */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.55, 32]} />
        <meshStandardMaterial
          emissive="#4fc3f7"
          emissiveIntensity={2}
          color="#4fc3f7"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Rising sparkles */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const radius = 0.3 + Math.random() * 0.2;
        return (
          <Sparkle
            key={i}
            position={[Math.cos(angle) * radius, 0, Math.sin(angle) * radius]}
            color="#e1f5fe"
            speed={0.8 + Math.random() * 0.4}
            delay={i * 0.1}
          />
        );
      })}
    </group>
  );
}

// Helper component for rising sparkle particles
function Sparkle({ position, color, speed = 1, delay = 0 }) {
  const ref = useRef();
  const startY = 0.1;
  const endY = 1.2;
  
  useFrame((state) => {
    if (ref.current) {
      const t = ((state.clock.elapsedTime * speed + delay) % 1.5) / 1.5;
      ref.current.position.y = startY + (endY - startY) * t;
      ref.current.material.opacity = t < 0.2 ? t * 5 : t > 0.8 ? (1 - t) * 5 : 1;
      const scale = 0.03 + Math.sin(t * Math.PI) * 0.02;
      ref.current.scale.set(scale, scale, scale);
    }
  });
  
  return (
    <mesh ref={ref} position={[position[0], startY, position[2]]}>
      <sphereGeometry args={[1, 8, 8]} />
      <meshStandardMaterial
        emissive={color}
        emissiveIntensity={4}
        color={color}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

// ============================================================================
// POISONED PIECE EFFECT - Toxic aura with dripping particles
// ============================================================================

export function PoisonedPieceEffect({ square, turnsLeft }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const groupRef = useRef();
  const auraRef = useRef();
  
  const urgency = turnsLeft === 1 ? 3 : turnsLeft === 2 ? 2 : 1.2;
  const baseColor = turnsLeft === 1 ? '#76ff03' : turnsLeft === 2 ? '#8bc34a' : '#558b2f';
  
  // Generate bubble positions
  const bubbles = useMemo(() => {
    return [...Array(8)].map(() => ({
      angle: Math.random() * Math.PI * 2,
      radius: 0.2 + Math.random() * 0.2,
      speed: 0.5 + Math.random() * 0.5,
      size: 0.04 + Math.random() * 0.04,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);
  
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.3 * urgency;
    }
    
    if (auraRef.current) {
      const pulse = Math.sin(t * 3 * urgency) * 0.1 + 1;
      auraRef.current.scale.set(pulse, 1, pulse);
    }
  });
  
  return (
    <group position={[x, 0, z]} ref={groupRef}>
      {/* Toxic aura cylinder */}
      <mesh ref={auraRef} position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.4, 0.35, 0.8, 16, 1, true]} />
        <meshStandardMaterial
          emissive={baseColor}
          emissiveIntensity={urgency * 1.5}
          color={baseColor}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Dripping poison effect */}
      {[...Array(6)].map((_, i) => (
        <PoisonDrip
          key={i}
          angle={(i / 6) * Math.PI * 2}
          radius={0.35}
          color={baseColor}
          speed={urgency}
          delay={i * 0.3}
        />
      ))}
      
      {/* Rising bubbles */}
      {bubbles.map((bubble, i) => (
        <PoisonBubble key={i} {...bubble} urgency={urgency} color={baseColor} />
      ))}
      
      {/* Skull indicator for final turn */}
      {turnsLeft === 1 && (
        <mesh position={[0, 0.9, 0]}>
          <octahedronGeometry args={[0.12, 0]} />
          <meshStandardMaterial
            emissive="#ff1744"
            emissiveIntensity={4}
            color="#ff1744"
            transparent
            opacity={0.9}
          />
        </mesh>
      )}
      
      {/* Base pool */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.4, 32]} />
        <meshStandardMaterial
          emissive={baseColor}
          emissiveIntensity={1}
          color={baseColor}
          transparent
          opacity={0.25}
        />
      </mesh>
    </group>
  );
}

function PoisonDrip({ angle, radius, color, speed, delay }) {
  const ref = useRef();
  
  useFrame((state) => {
    if (ref.current) {
      const t = ((state.clock.elapsedTime * speed + delay) % 2) / 2;
      const y = 0.8 - t * 0.7;
      ref.current.position.y = y;
      ref.current.material.opacity = t < 0.1 ? t * 10 : t > 0.9 ? (1 - t) * 10 : 0.7;
      ref.current.scale.y = 1 + t * 2;
    }
  });
  
  return (
    <mesh
      ref={ref}
      position={[Math.cos(angle) * radius, 0.8, Math.sin(angle) * radius]}
    >
      <sphereGeometry args={[0.03, 8, 8]} />
      <meshStandardMaterial
        emissive={color}
        emissiveIntensity={2}
        color={color}
        transparent
        opacity={0.7}
      />
    </mesh>
  );
}

function PoisonBubble({ angle, radius, speed, size, phase, urgency, color }) {
  const ref = useRef();
  
  useFrame((state) => {
    if (ref.current) {
      const t = ((state.clock.elapsedTime * speed * urgency + phase) % 1.5) / 1.5;
      const y = 0.1 + t * 0.8;
      ref.current.position.y = y;
      ref.current.position.x = Math.cos(angle + t * 2) * radius;
      ref.current.position.z = Math.sin(angle + t * 2) * radius;
      ref.current.material.opacity = Math.sin(t * Math.PI) * 0.6;
      const s = size * (1 + Math.sin(t * Math.PI) * 0.5);
      ref.current.scale.set(s / 0.05, s / 0.05, s / 0.05);
    }
  });
  
  return (
    <mesh ref={ref} position={[Math.cos(angle) * radius, 0.1, Math.sin(angle) * radius]}>
      <sphereGeometry args={[0.05, 8, 8]} />
      <meshStandardMaterial
        emissive={color}
        emissiveIntensity={3}
        color={color}
        transparent
        opacity={0.5}
      />
    </mesh>
  );
}

// ============================================================================
// SQUIRE SUPPORT EFFECT - Golden knight's protection
// ============================================================================

export function SquireSupportEffect({ square }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const groupRef = useRef();
  const shieldRef = useRef();
  
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    
    if (groupRef.current) {
      groupRef.current.rotation.y = t * 0.5;
    }
    
    if (shieldRef.current) {
      const pulse = Math.sin(t * 3) * 0.1 + 1;
      shieldRef.current.scale.set(pulse, pulse, pulse);
    }
  });
  
  return (
    <group position={[x, 0, z]} ref={groupRef}>
      {/* Golden aura */}
      <mesh ref={shieldRef} position={[0, 0.4, 0]}>
        <octahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial
          emissive="#ffd54f"
          emissiveIntensity={2}
          color="#ffca28"
          transparent
          opacity={0.25}
          wireframe
        />
      </mesh>
      
      {/* Inner glow */}
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial
          emissive="#fff59d"
          emissiveIntensity={1.5}
          color="#fff59d"
          transparent
          opacity={0.2}
        />
      </mesh>
      
      {/* Orbiting shields */}
      {[0, 120, 240].map((deg, i) => (
        <OrbitingShield key={i} baseAngle={deg} color="#ffc107" />
      ))}
      
      {/* Base ring */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshStandardMaterial
          emissive="#ffd54f"
          emissiveIntensity={2}
          color="#ffd54f"
          transparent
          opacity={0.5}
        />
      </mesh>
    </group>
  );
}

function OrbitingShield({ baseAngle, color }) {
  const ref = useRef();
  
  useFrame((state) => {
    if (ref.current) {
      const t = state.clock.elapsedTime;
      const angle = (baseAngle * Math.PI / 180) + t * 1.5;
      ref.current.position.x = Math.cos(angle) * 0.45;
      ref.current.position.z = Math.sin(angle) * 0.45;
      ref.current.position.y = 0.4 + Math.sin(t * 2 + baseAngle) * 0.1;
      ref.current.rotation.y = -angle;
    }
  });
  
  return (
    <mesh ref={ref}>
      <boxGeometry args={[0.08, 0.12, 0.02]} />
      <meshStandardMaterial
        emissive={color}
        emissiveIntensity={3}
        color={color}
        transparent
        opacity={0.8}
      />
    </mesh>
  );
}

// Animation effect version for one-time trigger
export function SquireSupportAnimationEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  const groupRef = useRef();
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.2;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 2;
    }
  });
  
  const scale = easeOutElastic(progress);
  const opacity = progress < 0.8 ? 1 : (1 - progress) * 5;
  
  return (
    <group position={[x, 0, z]} ref={groupRef} scale={[scale, scale, scale]}>
      <mesh position={[0, 0.4, 0]}>
        <octahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial
          emissive="#ffd54f"
          emissiveIntensity={3}
          color="#ffca28"
          transparent
          opacity={opacity * 0.4}
          wireframe
        />
      </mesh>
      
      {/* Burst particles */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const dist = progress * 0.8;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * dist, 0.4, Math.sin(angle) * dist]}
          >
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial
              emissive="#fff59d"
              emissiveIntensity={4}
              color="#fff59d"
              transparent
              opacity={opacity * 0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ============================================================================
// FOG OF WAR EFFECT - Dark mystical clouds (particles only, no ground plane)
// ============================================================================

export function FogOfWarEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const groupRef = useRef();
  
  // Generate cloud particles - more of them for better coverage
  const clouds = useMemo(() => {
    return [...Array(80)].map(() => ({
      x: (Math.random() - 0.5) * 12,
      z: (Math.random() - 0.5) * 12,
      y: 0.1 + Math.random() * 0.8,
      scale: 0.4 + Math.random() * 0.6,
      speed: 0.15 + Math.random() * 0.25,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);
  
  useFrame((state, delta) => {
    if (onComplete) {
      setProgress(prev => {
        const next = prev + delta * 0.5;
        if (next >= 1) onComplete();
        return Math.min(next, 1);
      });
    }
    // No rotation - removed the rotating group
  });
  
  return (
    <group ref={groupRef}>
      {clouds.map((cloud, i) => (
        <FogCloud key={i} {...cloud} progress={progress} hasComplete={!!onComplete} />
      ))}
      {/* Ground fog plane removed - just particles now */}
    </group>
  );
}

function FogCloud({ x, z, y, scale, speed, phase, progress, hasComplete }) {
  const ref = useRef();
  
  useFrame((state) => {
    if (ref.current) {
      const t = state.clock.elapsedTime;
      ref.current.position.x = x + Math.sin(t * speed + phase) * 0.8;
      ref.current.position.z = z + Math.cos(t * speed + phase) * 0.8;
      ref.current.position.y = y + Math.sin(t * speed * 2 + phase) * 0.15;
      
      // More transparent fog - opacity 0.15-0.25 instead of 0.35
      const baseOpacity = hasComplete ? 0.2 * (1 - progress) : 0.2;
      ref.current.material.opacity = baseOpacity + Math.sin(t + phase) * 0.05;
    }
  });
  
  return (
    <mesh ref={ref} position={[x, y, z]}>
      <sphereGeometry args={[scale, 12, 12]} />
      <meshStandardMaterial
        emissive="#1a237e"
        emissiveIntensity={0.3}
        color="#283593"
        transparent
        opacity={0.2}
      />
    </mesh>
  );
}

// ============================================================================
// SOFT PUSH EFFECT - Gentle force wave
// ============================================================================

export function SoftPushEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.5;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  const ringScale = easeOutCubic(progress) * 2;
  const opacity = 1 - easeOutCubic(progress);
  
  return (
    <group position={[x, 0, z]}>
      {/* Expanding rings */}
      {[0, 0.15, 0.3].map((delay, i) => {
        const p = Math.max(0, Math.min(1, (progress - delay) / 0.7));
        const s = easeOutCubic(p) * 1.5;
        const o = (1 - p) * 0.6;
        return (
          <mesh key={i} position={[0, 0.3, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[s, s, 1]}>
            <ringGeometry args={[0.3, 0.4, 32]} />
            <meshStandardMaterial
              emissive="#ffab91"
              emissiveIntensity={2}
              color="#ffccbc"
              transparent
              opacity={o}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
      
      {/* Central glow */}
      <mesh position={[0, 0.3, 0]}>
        <sphereGeometry args={[0.2 * (1 - progress * 0.5), 16, 16]} />
        <meshStandardMaterial
          emissive="#ff8a65"
          emissiveIntensity={3 * opacity}
          color="#ffab91"
          transparent
          opacity={opacity * 0.5}
        />
      </mesh>
      
      {/* Particle burst */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const dist = easeOutCubic(progress) * 1;
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * dist, 0.3, Math.sin(angle) * dist]}
          >
            <sphereGeometry args={[0.06 * opacity, 8, 8]} />
            <meshStandardMaterial
              emissive="#ffccbc"
              emissiveIntensity={3}
              color="#ffccbc"
              transparent
              opacity={opacity * 0.8}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ============================================================================
// PAWN RUSH EFFECT - Speed lines and energy burst
// ============================================================================

export function PawnRushEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.2;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group>
      {/* Speed lines across board */}
      {[...Array(20)].map((_, i) => {
        const x = (i % 5) * 2 - 4;
        const z = Math.floor(i / 5) * 2 - 3;
        const delay = i * 0.03;
        const p = Math.max(0, Math.min(1, (progress - delay) / 0.6));
        
        return (
          <mesh
            key={i}
            position={[x, 0.3, z + p * 2]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <planeGeometry args={[0.1, 0.8 * p]} />
            <meshStandardMaterial
              emissive="#4dd0e1"
              emissiveIntensity={3 * (1 - p)}
              color="#80deea"
              transparent
              opacity={(1 - p) * 0.7}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
      
      {/* Energy wave */}
      <mesh position={[0, 0.1, progress * 8 - 4]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[10, 0.5]} />
        <meshStandardMaterial
          emissive="#00bcd4"
          emissiveIntensity={4 * (1 - progress)}
          color="#4dd0e1"
          transparent
          opacity={(1 - progress) * 0.5}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ============================================================================
// PHANTOM STEP EFFECT - Ghostly knight movement trails
// ============================================================================

export function PhantomStepEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  const groupRef = useRef();
  
  const knightMoves = useMemo(() => [
    [2, 1], [2, -1], [-2, 1], [-2, -1],
    [1, 2], [1, -2], [-1, 2], [-1, -2]
  ], []);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.5;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 2;
    }
  });
  
  return (
    <group position={[x, 0, z]} ref={groupRef}>
      {/* Central ghost sphere */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.25 * (1 - progress * 0.3), 16, 16]} />
        <meshStandardMaterial
          emissive="#ce93d8"
          emissiveIntensity={3}
          color="#e1bee7"
          transparent
          opacity={(1 - progress) * 0.6}
        />
      </mesh>
      
      {/* Knight move trails */}
      {knightMoves.map(([dx, dz], i) => {
        const delay = i * 0.06;
        const p = Math.max(0, Math.min(1, (progress - delay) / 0.7));
        const dist = easeOutCubic(p);
        
        return (
          <group key={i}>
            {/* Trail line */}
            <mesh position={[dx * 0.3 * dist, 0.4, dz * 0.3 * dist]}>
              <sphereGeometry args={[0.1 * (1 - p), 8, 8]} />
              <meshStandardMaterial
                emissive="#ba68c8"
                emissiveIntensity={3 * (1 - p)}
                color="#ce93d8"
                transparent
                opacity={(1 - p) * 0.7}
              />
            </mesh>
            
            {/* End point glow */}
            <mesh position={[dx * 0.3, 0.4, dz * 0.3]}>
              <sphereGeometry args={[0.08 * p, 8, 8]} />
              <meshStandardMaterial
                emissive="#e1bee7"
                emissiveIntensity={2}
                color="#e1bee7"
                transparent
                opacity={p * 0.5 * (1 - progress)}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ============================================================================
// SPECTRAL MARCH EFFECT - Ghostly rook path
// ============================================================================

export function SpectralMarchEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.2;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group position={[x, 0, z]}>
      {/* Spectral trail segments */}
      {[...Array(8)].map((_, i) => {
        const offset = i * 0.12;
        const p = Math.max(0, Math.min(1, (progress - offset) / 0.6));
        const y = 0.3 + p * 0.3;
        const zOffset = (i - 4) * 0.3;
        
        return (
          <mesh key={i} position={[0, y, zOffset]}>
            <boxGeometry args={[0.3, 0.5 * (1 - p * 0.5), 0.15]} />
            <meshStandardMaterial
              emissive="#5c6bc0"
              emissiveIntensity={2 * (1 - p)}
              color="#7986cb"
              transparent
              opacity={(1 - p) * 0.5}
              wireframe
            />
          </mesh>
        );
      })}
      
      {/* Ghost silhouette */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 0.8, 8]} />
        <meshStandardMaterial
          emissive="#7c4dff"
          emissiveIntensity={2 * (1 - progress)}
          color="#b388ff"
          transparent
          opacity={(1 - progress) * 0.4}
        />
      </mesh>
    </group>
  );
}

// ============================================================================
// POISON TOUCH EFFECT - Venomous activation (green poison particles only)
// ============================================================================

export function PoisonTouchEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const groupRef = useRef();
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.5;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 2;
    }
  });
  
  return (
    <group ref={groupRef}>
      {/* Poison splash particles - green toxic effect */}
      {[...Array(24)].map((_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        const dist = progress * 2.5;
        const height = Math.sin(progress * Math.PI) * 1.5;
        
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * dist,
              0.2 + height * (0.5 + Math.random() * 0.5),
              Math.sin(angle) * dist
            ]}
          >
            <sphereGeometry args={[0.06 * (1 - progress * 0.5), 8, 8]} />
            <meshStandardMaterial
              emissive="#76ff03"
              emissiveIntensity={3 * (1 - progress)}
              color="#b2ff59"
              transparent
              opacity={(1 - progress) * 0.8}
            />
          </mesh>
        );
      })}
      
      {/* Toxic mist expanding outward */}
      <mesh position={[0, 0.3, 0]} scale={[progress * 3, progress * 0.5, progress * 3]}>
        <cylinderGeometry args={[1, 1.2, 0.3, 16, 1, true]} />
        <meshStandardMaterial
          emissive="#64dd17"
          emissiveIntensity={2 * (1 - progress)}
          color="#76ff03"
          transparent
          opacity={(1 - progress) * 0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// ============================================================================
// ADDITIONAL CARD EFFECTS
// ============================================================================

// Iron Fortress Effect
export function IronFortressEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.8;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  // Create fortress walls around pawn starting ranks
  return (
    <group>
      {/* Stone walls rising */}
      {[-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5].map((x, i) => (
        <mesh
          key={i}
          position={[x, easeOutCubic(progress) * 0.4, -2.5]}
          scale={[0.8, easeOutCubic(progress), 0.2]}
        >
          <boxGeometry args={[1, 0.8, 1]} />
          <meshStandardMaterial
            emissive="#78909c"
            emissiveIntensity={1.5 * (1 - progress * 0.5)}
            color="#90a4ae"
            transparent
            opacity={0.7 * (1 - progress * 0.3)}
          />
        </mesh>
      ))}
      
      {/* Magical shimmer */}
      <mesh position={[0, 0.3, -2.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 1]} />
        <meshStandardMaterial
          emissive="#b0bec5"
          emissiveIntensity={2 * (1 - progress)}
          color="#cfd8dc"
          transparent
          opacity={(1 - progress) * 0.4}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// Divine Intervention Effect
export function DivineInterventionEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const groupRef = useRef();
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.6;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime;
    }
  });
  
  return (
    <group ref={groupRef}>
      {/* Heavenly light beam */}
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[0.1, 2, 6, 32, 1, true]} />
        <meshStandardMaterial
          emissive="#fff9c4"
          emissiveIntensity={3 * easeOutCubic(progress)}
          color="#ffecb3"
          transparent
          opacity={0.4 * (1 - progress * 0.5)}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Holy rings */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[0, 0.5 + i * 0.4, 0]}
          rotation={[-Math.PI / 2, 0, progress * Math.PI * 2]}
          scale={[1 - i * 0.2, 1 - i * 0.2, 1]}
        >
          <ringGeometry args={[0.4, 0.5, 32]} />
          <meshStandardMaterial
            emissive="#ffd54f"
            emissiveIntensity={2}
            color="#ffecb3"
            transparent
            opacity={0.6 * (1 - progress * 0.5)}
            side={THREE.DoubleSide}
          />
        </mesh>
      ))}
      
      {/* Angel feathers */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const delay = i * 0.05;
        const p = Math.max(0, Math.min(1, (progress - delay) / 0.8));
        
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * (0.5 + p * 2),
              2 - p * 1.5,
              Math.sin(angle) * (0.5 + p * 2)
            ]}
            rotation={[0, -angle, Math.PI / 4]}
          >
            <planeGeometry args={[0.1, 0.3]} />
            <meshStandardMaterial
              emissive="#ffffff"
              emissiveIntensity={3}
              color="#ffffff"
              transparent
              opacity={(1 - p) * 0.8}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Execution Effect
export function ExecutionEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 2;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group position={[x, 0, z]}>
      {/* Red X mark */}
      <mesh position={[0, 0.5, 0]} rotation={[0, Math.PI / 4, 0]}>
        <boxGeometry args={[0.1, 0.8 * easeOutCubic(progress), 0.02]} />
        <meshStandardMaterial
          emissive="#f44336"
          emissiveIntensity={4}
          color="#ff5252"
          transparent
          opacity={1 - progress * 0.3}
        />
      </mesh>
      <mesh position={[0, 0.5, 0]} rotation={[0, -Math.PI / 4, 0]}>
        <boxGeometry args={[0.1, 0.8 * easeOutCubic(progress), 0.02]} />
        <meshStandardMaterial
          emissive="#f44336"
          emissiveIntensity={4}
          color="#ff5252"
          transparent
          opacity={1 - progress * 0.3}
        />
      </mesh>
      
      {/* Shatter particles */}
      {[...Array(16)].map((_, i) => {
        const angle = (i / 16) * Math.PI * 2;
        const dist = progress * 1.5;
        
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * dist,
              0.5 + Math.sin(progress * Math.PI) * 0.5,
              Math.sin(angle) * dist
            ]}
          >
            <boxGeometry args={[0.08, 0.08, 0.08]} />
            <meshStandardMaterial
              emissive="#ff1744"
              emissiveIntensity={3 * (1 - progress)}
              color="#ff5252"
              transparent
              opacity={(1 - progress) * 0.9}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Time Freeze Effect
export function TimeFreezeEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.8;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group>
      {/* Frozen clock hands */}
      <mesh position={[0, 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1, 32]} />
        <meshStandardMaterial
          emissive="#4fc3f7"
          emissiveIntensity={2 * easeOutCubic(progress)}
          color="#81d4fa"
          transparent
          opacity={0.5 * (1 - progress * 0.3)}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Ice crystals spreading */}
      {[...Array(24)].map((_, i) => {
        const angle = (i / 24) * Math.PI * 2;
        const dist = easeOutCubic(progress) * 5;
        const delay = i * 0.02;
        const p = Math.max(0, Math.min(1, (progress - delay) / 0.8));
        
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * dist,
              0.1,
              Math.sin(angle) * dist
            ]}
            rotation={[0, angle, 0]}
          >
            <coneGeometry args={[0.1, 0.4 * p, 4]} />
            <meshStandardMaterial
              emissive="#e1f5fe"
              emissiveIntensity={2}
              color="#b3e5fc"
              transparent
              opacity={(1 - progress * 0.5) * 0.7}
            />
          </mesh>
        );
      })}
      
      {/* Frozen wave */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[progress * 6, progress * 6, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial
          emissive="#4fc3f7"
          emissiveIntensity={1.5 * (1 - progress)}
          color="#81d4fa"
          transparent
          opacity={(1 - progress) * 0.3}
        />
      </mesh>
    </group>
  );
}

// Chain Lightning Effect
export function ChainLightningEffect({ origin, chained, onComplete }) {
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 2.5;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  const originPos = origin ? squareToPosition(origin) : [0, 0, 0];
  
  return (
    <group>
      {/* Origin spark */}
      <mesh position={[originPos[0], 0.5, originPos[2]]}>
        <sphereGeometry args={[0.2 * (1 - progress * 0.5), 16, 16]} />
        <meshStandardMaterial
          emissive="#ffeb3b"
          emissiveIntensity={5 * (1 - progress)}
          color="#fff59d"
          transparent
          opacity={(1 - progress) * 0.9}
        />
      </mesh>
      
      {/* Lightning bolts to chained squares */}
      {(chained || []).map((sq, i) => {
        const targetPos = squareToPosition(sq);
        const delay = i * 0.1;
        const p = Math.max(0, Math.min(1, (progress - delay) / 0.6));
        
        return (
          <group key={i}>
            {/* Lightning bolt (simplified as line of spheres) */}
            {[...Array(5)].map((_, j) => {
              const t = j / 4;
              const x = originPos[0] + (targetPos[0] - originPos[0]) * t * p;
              const z = originPos[2] + (targetPos[2] - originPos[2]) * t * p;
              const jitter = Math.sin(j * 3 + progress * 10) * 0.1;
              
              return (
                <mesh
                  key={j}
                  position={[x + jitter, 0.5 + Math.sin(t * Math.PI) * 0.3, z + jitter]}
                >
                  <sphereGeometry args={[0.08, 8, 8]} />
                  <meshStandardMaterial
                    emissive="#fff176"
                    emissiveIntensity={4 * (1 - p * 0.5)}
                    color="#ffeb3b"
                    transparent
                    opacity={(1 - p) * 0.9}
                  />
                </mesh>
              );
            })}
            
            {/* Impact spark */}
            <mesh position={[targetPos[0], 0.5, targetPos[2]]}>
              <sphereGeometry args={[0.15 * p, 12, 12]} />
              <meshStandardMaterial
                emissive="#ffeb3b"
                emissiveIntensity={5 * p * (1 - progress)}
                color="#fff59d"
                transparent
                opacity={p * (1 - progress) * 0.9}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ============================================================================
// CHAOS THEORY EFFECT - Swirling cosmic chaos particles
// ============================================================================

export function ChaosTheoryEffect({ shuffledSquares = [], onComplete }) {
  const [progress, setProgress] = useState(0);
  const groupRef = useRef();
  const particleCount = 150;
  
  // Generate random particle data
  const particles = useMemo(() => {
    return [...Array(particleCount)].map(() => ({
      theta: Math.random() * Math.PI * 2,
      phi: Math.random() * Math.PI,
      speed: 1 + Math.random() * 2,
      radius: 3 + Math.random() * 3,
      offset: Math.random() * Math.PI * 2,
      size: 0.03 + Math.random() * 0.05,
      color: Math.random() > 0.5 ? '#9b59b6' : '#8e44ad', // Purple tones
    }));
  }, []);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta / 3;
      if (next >= 1) {
        onComplete?.();
        return 1;
      }
      return next;
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.8;
    }
  });
  
  const opacity = progress < 0.1 ? progress * 10 : progress > 0.8 ? (1 - progress) * 5 : 1;
  
  return (
    <group ref={groupRef} position={[0, 2, 0]}>
      {/* Central vortex */}
      <mesh>
        <torusGeometry args={[2, 0.1, 16, 100]} />
        <meshStandardMaterial
          emissive="#9b59b6"
          emissiveIntensity={3}
          color="#8e44ad"
          transparent
          opacity={opacity * 0.6}
        />
      </mesh>
      
      {/* Chaos particles */}
      {particles.map((p, i) => {
        const time = progress * p.speed + p.offset;
        const r = p.radius * (1 - Math.abs(progress - 0.5));
        const x = Math.sin(p.phi) * Math.cos(p.theta + time * 3) * r;
        const y = Math.cos(p.phi) * r * 0.5 + Math.sin(time * 5) * 0.3;
        const z = Math.sin(p.phi) * Math.sin(p.theta + time * 3) * r;
        
        return (
          <mesh key={i} position={[x, y, z]}>
            <sphereGeometry args={[p.size, 8, 8]} />
            <meshStandardMaterial
              emissive={p.color}
              emissiveIntensity={2}
              color={p.color}
              transparent
              opacity={opacity * 0.8}
            />
          </mesh>
        );
      })}
      
      {/* Shuffled square indicators */}
      {shuffledSquares.map((sq, i) => {
        const [x, , z] = squareToPosition(sq);
        const pulseOffset = i * 0.5;
        const pulse = Math.sin(progress * Math.PI * 4 + pulseOffset) * 0.2 + 1;
        
        return (
          <mesh key={sq} position={[x, 0.1, z]} scale={[pulse, 1, pulse]}>
            <cylinderGeometry args={[0.4, 0.4, 0.05, 32]} />
            <meshStandardMaterial
              emissive="#9b59b6"
              emissiveIntensity={3 * opacity}
              color="#8e44ad"
              transparent
              opacity={opacity * 0.6}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Vision Effect
export function VisionEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.2;
      if (next >= 1 && onComplete) onComplete();
      return Math.min(next, 1);
    });
  });
  
  return (
    <group>
      {/* All-seeing eye */}
      <mesh position={[0, 3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.5, 32]} />
        <meshStandardMaterial
          emissive="#7e57c2"
          emissiveIntensity={3 * easeOutCubic(progress)}
          color="#9575cd"
          transparent
          opacity={0.7 * (1 - progress * 0.3)}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Eye pupil */}
      <mesh position={[0, 3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.2, 32]} />
        <meshStandardMaterial
          emissive="#311b92"
          emissiveIntensity={2}
          color="#4527a0"
          transparent
          opacity={0.9 * (1 - progress * 0.3)}
        />
      </mesh>
      
      {/* Scanning beams */}
      {[...Array(8)].map((_, i) => {
        const angle = (i / 8) * Math.PI * 2 + progress * Math.PI;
        const dist = 4;
        
        return (
          <mesh
            key={i}
            position={[0, 1.5, 0]}
            rotation={[Math.PI / 4, angle, 0]}
          >
            <planeGeometry args={[0.05, dist]} />
            <meshStandardMaterial
              emissive="#b39ddb"
              emissiveIntensity={2 * (1 - progress)}
              color="#d1c4e9"
              transparent
              opacity={(1 - progress) * 0.4}
              side={THREE.DoubleSide}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ============================================================================
// SANCTUARY EFFECT - Holy protective barrier on a square
// ============================================================================

export function SanctuaryEffect({ square, onComplete }) {
  const [progress, setProgress] = useState(0);
  const groupRef = useRef();
  
  const [x, , z] = square ? squareToPosition(square) : [0, 0, 0];
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta / 2;
      if (next >= 1) {
        onComplete?.();
        return 1;
      }
      return next;
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5;
    }
  });
  
  const opacity = progress < 0.1 ? progress * 10 : progress > 0.8 ? (1 - progress) * 5 : 1;
  
  return (
    <group position={[x, 0, z]} ref={groupRef}>
      {/* Golden sanctuary dome */}
      <mesh position={[0, 0.4, 0]}>
        <sphereGeometry args={[0.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial
          emissive="#ffd700"
          emissiveIntensity={2}
          color="#ffeb3b"
          transparent
          opacity={opacity * 0.3}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Base ring */}
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.5, 32]} />
        <meshStandardMaterial
          emissive="#ffd700"
          emissiveIntensity={3}
          color="#ffeb3b"
          transparent
          opacity={opacity * 0.6}
        />
      </mesh>
      
      {/* Rising particles */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const r = 0.35;
        const rise = (progress + i * 0.1) % 1;
        
        return (
          <mesh
            key={i}
            position={[Math.cos(angle) * r, rise * 0.8, Math.sin(angle) * r]}
          >
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshStandardMaterial
              emissive="#ffd700"
              emissiveIntensity={3}
              color="#ffeb3b"
              transparent
              opacity={opacity * (1 - rise)}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Persistent sanctuary indicator for squares
export function SanctuaryIndicatorEffect({ square }) {
  const [x, , z] = square ? squareToPosition(square) : [0, 0, 0];
  const ringRef = useRef();
  
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) {
      ringRef.current.material.opacity = 0.3 + Math.sin(t * 2) * 0.15;
    }
  });
  
  return (
    <group position={[x, 0.12, z]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshStandardMaterial
          emissive="#ffd700"
          emissiveIntensity={2}
          color="#ffeb3b"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ============================================================================
// CURSED SQUARE EFFECT - Dark malevolent energy on a square
// ============================================================================

export function CursedSquareEffect({ square, onComplete }) {
  const [progress, setProgress] = useState(0);
  const groupRef = useRef();
  
  const [x, , z] = square ? squareToPosition(square) : [0, 0, 0];
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta / 2;
      if (next >= 1) {
        onComplete?.();
        return 1;
      }
      return next;
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y -= delta * 0.8;
    }
  });
  
  const opacity = progress < 0.1 ? progress * 10 : progress > 0.8 ? (1 - progress) * 5 : 1;
  
  return (
    <group position={[x, 0, z]} ref={groupRef}>
      {/* Dark vortex */}
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.45, 32]} />
        <meshStandardMaterial
          emissive="#8b0000"
          emissiveIntensity={2}
          color="#dc143c"
          transparent
          opacity={opacity * 0.5}
        />
      </mesh>
      
      {/* Cursed particles rising */}
      {[...Array(20)].map((_, i) => {
        const angle = (i / 20) * Math.PI * 2;
        const r = 0.3 * Math.random() + 0.1;
        const rise = ((progress * 2 + i * 0.05) % 1);
        
        return (
          <mesh
            key={i}
            position={[Math.cos(angle + progress * 3) * r, rise * 0.6, Math.sin(angle + progress * 3) * r]}
          >
            <sphereGeometry args={[0.015, 6, 6]} />
            <meshStandardMaterial
              emissive="#8b0000"
              emissiveIntensity={2}
              color="#dc143c"
              transparent
              opacity={opacity * (1 - rise) * 0.8}
            />
          </mesh>
        );
      })}
      
      {/* Dark tendrils */}
      {[...Array(4)].map((_, i) => {
        const angle = (i / 4) * Math.PI * 2 + progress * 2;
        
        return (
          <mesh key={i} position={[Math.cos(angle) * 0.3, 0.2, Math.sin(angle) * 0.3]}>
            <cylinderGeometry args={[0.01, 0.02, 0.3, 8]} />
            <meshStandardMaterial
              emissive="#8b0000"
              emissiveIntensity={2}
              color="#dc143c"
              transparent
              opacity={opacity * 0.6}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Persistent cursed square indicator
export function CursedSquareIndicatorEffect({ square, turnsLeft }) {
  const [x, , z] = square ? squareToPosition(square) : [0, 0, 0];
  const ringRef = useRef();
  
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.5;
      ringRef.current.material.opacity = 0.3 + Math.sin(t * 3) * 0.1;
    }
  });
  
  return (
    <group position={[x, 0.12, z]}>
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.42, 6]} />
        <meshStandardMaterial
          emissive="#8b0000"
          emissiveIntensity={2}
          color="#dc143c"
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
