import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { squareToPosition } from './sharedHelpers.jsx';

// Import GPU particle system (only used components)
import {
  ParticleShield,
  ParticlePoison,
} from './particleSystem.jsx';

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutElastic = (t) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

// Helper hook to run a short fade/shrink before calling onComplete
function useFinishFade(onComplete, fadeMs = 400) {
  const [finishing, setFinishing] = useState(false);
  const [finishT, setFinishT] = useState(0);
  const [completed, setCompleted] = useState(false);
  const calledRef = useRef(false);

  useEffect(() => {
    if (!finishing) return undefined;
    let rafId = null;
    let start = null;
    const step = (t) => {
      if (!start) start = t;
      const dt = t - start;
      const nt = Math.min(dt / fadeMs, 1);
      setFinishT(nt);
      if (nt < 1) rafId = requestAnimationFrame(step);
      else {
        if (!calledRef.current) {
          calledRef.current = true;
          if (onComplete) onComplete();
        }
        setCompleted(true);
      }
    };
    rafId = requestAnimationFrame(step);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [finishing, fadeMs, onComplete]);

  return { finishing, finishT, completed, triggerFinish: () => setFinishing(true) };
}

// ============================================================================
// SHIELD GLOW EFFECT - Magical protective barrier
// ============================================================================

export function ShieldGlowEffect({ square, fadeOpacity = 1 }) {
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
      innerRef.current.material.opacity = (0.3 + Math.sin(t * 3) * 0.1) * fadeOpacity;
    }

    if (outerRef.current) {
      outerRef.current.rotation.y = -t * 0.3;
      outerRef.current.material.opacity = (0.15 + Math.sin(t * 2) * 0.05) * fadeOpacity;
    }

    if (runesRef.current) {
      runesRef.current.children.forEach((rune, i) => {
        const offset = (i / 6) * Math.PI * 2;
        rune.position.y = 0.5 + Math.sin(t * 2 + offset) * 0.1;
        rune.material.opacity = (0.6 + Math.sin(t * 3 + offset) * 0.3) * fadeOpacity;
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
          depthWrite={false}
          opacity={0.35 * fadeOpacity}
          
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
          depthWrite={false}
          opacity={0.2 * fadeOpacity}
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
              depthWrite={false}
              opacity={0.8 * fadeOpacity}
            />
          </mesh>
        ))}
      </group>
      
      {/* Base glow ring */}
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.55, 32]} />
        <meshStandardMaterial
          emissive="#4fc3f7"
          emissiveIntensity={2}
          color="#4fc3f7"
          transparent
          depthWrite={false}
          opacity={0.4 * fadeOpacity}
          
        />
      </mesh>
      
      {/* GPU particle sparkles - replaces manual Sparkle components */}
      <ParticleShield color="#4fc3f7" radius={0.4} count={40} />
    </group>
  );
}

// ============================================================================
// POISONED PIECE EFFECT - Toxic aura with dripping particles
// ============================================================================

export function PoisonedPieceEffect({ square, turnsLeft, fadeOpacity = 1 }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const groupRef = useRef();
  const auraRef = useRef();
  
  const urgency = turnsLeft === 1 ? 3 : turnsLeft === 2 ? 2 : 1.2;
  const baseColor = turnsLeft === 1 ? '#76ff03' : turnsLeft === 2 ? '#8bc34a' : '#558b2f';
  const turnsDisplay = Math.ceil(turnsLeft / 2); // Show as player turns (not plies)
  
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
          depthWrite={false}
          opacity={0.35 * fadeOpacity}
          
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
          fadeOpacity={fadeOpacity}
        />
      ))}
      
      {/* Rising bubbles */}
      {bubbles.map((bubble, i) => (
        <PoisonBubble key={i} {...bubble} urgency={urgency} color={baseColor} fadeOpacity={fadeOpacity} />
      ))}
      
      {/* Turn counter - hovering above the piece */}
      <group position={[0, 0.95, 0]}>
        <mesh>
          <cylinderGeometry args={[0.15, 0.15, 0.05, 16]} />
          <meshStandardMaterial
            emissive={turnsLeft <= 2 ? "#ff1744" : baseColor}
            emissiveIntensity={urgency * 2}
            color={turnsLeft <= 2 ? "#ff1744" : baseColor}
            transparent
            opacity={0.8 * fadeOpacity}
          />
        </mesh>
        {/* Number display using small spheres in a pattern */}
        {[...Array(turnsDisplay)].map((_, i) => {
          const totalDots = turnsDisplay;
          const angle = (i / totalDots) * Math.PI * 2 - Math.PI / 2;
          const radius = 0.08;
          return (
            <mesh
              key={i}
              position={[
                Math.cos(angle) * radius,
                0.03,
                Math.sin(angle) * radius
              ]}
            >
              <sphereGeometry args={[0.025, 8, 8]} />
              <meshStandardMaterial
                emissive="#ffffff"
                emissiveIntensity={5}
                color="#ffffff"
              />
            </mesh>
          );
        })}
      </group>
      
      {/* Skull indicator for final turn */}
      {turnsLeft === 1 && (
        <mesh position={[0, 1.15, 0]}>
          <octahedronGeometry args={[0.08, 0]} />
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
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.4, 32]} />
        <meshStandardMaterial
          emissive={baseColor}
          emissiveIntensity={1}
          color={baseColor}
          transparent
          depthWrite={false}
          opacity={0.25 * fadeOpacity}
        />
      </mesh>
      
      {/* GPU particle poison bubbles */}
      <ParticlePoison color={baseColor} intensity={urgency} count={30} />
    </group>
  );
}

function PoisonDrip({ angle, radius, color, speed, delay, fadeOpacity = 1 }) {
  const ref = useRef();
  
  useFrame((state) => {
    if (ref.current) {
      const t = ((state.clock.elapsedTime * speed + delay) % 2) / 2;
      const y = 0.8 - t * 0.7;
      ref.current.position.y = y;
      ref.current.material.opacity = (t < 0.1 ? t * 10 : t > 0.9 ? (1 - t) * 10 : 0.7) * fadeOpacity;
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
        depthWrite={false}
        opacity={0.7 * fadeOpacity}
      />
    </mesh>
  );
}

function PoisonBubble({ angle, radius, speed, size, phase, urgency, color, fadeOpacity = 1 }) {
  const ref = useRef();

  useFrame((state) => {
    if (ref.current) {
      const t = ((state.clock.elapsedTime * speed * urgency + phase) % 1.5) / 1.5;
      const y = 0.1 + t * 0.8;
      ref.current.position.y = y;
      ref.current.position.x = Math.cos(angle + t * 2) * radius;
      ref.current.position.z = Math.sin(angle + t * 2) * radius;
      ref.current.material.opacity = Math.sin(t * Math.PI) * 0.6 * fadeOpacity;
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
        depthWrite={false}
        opacity={0.5 * fadeOpacity}
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
          depthWrite={false}
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
          depthWrite={false}
          opacity={0.2}
        />
      </mesh>
      
      {/* Orbiting shields */}
      {[0, 120, 240].map((deg, i) => (
        <OrbitingShield key={i} baseAngle={deg} color="#ffc107" />
      ))}
      
      {/* Base ring */}
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshStandardMaterial
          emissive="#ffd54f"
          emissiveIntensity={2}
          color="#ffd54f"
          transparent
          depthWrite={false}
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
        depthWrite={false}
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
  
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 450);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.2;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 2;
    }
  });
  
  const baseScale = easeOutElastic(progress);
  const scale = baseScale * (1 - finishT * 0.25);
  const baseOpacity = progress < 0.8 ? 1 : (1 - progress) * 5;
  const opacity = baseOpacity * (1 - finishT);
  
  if (completed) return null;

  return (
    <group position={[x, 0, z]} ref={groupRef} scale={[scale, scale, scale]}>
      <mesh position={[0, 0.4, 0]}>
        <octahedronGeometry args={[0.5, 1]} />
        <meshStandardMaterial
          emissive="#ffd54f"
          emissiveIntensity={3}
          color="#ffca28"
          transparent
          depthWrite={false}
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
              depthWrite={false}
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
  
  // Generate cloud particles - reduced density for readability and perf
  const clouds = useMemo(() => {
    return [...Array(48)].map(() => ({
      x: (Math.random() - 0.5) * 12,
      z: (Math.random() - 0.5) * 12,
      y: 0.1 + Math.random() * 0.8,
      scale: 0.4 + Math.random() * 0.6,
      speed: 0.15 + Math.random() * 0.25,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);
  
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 500);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.5;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
    // No rotation - removed the rotating group
  });
  
  if (completed) return null;

  return (
    <group ref={groupRef}>
      {clouds.map((cloud, i) => (
        <FogCloud key={i} {...cloud} progress={progress} hasComplete={!!onComplete} finishT={finishT} />
      ))}
      {/* Ground fog plane removed - just particles now */}
    </group>
  );
}

function FogCloud({ x, z, y, scale, speed, phase, progress, hasComplete, finishT = 0, fadeOpacity = 1 }) {
  const ref = useRef();
  
  useFrame((state) => {
    if (ref.current) {
      const t = state.clock.elapsedTime;
      ref.current.position.x = x + Math.sin(t * speed + phase) * 0.8;
      ref.current.position.z = z + Math.cos(t * speed + phase) * 0.8;
      ref.current.position.y = y + Math.sin(t * speed * 2 + phase) * 0.15;
      
      // Slightly reduced opacity and smaller shimmer for clarity
      const baseOpacity = hasComplete ? 0.15 * (1 - progress) : 0.15;
      ref.current.material.opacity = ((baseOpacity * (1 - finishT)) + Math.sin(t + phase) * 0.03 * (1 - finishT)) * fadeOpacity;
    }
  });
  
  return (
    <mesh ref={ref} position={[x, y, z]}>
      <sphereGeometry args={[scale, 8, 8]} />
      <meshStandardMaterial
        emissive="#17202a"
        emissiveIntensity={0.2}
        color="#1f2a44"
        transparent
        depthWrite={false}
        opacity={0.15 * fadeOpacity}
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
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 300);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.5;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  const ringScale = easeOutCubic(progress) * 2 * (1 - finishT * 0.25);
  const opacity = (1 - easeOutCubic(progress)) * (1 - finishT);
  
  if (completed) return null;

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
              depthWrite={false}
              opacity={o * (1 - finishT)}
              
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
          depthWrite={false}
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
              depthWrite={false}
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
  // Disabled per user request: immediately complete and render nothing
  useEffect(() => { if (onComplete) onComplete(); }, [onComplete]);
  return null;
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
  
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 350);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.5;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 2;
    }
  });
  
  if (completed) return null;

  return (
    <group position={[x, 0, z]} ref={groupRef}>
      {/* Central ghost sphere */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.25 * (1 - progress * 0.3) * (1 - finishT * 0.3), 16, 16]} />
        <meshStandardMaterial
          emissive="#ce93d8"
          emissiveIntensity={3}
          color="#e1bee7"
          transparent
          depthWrite={false}
          opacity={(1 - progress) * 0.6 * (1 - finishT)}
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
              <sphereGeometry args={[0.1 * (1 - p) * (1 - finishT * 0.25), 8, 8]} />
              <meshStandardMaterial
                emissive="#ba68c8"
                emissiveIntensity={3 * (1 - p) * (1 - finishT)}
                color="#ce93d8"
                transparent
                depthWrite={false}
                opacity={(1 - p) * 0.7 * (1 - finishT)}
              />
            </mesh>
            
            {/* End point glow */}
            <mesh position={[dx * 0.3, 0.4, dz * 0.3]}>
              <sphereGeometry args={[0.08 * p * (1 - finishT * 0.25), 8, 8]} />
              <meshStandardMaterial
                emissive="#e1bee7"
                emissiveIntensity={2}
                color="#e1bee7"
                transparent
                depthWrite={false}
                opacity={p * 0.5 * (1 - progress) * (1 - finishT)}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

// ============================================================================
// SHARPSHOOTER EFFECT - Bishop targeting with laser sights
// ============================================================================

export function SharpshooterEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 400);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.5;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  if (completed) return null;

  // Four diagonal laser beams
  const diagonals = [
    { angle: Math.PI / 4, name: 'NE' },      // Northeast
    { angle: 3 * Math.PI / 4, name: 'NW' },  // Northwest
    { angle: 5 * Math.PI / 4, name: 'SW' },  // Southwest
    { angle: 7 * Math.PI / 4, name: 'SE' },  // Southeast
  ];

  return (
    <group position={[x, 0, z]}>
      {/* Central crosshair targeting reticle */}
      <mesh position={[0, 0.5, 0]} rotation={[0, progress * Math.PI * 2, 0]}>
        <ringGeometry args={[0.3, 0.4, 32]} />
        <meshStandardMaterial
          emissive="#ff0000"
          emissiveIntensity={3 * (1 + Math.sin(progress * Math.PI * 8) * 0.3)}
          color="#ff5252"
          transparent
          depthWrite={false}
          opacity={0.8 * (1 - finishT)}
        />
      </mesh>
      
      {/* Diagonal laser sight beams */}
      {diagonals.map((diag, i) => (
        <group key={diag.name} rotation={[0, diag.angle, 0]}>
          {/* Laser beam extending outward */}
          <mesh 
            position={[0, 0.3, -3 * easeOutCubic(progress)]}
            rotation={[Math.PI / 2, 0, 0]}
          >
            <cylinderGeometry args={[0.03, 0.03, 6 * easeOutCubic(progress), 8]} />
            <meshStandardMaterial
              emissive="#ff1744"
              emissiveIntensity={4 * (1 - progress * 0.3)}
              color="#ff5252"
              transparent
              depthWrite={false}
              opacity={0.7 * (1 - progress * 0.4) * (1 - finishT)}
            />
          </mesh>
          
          {/* Laser endpoint glow */}
          <mesh position={[0, 0.3, -6 * easeOutCubic(progress)]}>
            <sphereGeometry args={[0.1, 16, 16]} />
            <meshStandardMaterial
              emissive="#ff0000"
              emissiveIntensity={5}
              color="#ff5252"
              transparent
              depthWrite={false}
              opacity={0.9 * (1 - finishT)}
            />
          </mesh>
        </group>
      ))}
      
      {/* Pulsing warning circle on ground */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.4, 0.6 * (1 + Math.sin(progress * Math.PI * 6) * 0.2), 32]} />
        <meshStandardMaterial
          emissive="#d32f2f"
          emissiveIntensity={2}
          color="#ff5252"
          transparent
          depthWrite={false}
          opacity={0.5 * (1 - progress * 0.5) * (1 - finishT)}
        />
      </mesh>
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
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 300);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.2;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  if (completed) return null;

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
              emissiveIntensity={2 * (1 - p) * (1 - finishT)}
              color="#7986cb"
              transparent
              depthWrite={false}
              opacity={(1 - p) * 0.5 * (1 - finishT)}
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
          emissiveIntensity={2 * (1 - progress) * (1 - finishT)}
          color="#b388ff"
          transparent
          depthWrite={false}
          opacity={(1 - progress) * 0.4 * (1 - finishT)}
        />
      </mesh>
    </group>
  );
}

// ============================================================================
// POISON TOUCH EFFECT - Subtle activation (no center particles)
// ============================================================================

export function PoisonTouchEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 800);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 2;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  if (completed) return null;

  // Just a subtle green pulse - no center explosion
  return null; // Visual feedback happens when pieces are poisoned after capture
}

// ============================================================================
// ADDITIONAL CARD EFFECTS
// ============================================================================

export function BreakingPointEffect({ square, shatteredSquare, displaced = [], fadeOpacity = 1 }) {
  const epicenter = shatteredSquare || square;
  if (!epicenter) return null;

  const [x, , z] = squareToPosition(epicenter);
  const ageRef = useRef(0);
  const ringRef = useRef();

  const fragments = useMemo(() => {
    return [...Array(28)].map((_, i) => ({
      key: i,
      angle: (i / 28) * Math.PI * 2,
      radius: 0.18 + Math.random() * 0.3,
      speed: 1.1 + Math.random() * 1.5,
      rise: 0.15 + Math.random() * 0.35,
      phase: Math.random() * Math.PI * 2,
      color: i % 3 === 0 ? '#8de3ff' : '#ff4d4d',
    }));
  }, []);

  const displacedTrails = useMemo(() => {
    return (Array.isArray(displaced) ? displaced : [])
      .map((d, idx) => {
        if (!d?.from || !d?.to) return null;
        const [fx, , fz] = squareToPosition(d.from);
        const [tx, , tz] = squareToPosition(d.to);
        return {
          key: `${d.from}-${d.to}-${idx}`,
          from: [fx - x, 0.2, fz - z],
          to: [tx - x, 0.3, tz - z],
        };
      })
      .filter(Boolean);
  }, [displaced, x, z]);

  useFrame((state) => {
    ageRef.current += state.clock.getDelta();
    const t = state.clock.elapsedTime;
    const lifeT = Math.min(ageRef.current / 1.2, 1);

    if (ringRef.current) {
      const s = 0.6 + lifeT * 1.9;
      ringRef.current.scale.set(s, s, 1);
      ringRef.current.material.opacity = Math.max(0.02, (0.9 - lifeT * 0.85) * fadeOpacity);
    }

    const children = ringRef.current?.parent?.children || [];
    children.forEach((child) => {
      if (child.userData?.fragment && child.material) {
        child.material.opacity = Math.max(0.01, (0.8 - lifeT * 0.75) * fadeOpacity);
        child.position.y = child.userData.baseY + Math.sin(t * child.userData.speed + child.userData.phase) * 0.06 + lifeT * child.userData.rise;
      }
    });
  });

  return (
    <group position={[x, 0, z]}>
      <mesh ref={ringRef} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.25, 0.48, 36]} />
        <meshStandardMaterial
          emissive="#ff4d4d"
          emissiveIntensity={4.5}
          color="#ffd0d0"
          transparent
          depthWrite={false}
          opacity={0.88 * fadeOpacity}
        />
      </mesh>

      {fragments.map((f) => (
        <mesh
          key={f.key}
          userData={{ fragment: true, baseY: 0.24, speed: f.speed, rise: f.rise, phase: f.phase }}
          position={[Math.cos(f.angle) * f.radius, 0.24, Math.sin(f.angle) * f.radius]}
        >
          <octahedronGeometry args={[0.055, 0]} />
          <meshStandardMaterial
            emissive={f.color}
            emissiveIntensity={4.2}
            color={f.color}
            transparent
            depthWrite={false}
            opacity={0.78 * fadeOpacity}
          />
        </mesh>
      ))}

      {displacedTrails.map((trail) => (
        <BreakingPointTrail key={trail.key} from={trail.from} to={trail.to} fadeOpacity={fadeOpacity} />
      ))}
    </group>
  );
}

function BreakingPointTrail({ from, to, fadeOpacity = 1 }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const wobble = Math.sin(t * 8 + from[0] * 2.3) * 0.04;
    ref.current.position.set(
      (from[0] + to[0]) * 0.5,
      (from[1] + to[1]) * 0.5 + wobble,
      (from[2] + to[2]) * 0.5,
    );
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    ref.current.rotation.y = Math.atan2(dx, dz);
    const dist = Math.max(0.1, Math.hypot(dx, dz));
    ref.current.scale.set(1, 1, dist);
    ref.current.material.opacity = (0.34 + Math.sin(t * 10) * 0.12) * fadeOpacity;
  });

  return (
    <mesh ref={ref}>
      <planeGeometry args={[0.18, 0.75]} />
      <meshStandardMaterial
        emissive="#8de3ff"
        emissiveIntensity={3.8}
        color="#8de3ff"
        transparent
        depthWrite={false}
        opacity={0.4 * fadeOpacity}
      />
    </mesh>
  );
}

export function EdgerunnerOverdriveEffect({ square, targetSquare, dashPath = [], pieceType = 'n', pieceColor = 'w', fadeOpacity = 1 }) {
  const anchorSquare = square || targetSquare;
  if (!anchorSquare) return null;

  const [anchorX, , anchorZ] = squareToPosition(anchorSquare);
  const overlayRef = useRef();
  const ageRef = useRef(0);
  const [expired, setExpired] = useState(false);

  const orderedSquares = useMemo(() => {
    const sequence = [];
    if (targetSquare) sequence.push(targetSquare);
    if (Array.isArray(dashPath)) {
      for (const sq of dashPath) {
        if (sq && sequence[sequence.length - 1] !== sq) sequence.push(sq);
      }
    }
    if (!sequence.length) sequence.push(anchorSquare);
    if (square && sequence[sequence.length - 1] !== square) sequence.push(square);
    return sequence;
  }, [anchorSquare, dashPath, square, targetSquare]);

  const pathPositions = useMemo(
    () => orderedSquares.map((sq) => squareToPosition(sq)),
    [orderedSquares]
  );

  const afterimages = useMemo(() => {
    const ghosts = [];
    for (let i = 1; i < pathPositions.length; i++) {
      const [sx, , sz] = pathPositions[i - 1];
      const [ex, , ez] = pathPositions[i];
      const dx = ex - sx;
      const dz = ez - sz;
      if (Math.abs(dx) < 0.001 && Math.abs(dz) < 0.001) continue;
      for (let layer = 0; layer < 5; layer++) {
        const trailT = Math.max(0.08, 1 - (layer + 1) * 0.16);
        ghosts.push({
          key: `${i}-${layer}`,
          x: sx + dx * trailT - anchorX,
          z: sz + dz * trailT - anchorZ,
          dx,
          dz,
          layer,
          segment: i,
        });
      }
    }
    if (!ghosts.length) {
      ghosts.push({ key: 'idle-0', x: 0, z: 0, dx: 0, dz: 1, layer: 1, segment: 1 });
    }
    return ghosts;
  }, [anchorX, anchorZ, pathPositions]);

  useFrame((state) => {
    ageRef.current += state.clock.getDelta();
    const lifeT = Math.min(ageRef.current / 0.95, 1);
    if (lifeT >= 1 && !expired) {
      setExpired(true);
    }
    if (!overlayRef.current) return;
    const t = state.clock.elapsedTime;
    const pulse = 0.64 + Math.sin(t * 10.5) * 0.16;
    overlayRef.current.material.opacity = Math.max(0.02, pulse * fadeOpacity * (1 - lifeT));
  });

  if (expired) return null;

  return (
    <group position={[anchorX, 0, anchorZ]}>
      <mesh ref={overlayRef} position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.56, 0.56, 1.15, 32, 1, true]} />
        <meshStandardMaterial
          emissive="#39ff6d"
          emissiveIntensity={4.8}
          color="#7dff9f"
          transparent
          depthWrite={false}
          opacity={0.66 * fadeOpacity}
        />
      </mesh>

      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.8, 40]} />
        <meshStandardMaterial
          emissive="#39ff6d"
          emissiveIntensity={2.6}
          color="#39ff6d"
          transparent
          depthWrite={false}
          opacity={0.28 * fadeOpacity}
        />
      </mesh>

      {afterimages.map((ghost) => (
        <OverdriveAfterimage
          key={ghost.key}
          ghost={ghost}
          pieceType={pieceType}
          pieceColor={pieceColor}
          ageRef={ageRef}
          fadeOpacity={fadeOpacity}
        />
      ))}
    </group>
  );
}

function OverdriveAfterimage({ ghost, pieceType, pieceColor, ageRef, fadeOpacity = 1 }) {
  const ref = useRef();
  const rotationY = Math.atan2(ghost.dx, ghost.dz);
  const cyberpunkRamp = ['#10ff66', '#26ffd9', '#37c2ff', '#8a7dff', '#ff5ad9'];
  const colorIdx = Math.min(cyberpunkRamp.length - 1, ghost.layer);
  const emissiveColor = cyberpunkRamp[colorIdx];
  const baseColor = pieceColor === 'w' ? '#d8ffe6' : '#9fffd0';

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const lifeT = Math.min((ageRef.current || 0) / 1.45, 1);
    const flicker = 0.72 + Math.sin(t * 20 + ghost.layer * 1.7) * 0.18;
    ref.current.material.opacity = Math.max(0.01, flicker * (0.62 - ghost.layer * 0.1) * fadeOpacity * (1 - lifeT));
  });

  const scaleX = 1 - ghost.layer * 0.08;
  const scaleZ = 1 - ghost.layer * 0.06;

  return (
    <group
      position={[ghost.x, 0.14 + ghost.layer * 0.02, ghost.z]}
      rotation={[0, rotationY, 0]}
      scale={[scaleX, 1, scaleZ]}
    >
      <OverdriveGhostPieceMesh
        meshRef={ref}
        pieceType={pieceType}
        baseColor={baseColor}
        emissiveColor={emissiveColor}
        fadeOpacity={fadeOpacity}
      />
    </group>
  );
}

function OverdriveGhostPieceMesh({ meshRef, pieceType, baseColor, emissiveColor, fadeOpacity }) {
  const materialProps = {
    emissive: emissiveColor,
    emissiveIntensity: 3.6,
    color: baseColor,
    transparent: true,
    depthWrite: false,
    opacity: 0.38 * fadeOpacity,
  };

  switch (pieceType) {
    case 'p':
      return (
        <mesh ref={meshRef} position={[0, 0.28, 0]}>
          <cylinderGeometry args={[0.11, 0.14, 0.5, 12]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      );
    case 'n':
      return (
        <mesh ref={meshRef} position={[0, 0.34, 0]}>
          <boxGeometry args={[0.3, 0.62, 0.22]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      );
    case 'b':
      return (
        <mesh ref={meshRef} position={[0, 0.36, 0]}>
          <coneGeometry args={[0.16, 0.72, 14]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      );
    case 'r':
      return (
        <mesh ref={meshRef} position={[0, 0.35, 0]}>
          <cylinderGeometry args={[0.16, 0.16, 0.68, 10]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      );
    case 'q':
      return (
        <mesh ref={meshRef} position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.17, 0.2, 0.8, 14]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      );
    case 'k':
      return (
        <mesh ref={meshRef} position={[0, 0.44, 0]}>
          <cylinderGeometry args={[0.18, 0.22, 0.86, 14]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      );
    default:
      return (
        <mesh ref={meshRef} position={[0, 0.34, 0]}>
          <boxGeometry args={[0.3, 0.62, 0.22]} />
          <meshStandardMaterial {...materialProps} />
        </mesh>
      );
  }
}

// Iron Fortress Effect
export function IronFortressEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 400);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.8;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  // Create fortress walls around pawn starting ranks
  if (completed) return null;
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
            emissiveIntensity={1.5 * (1 - progress * 0.5) * (1 - finishT)}
            color="#90a4ae"
            transparent
            depthWrite={false}
            opacity={0.7 * (1 - progress * 0.3) * (1 - finishT)}
          />
        </mesh>
      ))}
      
      {/* Magical shimmer */}
      <mesh position={[0, 0.3, -2.5]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 1]} />
        <meshStandardMaterial
          emissive="#b0bec5"
          emissiveIntensity={2 * (1 - progress) * (1 - finishT)}
          color="#cfd8dc"
          transparent
          depthWrite={false}
          opacity={(1 - progress) * 0.4 * (1 - finishT)}
          
        />
      </mesh>
    </group>
  );
}

// Divine Intervention Effect
export function DivineInterventionEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 600);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.6;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  if (completed) return null;

  // Pawn descends from heaven (0-0.7), impact (0.7-1.0)
  const descentPhase = Math.min(progress / 0.7, 1);
  const impactPhase = Math.max((progress - 0.7) / 0.3, 0);

  return (
    <group position={[x, 0, z]}>
      {/* Pawn silhouette falling from heaven */}
      {descentPhase < 1 && (
        <mesh position={[0, 5 - descentPhase * 4.5, 0]}>
          <cylinderGeometry args={[0.15, 0.2, 0.5, 16]} />
          <meshStandardMaterial
            emissive="#ffd700"
            emissiveIntensity={4}
            color="#fff9c4"
            transparent
            opacity={1 - finishT}
          />
        </mesh>
      )}
      
      {/* Heavenly light beam following pawn */}
      <mesh position={[0, 5 - descentPhase * 2.5, 0]}>
        <cylinderGeometry args={[0.2, 0.5, 5 * descentPhase, 32, 1, true]} />
        <meshStandardMaterial
          emissive="#ffd700"
          emissiveIntensity={3 * (1 - finishT)}
          color="#fff9c4"
          transparent
          depthWrite={false}
          opacity={0.5 * (1 - progress * 0.3) * (1 - finishT)}
        />
      </mesh>
      
      {/* Angel particles falling with pawn */}
      {[...Array(32)].map((_, i) => {
        const angle = (i / 32) * Math.PI * 2;
        const radius = 0.4 + Math.sin(progress * Math.PI * 2 + i) * 0.2;
        const fallSpeed = 1 + (i % 4) * 0.2;
        
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * radius,
              5 - descentPhase * 4.5 * fallSpeed + Math.sin(progress * Math.PI * 3 + i) * 0.3,
              Math.sin(angle) * radius
            ]}
          >
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial
              emissive="#ffeb3b"
              emissiveIntensity={3}
              color="#fff9c4"
              transparent
              depthWrite={false}
              opacity={(1 - progress * 0.4) * 0.9 * (1 - finishT)}
            />
          </mesh>
        );
      })}
      
      {/* Impact flash on landing */}
      {impactPhase > 0 && (
        <>
          <mesh position={[0, 0.3, 0]}>
            <sphereGeometry args={[impactPhase * 1.2, 32, 32]} />
            <meshStandardMaterial
              emissive="#ffffff"
              emissiveIntensity={5 * (1 - impactPhase)}
              color="#fff9c4"
              transparent
              depthWrite={false}
              opacity={(1 - impactPhase) * 0.8}
            />
          </mesh>
          
          {/* Impact ring */}
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[impactPhase * 0.5, impactPhase * 1.3, 32]} />
            <meshStandardMaterial
              emissive="#ffd700"
              emissiveIntensity={4 * (1 - impactPhase)}
              color="#fff9c4"
              transparent
              depthWrite={false}
              opacity={(1 - impactPhase) * 0.7}
            />
          </mesh>
        </>
      )}
    </group>
  );
}

// Execution Effect
export function ExecutionEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 600);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.8; // Slower for blade animation
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  if (completed) return null;

  // Calculate animation phases
  const bladePhase = Math.min(progress * 2, 1); // First half: blade falls
  const explosionPhase = Math.max((progress - 0.7) * 3.33, 0); // Last 30%: blood explosion

  return (
    <group position={[x, 0, z]}>
      {/* Target piece - visible until blade hits */}
      {bladePhase < 0.9 && (
        <mesh position={[0, 0.4, 0]}>
          <cylinderGeometry args={[0.3, 0.3, 0.5, 16]} />
          <meshStandardMaterial
            color="#666666"
            transparent
            opacity={(1 - bladePhase * 1.5) * 0.7 * (1 - finishT)}
            emissive="#444444"
            emissiveIntensity={0.3}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* Falling blade (silver/metallic) */}
      {bladePhase < 1 && (
        <mesh 
          position={[0, 3 - bladePhase * 2.5, 0]} 
          rotation={[0, 0, Math.PI / 4]}
        >
          <boxGeometry args={[0.15, 1.2, 0.05]} />
          <meshStandardMaterial
            color="#c0c0c0"
            emissive="#ffffff"
            emissiveIntensity={2 * (1 - bladePhase)}
            metalness={0.9}
            roughness={0.1}
            transparent
            opacity={1 - finishT}
          />
        </mesh>
      )}
      
      {/* Slice impact flash */}
      {bladePhase > 0.8 && bladePhase < 1 && (
        <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
          <planeGeometry args={[1.5, 0.15]} />
          <meshStandardMaterial
            emissive="#ff0000"
            emissiveIntensity={8 * (1 - Math.abs(bladePhase - 0.9) * 10)}
            color="#ffffff"
            transparent
            depthWrite={false}
            opacity={0.8 * (1 - Math.abs(bladePhase - 0.9) * 10)}
          />
        </mesh>
      )}
      
      {/* Blood explosion particles */}
      {explosionPhase > 0 && [...Array(32)].map((_, i) => {
        const angle = (i / 32) * Math.PI * 2;
        const vertAngle = (Math.random() - 0.5) * Math.PI * 0.5;
        const dist = explosionPhase * (0.8 + Math.random() * 1.2);
        
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * dist,
              0.5 + Math.sin(vertAngle) * dist * 0.8 - explosionPhase * 0.5, // Gravity
              Math.sin(angle) * dist
            ]}
            scale={[1 - explosionPhase * 0.3, 1 - explosionPhase * 0.3, 1]}
          >
            <sphereGeometry args={[0.06 + Math.random() * 0.04, 6, 6]} />
            <meshStandardMaterial
              emissive="#8B0000"
              emissiveIntensity={4 * (1 - explosionPhase)}
              color="#ff0000"
              transparent
              depthWrite={false}
              opacity={(1 - explosionPhase) * 0.9 * (1 - finishT)}
            />
          </mesh>
        );
      })}
      
      {/* Blood splash ground stain */}
      {explosionPhase > 0.3 && (
        <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[explosionPhase * 0.8, 32]} />
          <meshStandardMaterial
            color="#8B0000"
            emissive="#8B0000"
            emissiveIntensity={0.5 * (1 - explosionPhase)}
            transparent
            depthWrite={false}
            opacity={0.7 * (1 - finishT)}
          />
        </mesh>
      )}
    </group>
  );
}

// Time Freeze Effect
export function TimeFreezeEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 350);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.8;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  if (completed) return null;

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
          depthWrite={false}
          opacity={0.5 * (1 - progress * 0.3)}
          
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
                  emissiveIntensity={2 * (1 - finishT)}
                  color="#b3e5fc"
                  transparent
                  depthWrite={false}
                  opacity={(1 - progress * 0.5) * 0.7 * (1 - finishT)}
                />
          </mesh>
        );
      })}
      
      {/* Frozen wave */}
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[progress * 6, progress * 6, 1]}>
        <circleGeometry args={[1, 32]} />
        <meshStandardMaterial
          emissive="#4fc3f7"
          emissiveIntensity={1.5 * (1 - progress)}
          color="#81d4fa"
          transparent
          depthWrite={false}
          opacity={(1 - progress) * 0.3}
        />
      </mesh>
    </group>
  );
}

// Time Travel Effect - Rewind animation with temporal trails
export function TimeTravelEffect({ onComplete }) {
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 700);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.5;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  if (completed) return null;

  return (
    <group>
      {/* Time rewind spiral vortex above board */}
      {[...Array(24)].map((_, i) => {
        const angle = (i / 24) * Math.PI * 2 - progress * Math.PI * 6; // Reverse rotation
        const layer = Math.floor(i / 8);
        const radius = 3 + layer * 0.8;
        const height = 2 + layer * 1.5 - progress * 2;
        
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * radius,
              height,
              Math.sin(angle) * radius
            ]}
          >
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial
              emissive="#3498db"
              emissiveIntensity={2.5 * (1 - progress * 0.4) * (1 - finishT)}
              color="#64b5f6"
              transparent
              depthWrite={false}
              opacity={(1 - progress * 0.5) * 0.8 * (1 - finishT)}
            />
          </mesh>
        );
      })}
      
      {/* Afterimage trails from pieces rewinding */}
      {[...Array(32)].map((_, i) => {
        const angle = (i / 32) * Math.PI * 2 + progress * 2;
        const rewindDist = easeOutCubic(progress) * 4;
        const afterimageIndex = i % 8; // Multiple afterimage layers
        const trailProgress = Math.max(0, Math.min(1, progress - afterimageIndex * 0.1));
        
        return (
          <mesh
            key={`trail-${i}`}
            position={[
              Math.cos(angle) * rewindDist * (1 - afterimageIndex * 0.1),
              0.4 + Math.sin(progress * Math.PI * 2 + i) * 0.2,
              Math.sin(angle) * rewindDist * (1 - afterimageIndex * 0.1)
            ]}
          >
            <boxGeometry args={[0.1, 0.15, 0.1]} />
            <meshStandardMaterial
              emissive="#1e88e5"
              emissiveIntensity={1.8 * (1 - trailProgress) * (1 - finishT)}
              color="#42a5f5"
              transparent
              depthWrite={false}
              opacity={(1 - trailProgress * 0.8) * 0.6 * (afterimageIndex / 8) * (1 - finishT)} // Fade each afterimage layer + smooth finish fade
            />
          </mesh>
        );
      })}
      
      {/* Central time vortex disc */}
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, -progress * Math.PI * 4]}>
        <ringGeometry args={[2 * progress, 2.5 * progress, 48]} />
        <meshStandardMaterial
          emissive="#2196f3"
          emissiveIntensity={2 * (1 - progress * 0.5) * (1 - finishT)}
          color="#64b5f6"
          transparent
          depthWrite={false}
          opacity={(1 - progress * 0.6) * 0.5 * (1 - finishT)}
        />
      </mesh>
      
      {/* Temporal field wireframe (monochrome effect visual cue) */}
      <mesh position={[0, 2, 0]} rotation={[0, -progress * Math.PI * 3, 0]}>
        <icosahedronGeometry args={[3 * progress, 2]} />
        <meshStandardMaterial
          emissive="#0d47a1"
          emissiveIntensity={1.2 * (1 - progress * 0.6) * (1 - finishT)}
          color="#1565c0"
          transparent
          opacity={(1 - progress * 0.8) * 0.3 * (1 - finishT)}
          wireframe={true}
        />
      </mesh>
    </group>
  );
}

// Astral Rebirth Effect - Yellow glow with astral particles
export function AstralRebirthEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 500);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.7;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  if (completed) return null;

  return (
    <group position={[x, 0, z]}>
      {/* Golden glow sphere */}
      <mesh position={[0, 0.5, 0]}>
        <sphereGeometry args={[0.6 * easeOutElastic(progress), 32, 32]} />
        <meshStandardMaterial
          emissive="#ffeb3b"
          emissiveIntensity={3 * (1 - progress * 0.5) * (1 - finishT)}
          color="#fff59d"
          transparent
          depthWrite={false}
          opacity={0.4 * (1 - progress * 0.3) * (1 - finishT)}
        />
      </mesh>
      
      {/* Spiral astral particles */}
      {[...Array(48)].map((_, i) => {
        const angle = (i / 48) * Math.PI * 2 + progress * Math.PI * 3;
        const spiralHeight = (i / 48) * 2;
        const radius = 0.3 + Math.sin(progress * Math.PI) * 0.5;
        
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * radius,
              spiralHeight * (1 - progress),
              Math.sin(angle) * radius
            ]}
          >
            <sphereGeometry args={[0.04, 8, 8]} />
            <meshStandardMaterial
              emissive="#ffeb3b"
              emissiveIntensity={4 * (1 - progress * 0.6)}
              color="#fff9c4"
              transparent
              depthWrite={false}
              opacity={(1 - progress * 0.5) * 0.9 * (1 - finishT)}
            />
          </mesh>
        );
      })}
      
      {/* Yellow flash ring */}
      <mesh position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.8 * easeOutCubic(progress), 32]} />
        <meshStandardMaterial
          emissive="#ffeb3b"
          emissiveIntensity={2 * (1 - progress)}
          color="#fff59d"
          transparent
          depthWrite={false}
          opacity={0.5 * (1 - progress * 0.7) * (1 - finishT)}
        />
      </mesh>
    </group>
  );
}

// Mind Control Effect - Purple aura
export function MindControlEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 400);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.8;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  if (completed) return null;

  return (
    <group position={[x, 0, z]}>
      {/* Purple pulsing aura */}
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.45, 0.45, 1.2, 32, 1, true]} />
        <meshStandardMaterial
          emissive="#9c27b0"
          emissiveIntensity={2.5 * (1 + Math.sin(progress * Math.PI * 6) * 0.3) * (1 - finishT)}
          color="#ce93d8"
          transparent
          depthWrite={false}
          opacity={0.5 * (1 - progress * 0.2) * (1 - finishT)}
          side={THREE.DoubleSide}
        />
      </mesh>
      
      {/* Mind control particles swirling */}
      {[...Array(16)].map((_, i) => {
        const angle = (i / 16) * Math.PI * 2 + progress * Math.PI * 4;
        const radius = 0.5 + Math.sin(progress * Math.PI * 3) * 0.2;
        
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * radius,
              0.5 + Math.sin(angle + progress * Math.PI * 2) * 0.3,
              Math.sin(angle) * radius
            ]}
          >
            <sphereGeometry args={[0.05, 8, 8]} />
            <meshStandardMaterial
              emissive="#9c27b0"
              emissiveIntensity={3}
              color="#ce93d8"
              transparent
              depthWrite={false}
              opacity={0.8 * (1 - finishT)}
            />
          </mesh>
        );
      })}
      
      {/* Purple ground circle */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, progress * Math.PI]}>
        <ringGeometry args={[0.4, 0.6, 32]} />
        <meshStandardMaterial
          emissive="#9c27b0"
          emissiveIntensity={1.5}
          color="#ce93d8"
          transparent
          depthWrite={false}
          opacity={0.6 * (1 - finishT)}
        />
      </mesh>
    </group>
  );
}

// Promotion Ritual Effect - Divine light beam striking pawn
export function PromotionRitualEffect({ square, onComplete }) {
  if (!square) return null;
  
  const [x, , z] = squareToPosition(square);
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 600);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 0.6;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  if (completed) return null;

  const beamPhase = Math.min(progress * 1.5, 1);
  const flashPhase = Math.max((progress - 0.6) * 2.5, 0);

  return (
    <group position={[x, 0, z]}>
      {/* Light beam falling from heaven */}
      <mesh position={[0, 3.5, 0]}>
        <cylinderGeometry args={[0.15, 0.3, 7 * beamPhase, 32, 1, true]} />
        <meshStandardMaterial
          emissive="#ffeb3b"
          emissiveIntensity={4 * (1 - finishT)}
          color="#fff9c4"
          transparent
          depthWrite={false}
          opacity={0.7 * (1 - progress * 0.3) * (1 - finishT)}
        />
      </mesh>
      
      {/* Impact flash */}
      {flashPhase > 0 && (
        <mesh position={[0, 0.5, 0]}>
          <sphereGeometry args={[flashPhase * 0.8, 32, 32]} />
          <meshStandardMaterial
            emissive="#ffffff"
            emissiveIntensity={6 * (1 - flashPhase)}
            color="#fff9c4"
            transparent
            depthWrite={false}
            opacity={(1 - flashPhase) * 0.9}
          />
        </mesh>
      )}
      
      {/* Radiant particles */}
      {beamPhase > 0.5 && [...Array(32)].map((_, i) => {
        const angle = (i / 32) * Math.PI * 2;
        const dist = flashPhase * 1.2;
        
        return (
          <mesh
            key={i}
            position={[
              Math.cos(angle) * dist,
              0.5,
              Math.sin(angle) * dist
            ]}
          >
            <sphereGeometry args={[0.06, 8, 8]} />
            <meshStandardMaterial
              emissive="#ffeb3b"
              emissiveIntensity={3 * (1 - flashPhase)}
              color="#fff59d"
              transparent
              depthWrite={false}
              opacity={(1 - flashPhase) * 0.8}
            />
          </mesh>
        );
      })}
      
      {/* Ground glow ring */}
      <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.7 * beamPhase, 32]} />
        <meshStandardMaterial
          emissive="#ffeb3b"
          emissiveIntensity={2}
          color="#fff9c4"
          transparent
          depthWrite={false}
          opacity={0.6 * (1 - progress * 0.5) * (1 - finishT)}
        />
      </mesh>
    </group>
  );
}

// Chain Lightning Effect
export function ChainLightningEffect({ origin, chained, onComplete }) {
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, triggerFinish } = useFinishFade(onComplete, 300);
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 2.5;
      if (next >= 1) {
        if (!finishing) triggerFinish();
      }
      return Math.min(next, 1);
    });
  });
  
  const sourceSquare = origin || null;
  const targetSquares = Array.isArray(chained) ? chained : [];
  if (!sourceSquare || targetSquares.length === 0) {
    return null;
  }

  const originPos = squareToPosition(sourceSquare);
  
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
      {targetSquares.map((sq, i) => {
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
                    emissiveIntensity={4 * (1 - p * 0.5) * (1 - finishT)}
                    color="#ffeb3b"
                    transparent
                    opacity={(1 - p) * 0.9 * (1 - finishT)}
                  />
                </mesh>
              );
            })}
            
            {/* Impact spark */}
            <mesh position={[targetPos[0], 0.5, targetPos[2]]}>
              <sphereGeometry args={[0.15 * p, 12, 12]} />
              <meshStandardMaterial
                emissive="#ffeb3b"
                emissiveIntensity={5 * p * (1 - progress) * (1 - finishT)}
                color="#fff59d"
                transparent
                opacity={p * (1 - progress) * 0.9 * (1 - finishT)}
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
  const { finishing, finishT, triggerFinish } = useFinishFade(onComplete, 600);
  
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
        if (!finishing) triggerFinish();
        return 1;
      }
      return next;
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.8 * (1 - finishT * 0.5);
    }
  });
  
  const opacity = (progress < 0.1 ? progress * 10 : progress > 0.8 ? (1 - progress) * 5 : 1) * (1 - finishT);
  
  return (
    <group ref={groupRef} position={[0, 2, 0]}>
      {/* Central vortex */}
      <mesh>
        <torusGeometry args={[2, 0.1, 16, 100]} />
        <meshStandardMaterial
          emissive="#9b59b6"
          emissiveIntensity={3 * (1 - finishT)}
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
              emissiveIntensity={2 * (1 - finishT)}
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
  // Disable Vision visual effect — no rendering, immediately notify completion.
  useEffect(() => {
    if (onComplete) {
      // call on next tick so callers expecting async completion continue to work
      const id = setTimeout(() => onComplete(), 0);
      return () => clearTimeout(id);
    }
    return undefined;
  }, [onComplete]);

  return null;
}

// Double Strike Effect - yellow lightning from move-from to move-to
export function DoubleStrikeEffect({ square, from, to, onComplete }) {
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 400);
  const groupRef = useRef();

  // Use parameters or fallback to square
  const originPos = from ? squareToPosition(from) : (square ? squareToPosition(square) : [0, 0, 0]);
  const targetPos = to ? squareToPosition(to) : (square ? squareToPosition(square) : [0, 0, 0]);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 2.2;
      if (next >= 1 && !finishing) triggerFinish();
      return Math.min(next, 1);
    });

    if (groupRef.current) {
      groupRef.current.rotation.z += delta * 4;
    }
  });

  if (completed) return null;

  const opacity = (1 - progress) * (1 - finishT);

  return (
    <group ref={groupRef}>
      {/* Lightning trail from origin to target */}
      {from && to && [...Array(8)].map((_, j) => {
        const t = j / 7;
        const x = originPos[0] + (targetPos[0] - originPos[0]) * t;
        const z = originPos[2] + (targetPos[2] - originPos[2]) * t;
        const jitter = Math.sin(t * 20 + progress * 15) * 0.15;

        return (
          <mesh key={`bolt-${j}`} position={[x + jitter, 0.3 + Math.sin(t * Math.PI) * 0.4, z + jitter]}>
            <sphereGeometry args={[0.12, 8, 8]} />
            <meshStandardMaterial
              emissive="#ffdd00"
              emissiveIntensity={5 * opacity}
              color="#ffff00"
              transparent
              depthWrite={false}
              opacity={0.8 * opacity}
            />
          </mesh>
        );
      })}

      {/* Origin spark (bright yellow) */}
      <mesh position={[originPos[0], 0.4, originPos[2]]}>
        <sphereGeometry args={[0.25 * (1 - progress * 0.3), 16, 16]} />
        <meshStandardMaterial
          emissive="#ffff00"
          emissiveIntensity={6 * opacity}
          color="#ffff99"
          transparent
          depthWrite={false}
          opacity={0.85 * opacity}
        />
      </mesh>

      {/* Target impact (bright yellow burst) */}
      <mesh position={[targetPos[0], 0.4, targetPos[2]]}>
        <sphereGeometry args={[0.3 * progress, 16, 16]} />
        <meshStandardMaterial
          emissive="#ffdd00"
          emissiveIntensity={6 * (1 - progress) * opacity}
          color="#ffff99"
          transparent
          depthWrite={false}
          opacity={0.7 * (1 - progress) * opacity}
        />
      </mesh>

      {/* Secondary particles around target */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2 + progress * Math.PI;
        const dist = progress * 0.6;
        const y = 0.5 + progress * 0.3;

        return (
          <mesh key={`spark-${i}`} position={[
            targetPos[0] + Math.cos(angle) * dist,
            y,
            targetPos[2] + Math.sin(angle) * dist
          ]}>
            <sphereGeometry args={[0.04, 6, 6]} />
            <meshStandardMaterial
              emissive="#ffdd00"
              emissiveIntensity={4 * opacity}
              color="#ffff99"
              transparent
              depthWrite={false}
              opacity={0.7 * opacity}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Berserker Rage Effect - violent crimson burst with lightning trail
export function BerserkerRageEffect({ square, from, to, onComplete }) {
  const [progress, setProgress] = useState(0);
  const originPos = from ? squareToPosition(from) : (square ? squareToPosition(square) : [0, 0, 0]);
  const targetPos = to ? squareToPosition(to) : (square ? squareToPosition(square) : [0, 0, 0]);
  const groupRef = useRef();
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 350);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.8;
      if (next >= 1 && !finishing) triggerFinish();
      return Math.min(next, 1);
    });

    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 3.5;
    }
  });

  if (completed) return null;

  const opacity = (1 - progress) * (1 - finishT);
  const ringScale = 0.5 + progress * 1.8;

  return (
    <group ref={groupRef}>
      {/* Red lightning trail from origin to target (if both provided) */}
      {from && to && [...Array(8)].map((_, j) => {
        const t = j / 7;
        const x = originPos[0] + (targetPos[0] - originPos[0]) * t;
        const z = originPos[2] + (targetPos[2] - originPos[2]) * t;
        const jitter = Math.sin(t * 15 + progress * 12) * 0.12;

        return (
          <mesh key={`bolt-${j}`} position={[x + jitter, 0.25 + Math.sin(t * Math.PI) * 0.35, z + jitter]}>
            <sphereGeometry args={[0.1, 8, 8]} />
            <meshStandardMaterial
              emissive="#ff1744"
              emissiveIntensity={5 * opacity}
              color="#ff5252"
              transparent
              depthWrite={false}
              opacity={0.8 * opacity}
            />
          </mesh>
        );
      })}

      {/* Main burst at the capture square */}
      <mesh position={[targetPos[0], 0.05, targetPos[2]]} rotation={[-Math.PI / 2, 0, 0]} scale={[ringScale, ringScale, 1]}>
        <ringGeometry args={[0.25, 0.45, 40]} />
        <meshStandardMaterial
          emissive="#ff1744"
          emissiveIntensity={3.2 * opacity}
          color="#ff5252"
          transparent
          depthWrite={false}
          opacity={0.75 * opacity}
        />
      </mesh>

      {/* Crimson particles radiating from capture point */}
      {[...Array(10)].map((_, i) => {
        const angle = (i / 10) * Math.PI * 2;
        const dist = 0.2 + progress * 1.0;
        const y = 0.15 + progress * 0.45;
        return (
          <mesh key={i} position={[targetPos[0] + Math.cos(angle) * dist, y, targetPos[2] + Math.sin(angle) * dist]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial
              emissive="#ff6f00"
              emissiveIntensity={4 * opacity}
              color="#ffab40"
              transparent
              depthWrite={false}
              opacity={0.85 * opacity}
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
  if (!square || typeof square !== 'string') {
    return null;
  }

  const [x, , z] = squareToPosition(square);
  
  const { finishing, finishT, triggerFinish } = useFinishFade(onComplete, 400);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta / 2;
      if (next >= 1) {
        if (!finishing) triggerFinish();
        return 1;
      }
      return next;
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5 * (1 - finishT * 0.5);
    }
  });
  
  const opacity = (progress < 0.1 ? progress * 10 : progress > 0.8 ? (1 - progress) * 5 : 1) * (1 - finishT);
  
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
          
        />
      </mesh>
      
      {/* Base ring */}
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
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
export function SanctuaryIndicatorEffect({ square, fadeOpacity = 1 }) {
  if (!square || typeof square !== 'string') {
    return null;
  }

  const [x, , z] = squareToPosition(square);
  const ringRef = useRef();
  const glowRef = useRef();
  
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) {
      ringRef.current.material.opacity = (0.3 + Math.sin(t * 2) * 0.15) * fadeOpacity;
    }
    if (glowRef.current) {
      glowRef.current.material.opacity = (0.2 + Math.sin(t * 1.5) * 0.1) * fadeOpacity;
    }
  });
  
  return (
    <group position={[x, 0.12, z]}>
      {/* Persistent ground glow */}
      <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} ref={glowRef}>
        <circleGeometry args={[0.48, 32]} />
        <meshStandardMaterial
          emissive="#ffd700"
          emissiveIntensity={1.5}
          color="#ffeb3b"
          transparent
          opacity={0.25 * fadeOpacity}
          
          depthWrite={false}
        />
      </mesh>
      {/* Animated ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.45, 32]} />
        <meshStandardMaterial
          emissive="#ffd700"
          emissiveIntensity={2}
          color="#ffeb3b"
          transparent
          opacity={0.4 * fadeOpacity}
          
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

// ============================================================================
// CURSED SQUARE EFFECT - Dark malevolent energy on a square
// ============================================================================

export function CursedSquareEffect({ square, onComplete, fadeOpacity = 1 }) {
  const [progress, setProgress] = useState(0);
  const groupRef = useRef();
  const { finishing, finishT, triggerFinish } = useFinishFade(onComplete, 400);
  
  const [x, , z] = square ? squareToPosition(square) : [0, 0, 0];
  
  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta / 2;
      if (next >= 1) {
        if (!finishing) triggerFinish();
        return 1;
      }
      return next;
    });
    
    if (groupRef.current) {
      groupRef.current.rotation.y -= delta * 0.8 * (1 - finishT * 0.5);
    }
  });
  
  const opacity = ((progress < 0.1 ? progress * 10 : progress > 0.8 ? (1 - progress) * 5 : 1) * (1 - finishT)) * fadeOpacity;
  
  return (
    <group position={[x, 0, z]} ref={groupRef}>
      {/* Dark ring on ground - non-emissive */}
      <mesh position={[0, 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.45, 32]} />
        <meshStandardMaterial
          color="#4a0000"
          transparent
          opacity={opacity * 0.4}
          depthWrite={false}
        />
      </mesh>
      
      {/* Thin cursed particles rising */}
      {[...Array(12)].map((_, i) => {
        const angle = (i / 12) * Math.PI * 2;
        const r = 0.25 * Math.random() + 0.08;
        const rise = ((progress * 2 + i * 0.06) % 1);
        
        return (
          <mesh
            key={i}
            position={[Math.cos(angle + progress * 2.5) * r, rise * 0.4, Math.sin(angle + progress * 2.5) * r]}
          >
            <sphereGeometry args={[0.012, 4, 4]} />
            <meshStandardMaterial
              color="#8b0000"
              transparent
              opacity={opacity * (1 - rise) * 0.6}
              depthWrite={false}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// Persistent cursed square indicator
export function CursedSquareIndicatorEffect({ square, turnsLeft, fadeOpacity = 1 }) {
  const [x, , z] = square ? squareToPosition(square) : [0, 0, 0];
  const ringRef = useRef();
  const glowRef = useRef();

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (ringRef.current) {
      ringRef.current.rotation.z = t * 0.5;
      ringRef.current.material.opacity = (0.3 + Math.sin(t * 3) * 0.1) * fadeOpacity;
    }
    if (glowRef.current) {
      glowRef.current.material.opacity = (0.25 + Math.sin(t * 2) * 0.1) * fadeOpacity;
    }
  });

  return (
    <group position={[x, 0.12, z]}>
      {/* Persistent dark ground effect */}
      <mesh position={[0, -0.1, 0]} rotation={[-Math.PI / 2, 0, 0]} ref={glowRef}>
        <circleGeometry args={[0.48, 32]} />
        <meshStandardMaterial
          color="#4a0000"
          transparent
          opacity={0.25 * fadeOpacity}
          depthWrite={false}
        />
      </mesh>
      {/* Animated ring */}
      <mesh ref={ringRef} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.42, 6]} />
        <meshStandardMaterial
          color="#8b0000"
          transparent
          opacity={0.35 * fadeOpacity}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
