import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { squareToPosition } from './sharedHelpers.jsx';

// Import GPU particle system (only used components)
import {
  ParticleShield,
  ParticlePoison,
  ParticleBurst,
  ParticleRing,
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
      {/* <mesh ref={auraRef} position={[0, 0.4, 0]}>
        <cylinderGeometry args={[0.4, 0.35, 0.8, 16, 1, true]} />
        <meshStandardMaterial
          emissive={baseColor}
          emissiveIntensity={urgency * 1.5}
          color={baseColor}
          transparent
          depthWrite={false}
          opacity={0.35 * fadeOpacity}
          
        />
      </mesh> */}
      
      {/* Dripping poison effect */}
      {/* {[...Array(6)].map((_, i) => (
        <PoisonDrip
          key={i}
          angle={(i / 6) * Math.PI * 2}
          radius={0.35}
          color={baseColor}
          speed={urgency}
          delay={i * 0.3}
          fadeOpacity={fadeOpacity}
        />
      ))} */}
      
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
      
      {/* GPU particle poison bubbles */}
      <ParticlePoison color={baseColor} intensity={urgency} count={30} />
    </group>
  );
}

export function MirrorImageDurationEffect({ square, turnsLeft = 0, fadeOpacity = 1 }) {
  if (!square || !Number.isFinite(turnsLeft) || turnsLeft <= 0) return null;

  const [x, , z] = squareToPosition(square);
  const turnsDisplay = Math.ceil(turnsLeft / 2);
  const urgency = turnsLeft <= 2 ? 2.4 : 1.2;

  return (
    <group position={[x, 0.18, z]}>
      <mesh position={[0, 0.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.15, 0.2, 28]} />
        <meshStandardMaterial
          emissive="#66c7ff"
          emissiveIntensity={2.6 * urgency}
          color="#66c7ff"
          transparent
          depthWrite={false}
          opacity={0.55 * fadeOpacity}
        />
      </mesh>

      <group position={[0, 0.92, 0]}>
        {[...Array(turnsDisplay)].map((_, i) => {
          const angle = (i / turnsDisplay) * Math.PI * 2 - Math.PI / 2;
          const radius = 0.085;
          return (
            <mesh key={i} position={[Math.cos(angle) * radius, 0.02, Math.sin(angle) * radius]}>
              <sphereGeometry args={[0.024, 8, 8]} />
              <meshStandardMaterial
                emissive="#d7f4ff"
                emissiveIntensity={4.8}
                color="#d7f4ff"
                transparent
                depthWrite={false}
                opacity={0.9 * fadeOpacity}
              />
            </mesh>
          );
        })}
      </group>
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
  const [age, setAge] = useState(0);
  const groupRef = useRef();

  const fadeInDuration = 1.2; // seconds
  const visibleDuration = 5.5; // seconds, ensures longer full fog presence
  const fadeOutDuration = 1.0; // seconds

  // Generate cloud particles - reduced density for readability and perf
  const clouds = useMemo(() => {
    return [...Array(48)].map(() => ({
      x: (Math.random() - 0.5) * 12,
      z: (Math.random() - 0.5) * 12,
      y: 0.1 + Math.random() * 0.8,
      scale: 0.3 + Math.random() * 0.4, // smaller clouds
      speed: 0.05 + Math.random() * 0.12,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);

  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, fadeOutDuration * 1000);

  useFrame((state, delta) => {
    setAge((prev) => {
      const next = prev + delta;
      if (!finishing && next >= fadeInDuration + visibleDuration) {
        triggerFinish();
      }
      return next;
    });
  });

  if (completed) return null;

  const fadeInProgress = Math.min(age / fadeInDuration, 1);

  return (
    <group ref={groupRef}>
      {clouds.map((cloud, i) => (
        <FogCloud
          key={i}
          {...cloud}
          fadeInProgress={fadeInProgress}
          fading={finishing}
          finishT={finishT}
        />
      ))}
      {/* Ground fog plane removed - just particles now */}
    </group>
  );
}

function FogCloud({ x, z, y, scale, speed, phase, fadeInProgress, fading, finishT = 0, fadeOpacity = 1 }) {
  const ref = useRef();

  useFrame((state) => {
    if (ref.current) {
      const t = state.clock.elapsedTime;
      ref.current.position.x = x + Math.sin(t * speed + phase) * 0.8;
      ref.current.position.z = z + Math.cos(t * speed + phase) * 0.8;
      ref.current.position.y = y + Math.sin(t * speed * 2 + phase) * 0.15;

      const shimmer = Math.sin(t + phase) * 0.045;
      const baseOpacity = 0.08 + shimmer; // generally more transparent
      const fadeOutFactor = fading ? Math.max(0, 1 - finishT) : 1;
      ref.current.material.opacity = Math.max(0, baseOpacity * fadeInProgress * fadeOutFactor) * fadeOpacity;
    }
  });

  return (
    <mesh ref={ref} position={[x, y, z]}>
      <sphereGeometry args={[scale, 10, 10]} />
      <meshStandardMaterial
        emissive="#17202a"
        emissiveIntensity={0.3}
        color="#ffffff"
        transparent
        depthWrite={false}
        opacity={0.0} // driven by FogCloud frame logic
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

function CutsceneBeatPulse({
  ageRef,
  startMs = 0,
  durationMs = 480,
  color = '#ffffff',
  emissiveIntensity = 3.6,
  innerRadius = 0.22,
  outerRadius = 0.5,
  maxScale = 2.4,
  y = 0.1,
  fadeOpacity = 1,
}) {
  const ref = useRef();

  useFrame(() => {
    if (!ref.current) return;
    const elapsedMs = (ageRef.current || 0) * 1000;
    const localMs = elapsedMs - startMs;

    if (localMs < 0 || localMs > durationMs) {
      ref.current.visible = false;
      return;
    }

    ref.current.visible = true;
    const t = localMs / durationMs;
    const scale = 0.72 + t * maxScale;
    ref.current.scale.set(scale, scale, 1);
    ref.current.material.opacity = Math.max(0.01, Math.pow(1 - t, 1.35) * 0.64 * fadeOpacity);
  });

  return (
    <mesh ref={ref} visible={false} position={[0, y, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[innerRadius, outerRadius, 40]} />
      <meshStandardMaterial
        emissive={color}
        emissiveIntensity={emissiveIntensity}
        color={color}
        transparent
        depthWrite={false}
        opacity={0.58 * fadeOpacity}
      />
    </mesh>
  );
}

export function BreakingPointEffect({ square, shatteredSquare, displaced = [], beatTimingsMs = [], syncDurationMs = 0, fadeOpacity = 1 }) {
  const epicenter = shatteredSquare || square;
  if (!epicenter) return null;

  const [x, , z] = squareToPosition(epicenter);
  const ageRef = useRef(0);
  const ruptureRef = useRef();
  const shellRef = useRef();
  const coreRef = useRef();

  const fragments = useMemo(() => {
    return [...Array(64)].map((_, i) => ({
      key: i,
      angle: (i / 64) * Math.PI * 2,
      radius: 0.12 + Math.random() * 0.45,
      speed: 1.4 + Math.random() * 2.4,
      rise: 0.2 + Math.random() * 0.55,
      phase: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 3,
      color: i % 4 === 0 ? '#79d8ff' : (i % 3 === 0 ? '#ffc3c3' : '#ff4d4d'),
    }));
  }, []);

  const crackSpokes = useMemo(() => {
    return [...Array(16)].map((_, i) => ({
      key: i,
      angle: (i / 16) * Math.PI * 2,
      len: 0.95 + Math.random() * 1.45,
      width: 0.03 + Math.random() * 0.06,
      phase: Math.random() * Math.PI * 2,
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
    const lifeSeconds = Math.max(1.2, (syncDurationMs || 0) / 1000);
    const lifeT = Math.min(ageRef.current / lifeSeconds, 1);

    if (ruptureRef.current) {
      const s = 0.45 + lifeT * 2.6;
      ruptureRef.current.scale.set(s, s, 1);
      ruptureRef.current.rotation.z = t * 0.7;
      ruptureRef.current.material.opacity = Math.max(0.02, (0.95 - lifeT * 0.9) * fadeOpacity);
    }

    if (shellRef.current) {
      const s = 0.82 + lifeT * 1.1;
      shellRef.current.scale.set(s, s, s);
      shellRef.current.rotation.y = -t * 0.9;
      shellRef.current.material.opacity = Math.max(0.01, (0.42 - lifeT * 0.35) * fadeOpacity);
    }

    if (coreRef.current) {
      const pulse = 1 + Math.sin(t * 16) * 0.14;
      coreRef.current.scale.setScalar(pulse);
      coreRef.current.material.opacity = Math.max(0.01, (0.9 - lifeT * 0.85) * fadeOpacity);
    }

    const children = ruptureRef.current?.parent?.children || [];
    children.forEach((child) => {
      if (child.userData?.fragment && child.material) {
        child.material.opacity = Math.max(0.01, (0.86 - lifeT * 0.82) * fadeOpacity);
        child.position.y = child.userData.baseY + Math.sin(t * child.userData.speed + child.userData.phase) * 0.08 + lifeT * child.userData.rise;
        child.rotation.y += child.userData.spin * 0.02;
      }
      if (child.userData?.crack && child.material) {
        const flicker = 0.75 + Math.sin(t * 12 + child.userData.phase) * 0.25;
        child.material.opacity = Math.max(0.02, flicker * (0.72 - lifeT * 0.58) * fadeOpacity);
      }
    });
  });

  return (
    <group position={[x, 0, z]}>
      <ParticleBurst
        position={[0, 0.28, 0]}
        count={84}
        color="#ff4d4d"
        size={0.07}
        speed={4.4}
        lifetime={0.62}
      />
      <ParticleBurst
        position={[0, 0.3, 0]}
        count={56}
        color="#79d8ff"
        size={0.05}
        speed={3.8}
        lifetime={0.72}
      />

      {(Array.isArray(beatTimingsMs) && beatTimingsMs.length ? beatTimingsMs : [0, 340, 760]).slice(0, 6).map((beat, idx) => (
        <CutsceneBeatPulse
          key={`breaking-beat-${idx}`}
          ageRef={ageRef}
          startMs={Math.max(0, beat)}
          durationMs={460}
          color={idx % 2 === 0 ? '#ff4d4d' : '#8de3ff'}
          emissiveIntensity={idx % 2 === 0 ? 4.2 : 3.4}
          innerRadius={0.2 + idx * 0.02}
          outerRadius={0.46 + idx * 0.02}
          maxScale={2.2}
          y={0.11 + idx * 0.005}
          fadeOpacity={fadeOpacity}
        />
      ))}

      <mesh ref={ruptureRef} position={[0, 0.1, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.18, 0.58, 48]} />
        <meshStandardMaterial
          emissive="#ff4d4d"
          emissiveIntensity={5.6}
          color="#ffd0d0"
          transparent
          depthWrite={false}
          opacity={0.9 * fadeOpacity}
        />
      </mesh>

      <mesh ref={shellRef} position={[0, 0.14, 0]}>
        <icosahedronGeometry args={[0.48, 1]} />
        <meshStandardMaterial
          emissive="#66ccff"
          emissiveIntensity={3.8}
          color="#91e4ff"
          transparent
          depthWrite={false}
          opacity={0.34 * fadeOpacity}
          wireframe
        />
      </mesh>

      <mesh ref={coreRef} position={[0, 0.22, 0]}>
        <sphereGeometry args={[0.16, 18, 18]} />
        <meshStandardMaterial
          emissive="#ff6b6b"
          emissiveIntensity={7.2}
          color="#ffd3d3"
          transparent
          depthWrite={false}
          opacity={0.88 * fadeOpacity}
        />
      </mesh>

      {crackSpokes.map((spoke) => (
        <mesh
          key={`crack-${spoke.key}`}
          userData={{ crack: true, phase: spoke.phase }}
          position={[Math.cos(spoke.angle) * (spoke.len * 0.5), 0.05, Math.sin(spoke.angle) * (spoke.len * 0.5)]}
          rotation={[0, -spoke.angle, 0]}
        >
          <boxGeometry args={[spoke.width, 0.03, spoke.len]} />
          <meshStandardMaterial
            emissive="#ff7a7a"
            emissiveIntensity={3.8}
            color="#ffd6d6"
            transparent
            depthWrite={false}
            opacity={0.5 * fadeOpacity}
          />
        </mesh>
      ))}

      {fragments.map((f) => (
        <mesh
          key={f.key}
          userData={{ fragment: true, baseY: 0.24, speed: f.speed, rise: f.rise, phase: f.phase, spin: f.spin }}
          position={[Math.cos(f.angle) * f.radius, 0.24, Math.sin(f.angle) * f.radius]}
        >
          <dodecahedronGeometry args={[0.045 + (f.key % 5) * 0.004, 0]} />
          <meshStandardMaterial
            emissive={f.color}
            emissiveIntensity={4.8}
            color={f.color}
            transparent
            depthWrite={false}
            opacity={0.82 * fadeOpacity}
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

export function EdgerunnerOverdriveEffect({ square, targetSquare, dashPath = [], beatTimingsMs = [], syncDurationMs = 0, fadeOpacity = 1 }) {
  const anchorSquare = square || targetSquare;
  if (!anchorSquare) return null;

  const [anchorX, , anchorZ] = squareToPosition(anchorSquare);
  const ageRef = useRef(0);
  const [expired, setExpired] = useState(false);
  const gateRef = useRef();
  const shellRef = useRef();
  const burstRingRef = useRef();
  const runnerRef = useRef();

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

  const worldPath = useMemo(() => orderedSquares.map((sq) => squareToPosition(sq)), [orderedSquares]);
  const localPath = useMemo(
    () => worldPath.map(([x, y, z]) => [x - anchorX, (y || 0.15) + 0.03, z - anchorZ]),
    [anchorX, anchorZ, worldPath],
  );

  const lifeSeconds = useMemo(() => {
    const synced = Number(syncDurationMs || 0) / 1000;
    return clamp(synced > 0 ? synced * 0.85 : 1.35, 1, 2.4);
  }, [syncDurationMs]);

  useFrame((state) => {
    ageRef.current += state.clock.getDelta();
    const lifeT = clamp(ageRef.current / lifeSeconds, 0, 1);
    if (lifeT >= 1 && !expired) {
      setExpired(true);
      return;
    }

    const t = state.clock.elapsedTime;
    if (gateRef.current) {
      const wobble = 1 + Math.sin(t * 18) * 0.12;
      gateRef.current.scale.set(wobble, 1, wobble);
      gateRef.current.rotation.y = t * 1.6;
      gateRef.current.material.opacity = (0.62 - lifeT * 0.56) * fadeOpacity;
    }
    if (shellRef.current) {
      const pulse = 0.92 + Math.sin(t * 10) * 0.1;
      shellRef.current.scale.set(pulse, pulse, pulse);
      shellRef.current.rotation.y = -t * 2.2;
      shellRef.current.material.opacity = Math.max(0.01, (0.36 - lifeT * 0.31) * fadeOpacity);
    }
    if (burstRingRef.current) {
      const s = 0.34 + lifeT * 3.1;
      burstRingRef.current.scale.set(s, s, 1);
      burstRingRef.current.rotation.z = t * 1.1;
      burstRingRef.current.material.opacity = Math.max(0.01, (0.56 - lifeT * 0.52) * fadeOpacity);
    }
    if (runnerRef.current && localPath.length) {
      const p = interpolateOverdrivePath(localPath, lifeT);
      runnerRef.current.position.set(p[0], p[1] + 0.06, p[2]);
      runnerRef.current.rotation.y = t * 6;
      runnerRef.current.material.opacity = Math.max(0.02, (0.98 - lifeT * 0.74) * fadeOpacity);
    }
  });

  if (expired) return null;

  const beatMarks = (Array.isArray(beatTimingsMs) && beatTimingsMs.length ? beatTimingsMs : [0, 280, 560, 860]).slice(0, 8);

  return (
    <group position={[anchorX, 0, anchorZ]}>
      <ParticleBurst position={[0, 0.22, 0]} count={56} color="#00ffd2" size={0.065} speed={3.1} lifetime={0.6} />
      <ParticleRing position={[0, 0.14, 0]} count={64} color="#2de7ff" size={0.042} expandSpeed={3.3} lifetime={0.62} />

      <mesh ref={gateRef} position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.54, 0.54, 1.05, 8, 1, true]} />
        <meshStandardMaterial emissive="#0af7ff" emissiveIntensity={4.8} color="#8fffff" transparent depthWrite={false} opacity={0.62 * fadeOpacity} wireframe />
      </mesh>

      <mesh ref={shellRef} position={[0, 0.36, 0]}>
        <torusGeometry args={[0.48, 0.045, 14, 40]} />
        <meshStandardMaterial emissive="#43ffbb" emissiveIntensity={4.6} color="#93ffe0" transparent depthWrite={false} opacity={0.3 * fadeOpacity} />
      </mesh>

      <mesh ref={burstRingRef} position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.62, 56]} />
        <meshStandardMaterial emissive="#20d9ff" emissiveIntensity={5.1} color="#b6f7ff" transparent depthWrite={false} opacity={0.5 * fadeOpacity} />
      </mesh>

      {localPath.map((node, idx) => (
        <OverdriveLaneMarker key={`overdrive-lane-${idx}`} node={node} idx={idx} ageRef={ageRef} lifeSeconds={lifeSeconds} fadeOpacity={fadeOpacity} />
      ))}

      {localPath.map((node, idx) => (
        <OverdriveNodePulse key={`overdrive-node-${idx}`} node={node} nodeIndex={idx} ageRef={ageRef} lifeSeconds={lifeSeconds} fadeOpacity={fadeOpacity} />
      ))}

      {localPath.slice(1).map((to, idx) => (
        <OverdriveSegmentRibbon
          key={`overdrive-ribbon-${idx}`}
          from={localPath[idx]}
          to={to}
          idx={idx}
          ageRef={ageRef}
          lifeSeconds={lifeSeconds}
          fadeOpacity={fadeOpacity}
        />
      ))}

      {beatMarks.map((beat, idx) => (
        <CutsceneBeatPulse
          key={`overdrive-new-beat-${idx}`}
          ageRef={ageRef}
          startMs={Math.max(0, beat)}
          durationMs={360}
          color={idx % 2 === 0 ? '#2de7ff' : '#18ff9b'}
          emissiveIntensity={3.8}
          innerRadius={0.22}
          outerRadius={0.48}
          maxScale={2.25}
          y={0.08 + idx * 0.004}
          fadeOpacity={fadeOpacity}
        />
      ))}

      <mesh ref={runnerRef}>
        <octahedronGeometry args={[0.11, 0]} />
        <meshStandardMaterial emissive="#dffcff" emissiveIntensity={6.2} color="#f4ffff" transparent depthWrite={false} opacity={0.9 * fadeOpacity} />
      </mesh>
    </group>
  );
}

function interpolateOverdrivePath(path, t) {
  if (!Array.isArray(path) || path.length === 0) return [0, 0.2, 0];
  if (path.length === 1) return path[0];
  const scaled = clamp(t, 0, 1) * (path.length - 1);
  const idx = Math.min(path.length - 2, Math.floor(scaled));
  const frac = scaled - idx;
  const a = path[idx];
  const b = path[idx + 1];
  return [
    a[0] + (b[0] - a[0]) * frac,
    a[1] + (b[1] - a[1]) * frac,
    a[2] + (b[2] - a[2]) * frac,
  ];
}

function OverdriveNodePulse({ node, nodeIndex, ageRef, lifeSeconds, fadeOpacity }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const lifeT = clamp((ageRef.current || 0) / Math.max(0.001, lifeSeconds), 0, 1);
    const pulse = 0.66 + Math.sin(t * 12 + nodeIndex * 0.9) * 0.24;
    ref.current.scale.setScalar(pulse);
    ref.current.material.opacity = Math.max(0.01, (0.62 - lifeT * 0.5) * fadeOpacity);
  });

  return (
    <mesh ref={ref} position={[node[0], node[1] + 0.05, node[2]]}>
      <octahedronGeometry args={[0.085, 0]} />
      <meshStandardMaterial emissive="#25e7ff" emissiveIntensity={5} color="#b8fbff" transparent depthWrite={false} opacity={0.58 * fadeOpacity} />
    </mesh>
  );
}

function OverdriveLaneMarker({ node, idx, ageRef, lifeSeconds, fadeOpacity }) {
  const ref = useRef();

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const lifeT = clamp((ageRef.current || 0) / Math.max(0.001, lifeSeconds), 0, 1);
    const pulse = 0.8 + Math.sin(t * 14 + idx * 0.8) * 0.16;
    ref.current.scale.set(pulse, pulse, 1);
    ref.current.rotation.z = t * (idx % 2 === 0 ? 0.9 : -0.9);
    ref.current.material.opacity = Math.max(0.01, (0.42 - lifeT * 0.34) * fadeOpacity);
  });

  return (
    <mesh ref={ref} position={[node[0], node[1] + 0.03, node[2]]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[0.09, 0.15, 24]} />
      <meshStandardMaterial emissive="#19ffb4" emissiveIntensity={3.6} color="#9fffe4" transparent depthWrite={false} opacity={0.38 * fadeOpacity} />
    </mesh>
  );
}

function OverdriveSegmentRibbon({ from, to, idx, ageRef, lifeSeconds, fadeOpacity }) {
  const ref = useRef();

  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const lifeT = clamp((ageRef.current || 0) / Math.max(0.001, lifeSeconds), 0, 1);
    const shimmer = 0.76 + Math.sin(t * 22 + idx * 1.1) * 0.24;
    ref.current.material.opacity = Math.max(0.01, shimmer * (0.56 - lifeT * 0.42) * fadeOpacity);
  });

  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const dist = Math.max(0.12, Math.hypot(dx, dz));
  const center = [(from[0] + to[0]) * 0.5, Math.max(from[1], to[1]) + 0.05 + idx * 0.01, (from[2] + to[2]) * 0.5];
  const rotationY = Math.atan2(dx, dz);

  return (
    <mesh ref={ref} position={center} rotation={[-Math.PI / 2, rotationY, 0]} scale={[1, 1, dist]}>
      <planeGeometry args={[0.16, 1]} />
      <meshStandardMaterial emissive="#1ef0ff" emissiveIntensity={5.4} color="#b7ffff" transparent depthWrite={false} opacity={0.48 * fadeOpacity} />
    </mesh>
  );
}

// Iron Fortress Effect
export function IronFortressEffect({ onComplete, actorColor = 'w' }) {
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

  const normalizedColor = actorColor === 'b' || actorColor === 'black' ? 'b' : 'w';
  // World coordinates: white side is positive Z (rank 1/2), black side is negative Z (rank 7/8)
  const baseZ = normalizedColor === 'w' ? 2.5 : -2.5;

  return (
    <group>
      {/* Stone walls rising */}
      {[-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5].map((x, i) => (
        <mesh
          key={i}
          position={[x, easeOutCubic(progress) * 0.4, baseZ]}
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
      <mesh position={[0, 0.3, baseZ]} rotation={[-Math.PI / 2, 0, 0]}>
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

  // Keep particle trajectories stable for the full lifetime of the effect.
  const bloodParticles = useMemo(() => {
    return [...Array(44)].map((_, i) => {
      const angle = (i / 44) * Math.PI * 2;
      return {
        dirX: Math.cos(angle),
        dirZ: Math.sin(angle),
        spread: 0.7 + ((i * 7) % 10) / 10,
        lift: 0.2 + ((i * 5) % 9) / 20,
        gravity: 0.65 + ((i * 3) % 7) / 10,
        size: 0.045 + ((i * 11) % 8) / 200,
      };
    });
  }, []);

  const groundSplats = useMemo(() => {
    return [...Array(10)].map((_, i) => {
      const angle = (i / 10) * Math.PI * 2;
      const radius = 0.15 + (i % 4) * 0.1;
      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        r: 0.1 + (i % 3) * 0.07,
      };
    });
  }, []);

  const bladeTrailParticles = useMemo(() => {
    return [...Array(24)].map((_, i) => ({
      lane: ((i % 6) - 2.5) * 0.05,
      depth: ((Math.floor(i / 6) % 2) - 0.5) * 0.08,
      dropOffset: (i % 8) * 0.07,
      size: 0.018 + (i % 5) * 0.004,
    }));
  }, []);

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
  const impactPhase = Math.min(Math.max((progress - 0.56) / 0.2, 0), 1); // Exact remove/readability cue
  const explosionPhase = Math.min(Math.max((progress - 0.62) / 0.38, 0), 1); // Blood burst phase
  const impactFlash = 1 - Math.abs(impactPhase - 0.5) * 2;
  const stainPhase = Math.min(Math.max((progress - 0.62) / 0.28, 0), 1);

  return (
    <group position={[x, 0, z]}>

      {/* Removal timing cue: bright slash marker at exact impact window */}
      {impactPhase > 0 && impactPhase < 1 && (
        <>
          <mesh position={[0, 0.46, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
            <ringGeometry args={[0.16, 0.32, 24]} />
            <meshStandardMaterial
              emissive="#ff1744"
              emissiveIntensity={5 * Math.max(0, impactFlash)}
              color="#ff8a80"
              transparent
              depthWrite={false}
              opacity={0.8 * Math.max(0, impactFlash) * (1 - finishT)}
            />
          </mesh>
          <mesh position={[0, 0.5, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 4]}>
            <planeGeometry args={[1.15, 0.09]} />
            <meshStandardMaterial
              emissive="#ff1744"
              emissiveIntensity={7 * Math.max(0, impactFlash)}
              color="#ffffff"
              transparent
              depthWrite={false}
              opacity={0.9 * Math.max(0, impactFlash) * (1 - finishT)}
            />
          </mesh>
        </>
      )}

      {/* Falling blade (silver/metallic) */}
      {bladePhase < 1 && (
        <mesh 
          position={[0, 2.95 - bladePhase * 2.55, 0]} 
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

      {/* Blade trail particles - keeps the slash feeling continuous through the fall. */}
      {bladePhase < 1 && bladeTrailParticles.map((p, i) => {
        const y = 2.95 - bladePhase * 2.55 + p.dropOffset * (1 - bladePhase);
        return (
          <mesh key={`blade-trail-${i}`} position={[p.lane, y, p.depth]}>
            <sphereGeometry args={[p.size, 6, 6]} />
            <meshStandardMaterial
              emissive="#ffe082"
              emissiveIntensity={2.2 * (1 - bladePhase)}
              color="#fff3c4"
              transparent
              depthWrite={false}
              opacity={0.45 * (1 - bladePhase) * (1 - finishT)}
            />
          </mesh>
        );
      })}
      
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
      
      {/* Blood explosion particles (stable trajectories) */}
      {explosionPhase > 0.02 && bloodParticles.map((p, i) => {
        const dist = (0.2 + explosionPhase * 1.4) * p.spread;
        const lift = p.lift * explosionPhase;
        const drop = explosionPhase * explosionPhase * p.gravity;

        return (
          <mesh
            key={i}
            position={[
              p.dirX * dist,
              0.42 + lift - drop,
              p.dirZ * dist
            ]}
            scale={[1 - explosionPhase * 0.3, 1 - explosionPhase * 0.3, 1]}
          >
            <sphereGeometry args={[p.size, 6, 6]} />
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
      {stainPhase > 0 && (
        <>
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.22 + stainPhase * 0.52, 32]} />
            <meshStandardMaterial
              color="#8B0000"
              emissive="#8B0000"
              emissiveIntensity={0.6 * (1 - stainPhase * 0.5)}
              transparent
              depthWrite={false}
              opacity={(0.58 + 0.2 * stainPhase) * (1 - finishT)}
            />
          </mesh>
          {groundSplats.map((splat, i) => (
            <mesh
              key={`splat-${i}`}
              position={[splat.x * stainPhase, 0.021, splat.z * stainPhase]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <circleGeometry args={[splat.r * stainPhase, 16]} />
              <meshStandardMaterial
                color="#6b0000"
                emissive="#6b0000"
                emissiveIntensity={0.45}
                transparent
                depthWrite={false}
                opacity={0.45 * (1 - finishT)}
              />
            </mesh>
          ))}
        </>
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

// Necromancy Effect - darker soul bloom with green-violet necrotic particles
export function NecromancyEffect({ square, revivedSquares = [], onComplete }) {
  const focusSquare = square || revivedSquares[0] || null;
  if (!focusSquare) return null;

  const [x, , z] = squareToPosition(focusSquare);
  const [progress, setProgress] = useState(0);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 520);

  useFrame((state, delta) => {
    setProgress((prev) => {
      const next = prev + delta * 0.72;
      if (next >= 1 && !finishing) triggerFinish();
      return Math.min(next, 1);
    });
  });

  if (completed) return null;

  const ringScale = 0.35 + easeOutCubic(progress) * 1.15;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.42, 0]}>
        <sphereGeometry args={[0.5 + progress * 0.35, 24, 24]} />
        <meshStandardMaterial
          emissive="#66bb6a"
          emissiveIntensity={2.8 * (1 - finishT)}
          color="#c8e6c9"
          transparent
          depthWrite={false}
          opacity={0.28 * (1 - progress * 0.25) * (1 - finishT)}
        />
      </mesh>

      {[...Array(32)].map((_, i) => {
        const angle = (i / 32) * Math.PI * 2 - progress * Math.PI * 2.4;
        const radius = 0.2 + Math.sin(progress * Math.PI) * 0.6;
        const height = (i / 32) * 1.4;
        return (
          <mesh key={i} position={[Math.cos(angle) * radius, height * (1 - progress), Math.sin(angle) * radius]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshStandardMaterial
              emissive={i % 2 === 0 ? '#aed581' : '#9ccc65'}
              emissiveIntensity={3.5 * (1 - finishT)}
              color={i % 2 === 0 ? '#dcedc8' : '#c5e1a5'}
              transparent
              depthWrite={false}
              opacity={(1 - progress * 0.5) * 0.9 * (1 - finishT)}
            />
          </mesh>
        );
      })}

      <mesh position={[0, 0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[ringScale, ringScale, 1]}>
        <ringGeometry args={[0.22, 0.72, 32]} />
        <meshStandardMaterial
          emissive="#7cb342"
          emissiveIntensity={2 * (1 - progress)}
          color="#c5e1a5"
          transparent
          depthWrite={false}
          opacity={0.55 * (1 - progress * 0.65) * (1 - finishT)}
        />
      </mesh>

      <mesh position={[0, 1.15, 0]}>
        <octahedronGeometry args={[0.1, 0]} />
        <meshStandardMaterial
          emissive="#dcedc8"
          emissiveIntensity={4}
          color="#f1f8e9"
          transparent
          opacity={0.85 * (1 - finishT)}
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
        <mesh position={[0, 0.48, 0]}>
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
              0.48,
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
  const particleRefs = useRef([]);

  const particles = useMemo(() => {
    return [...Array(14)].map((_, i) => ({
      angle: (i / 14) * Math.PI * 2,
      radius: 0.1 + (i % 4) * 0.07,
      riseSpeed: 0.55 + (i % 5) * 0.11,
      bob: 0.03 + (i % 3) * 0.01,
      phase: Math.random() * Math.PI * 2,
      drift: (i % 2 === 0 ? 1 : -1) * (0.12 + (i % 4) * 0.03),
    }));
  }, []);

  if (!square || typeof square !== 'string') {
    return null;
  }

  const [x, , z] = squareToPosition(square);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 500);

  useFrame((state, delta) => {
    setProgress((prev) => {
      const next = prev + delta * 1.05;
      if (next >= 1) {
        if (!finishing) triggerFinish();
        return 1;
      }
      return next;
    });

    const t = state.clock.elapsedTime;
    particleRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const p = particles[i];
      const riseLoop = (t * p.riseSpeed + p.phase) % 1;
      const localY = 0.05 + riseLoop * 0.42;
      const drift = Math.sin((t + p.phase) * p.drift) * 0.03;
      const px = Math.cos(p.angle) * (p.radius + drift);
      const pz = Math.sin(p.angle) * (p.radius + drift);
      ref.position.set(px, localY, pz);
      ref.scale.setScalar(0.75 + 0.25 * Math.sin(t * 4 + p.phase));
      if (ref.material) {
        const fade = Math.sin(riseLoop * Math.PI);
        ref.material.opacity = Math.max(0.04, Math.pow(fade, 1.2) * live);
      }
    });
  });

  if (completed) return null;

  const pulse = 0.9 + Math.sin(progress * Math.PI * 4) * 0.1;
  const live = 1 - finishT;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.058, 0]}>
        <boxGeometry args={[0.94, 0.012, 0.94]} />
        <meshStandardMaterial
          color="#d1a100"
          emissive="#b8860b"
          emissiveIntensity={3.4 * live * pulse}
          metalness={0.05}
          roughness={0.5}
        />
      </mesh>

      <mesh position={[0, 0.067, 0]}>
        <boxGeometry args={[0.76, 0.008, 0.76]} />
        <meshStandardMaterial
          color="#fff4bf"
          emissive="#e9e9e9"
          emissiveIntensity={2.6 * live}
          metalness={0.05}
          roughness={0.55}
        />
      </mesh>

      {particles.map((_, i) => (
        <mesh key={`sanctuary-rise-${i}`} ref={(ref) => { particleRefs.current[i] = ref; }}>
          <octahedronGeometry args={[0.026, 0]} />
          <meshStandardMaterial
            color="#fff6ce"
            emissive="#fff0a5"
            emissiveIntensity={2.9 * live}
            transparent
            opacity={0.7}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// Persistent sanctuary indicator for squares
export function SanctuaryIndicatorEffect({ square, fadeOpacity = 1 }) {
  if (!square || typeof square !== 'string') {
    return null;
  }

  const [x, , z] = squareToPosition(square);
  const pulseRef = useRef();
  const particleRefs = useRef([]);
  const particles = useMemo(() => {
    return [...Array(10)].map((_, i) => ({
      angle: (i / 10) * Math.PI * 2,
      radius: 0.08 + (i % 3) * 0.09,
      rise: 0.45 + (i % 4) * 0.12,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (pulseRef.current) {
      const scale = 1.0 + 0.04 * Math.sin(t * 2.1);
      pulseRef.current.scale.setScalar(scale);
      if (pulseRef.current.material) {
        pulseRef.current.material.emissiveIntensity = (3.4 + Math.sin(t * 2.5) * 0.6) * fadeOpacity;
      }
    }
    particleRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const p = particles[i];
      const riseLoop = (t * p.rise + p.phase) % 1;
      ref.position.set(
        Math.cos(p.angle) * p.radius,
        0.05 + riseLoop * 0.28,
        Math.sin(p.angle) * p.radius,
      );
      if (ref.material) {
        const fade = Math.sin(riseLoop * Math.PI);
        ref.material.opacity = Math.max(0.04, Math.pow(fade, 1.25) * fadeOpacity);
      }
    });
  });

  return (
    <group position={[x, 0.02, z]}>
      <mesh ref={pulseRef} position={[0, 0.038, 0]}>
        <boxGeometry args={[0.92, 0.01, 0.92]} />
        <meshStandardMaterial
          emissive="#8a5f00"
          emissiveIntensity={3.6}
          color="#c58f00"
          metalness={0.05}
          roughness={0.5}
          depthWrite={false}
        />
      </mesh>

      {particles.map((_, i) => (
        <mesh key={`sanctuary-indicator-rise-${i}`} ref={(ref) => { particleRefs.current[i] = ref; }}>
          <octahedronGeometry args={[0.02, 0]} />
          <meshStandardMaterial
            color="#ccb021"
            emissive="#b88f17"
            emissiveIntensity={2.3 * fadeOpacity}
            transparent
            opacity={0.7}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ============================================================================
// CURSED SQUARE EFFECT - Dark malevolent energy on a square
// ============================================================================

export function CursedSquareEffect({ square, onComplete, fadeOpacity = 1 }) {
  const [progress, setProgress] = useState(0);
  const particleRefs = useRef([]);
  const { finishing, finishT, triggerFinish } = useFinishFade(onComplete, 450);
  const particles = useMemo(() => {
    return [...Array(14)].map((_, i) => ({
      angle: (i / 14) * Math.PI * 2,
      radius: 0.1 + (i % 4) * 0.07,
      riseSpeed: 0.55 + (i % 5) * 0.13,
      phase: Math.random() * Math.PI * 2,
      drift: (i % 2 === 0 ? 1 : -1) * (0.12 + (i % 4) * 0.03),
    }));
  }, []);

  if (!square || typeof square !== 'string') return null;
  const [x, , z] = squareToPosition(square);

  useFrame((state, delta) => {
    setProgress(prev => {
      const next = prev + delta * 1.2;
      if (next >= 1) {
        if (!finishing) triggerFinish();
        return 1;
      }
      return next;
    });

    const t = state.clock.elapsedTime;
    particleRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const p = particles[i];
      const riseLoop = (t * p.riseSpeed + p.phase) % 1;
      const drift = Math.sin((t + p.phase) * p.drift) * 0.03;
      ref.position.set(
        Math.cos(p.angle) * (p.radius + drift),
        0.05 + riseLoop * 0.42,
        Math.sin(p.angle) * (p.radius + drift),
      );
      ref.scale.setScalar(0.72 + 0.28 * Math.sin(t * 4 + p.phase));
      if (ref.material) {
        const fade = Math.sin(riseLoop * Math.PI);
        ref.material.opacity = Math.max(0.04, Math.pow(fade, 1.35) * (1 - finishT) * fadeOpacity);
      }
    });
  });

  const pulse = 0.9 + Math.sin(progress * Math.PI * 4) * 0.1;
  const glow = (0.45 + 0.45 * pulse) * (1 - finishT) * fadeOpacity;

  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.058, 0]}>
        <boxGeometry args={[0.94, 0.012, 0.94]} />
        <meshStandardMaterial
          color="#5e1717"
          emissive="#8c1a1a"
          emissiveIntensity={3.2 * glow}
          metalness={0.02}
          roughness={0.7}
          depthWrite={false}
        />
      </mesh>

      <mesh position={[0, 0.067, 0]}>
        <boxGeometry args={[0.76, 0.008, 0.76]} />
        <meshStandardMaterial
          color="#7d1f1f"
          emissive="#a62525"
          emissiveIntensity={2.7 * glow}
          metalness={0.02}
          roughness={0.72}
          depthWrite={false}
        />
      </mesh>

      {particles.map((_, i) => (
        <mesh key={`cursed-rise-${i}`} ref={(ref) => { particleRefs.current[i] = ref; }}>
          <dodecahedronGeometry args={[0.024, 0]} />
          <meshStandardMaterial
            color="#dac9c9"
            emissive="#c7bdbd"
            emissiveIntensity={2.8 * (1 - finishT)}
            transparent
            opacity={0.7}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// Persistent cursed square indicator
export function CursedSquareIndicatorEffect({ square, turnsLeft, fadeOpacity = 1 }) {
  if (!square || typeof square !== 'string') return null;
  const [x, , z] = squareToPosition(square);
  const pulseRef = useRef();
  const particleRefs = useRef([]);
  const particles = useMemo(() => {
    return [...Array(10)].map((_, i) => ({
      angle: (i / 10) * Math.PI * 2,
      radius: 0.08 + (i % 3) * 0.09,
      rise: 0.45 + (i % 4) * 0.13,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    if (pulseRef.current) {
      const scale = 1 + Math.sin(t * 2.1) * 0.05;
      pulseRef.current.scale.setScalar(scale);
      if (pulseRef.current.material) {
        pulseRef.current.material.emissiveIntensity = (2.6 + Math.sin(t * 2.4) * 0.7) * fadeOpacity;
      }
    }

    particleRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const p = particles[i];
      const riseLoop = (t * p.rise + p.phase) % 1;
      ref.position.set(
        Math.cos(p.angle) * p.radius,
        0.05 + riseLoop * 0.28,
        Math.sin(p.angle) * p.radius,
      );
      if (ref.material) {
        const fade = Math.sin(riseLoop * Math.PI);
        ref.material.opacity = Math.max(0.04, Math.pow(fade, 1.3) * fadeOpacity);
      }
    });
  });

  return (
    <group position={[x, 0.02, z]}>
      <mesh ref={pulseRef} position={[0, 0.038, 0]}>
        <boxGeometry args={[0.92, 0.01, 0.92]} />
        <meshStandardMaterial
          color="#5a1414"
          emissive="#8f1f1f"
          emissiveIntensity={2.6}
          metalness={0.02}
          roughness={0.72}
          depthWrite={false}
        />
      </mesh>

      {particles.map((_, i) => (
        <mesh key={`cursed-indicator-rise-${i}`} ref={(ref) => { particleRefs.current[i] = ref; }}>
          <dodecahedronGeometry args={[0.02, 0]} />
          <meshStandardMaterial
            color="#ce71bc"
            emissive="#b63f98"
            emissiveIntensity={2.2 * fadeOpacity}
            transparent
            opacity={0.7}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// Legendary fallback effect - gold crown burst used when a card has no dedicated visual component
export function LegendaryEffect({ square, onComplete }) {
  const focusSquare = square || 'd4';
  const [x, , z] = squareToPosition(focusSquare);
  const [progress, setProgress] = useState(0);
  const crownRef = useRef();
  const sparkRefs = useRef([]);
  const { finishing, finishT, completed, triggerFinish } = useFinishFade(onComplete, 650);

  const sparks = useMemo(() => {
    return [...Array(18)].map((_, i) => ({
      angle: (i / 18) * Math.PI * 2,
      radius: 0.45 + (i % 4) * 0.08,
      height: 0.2 + (i % 3) * 0.12,
      phase: Math.random() * Math.PI * 2,
    }));
  }, []);

  useFrame((state, delta) => {
    setProgress((prev) => {
      const next = prev + delta * 0.9;
      if (next >= 1 && !finishing) {
        triggerFinish();
        return 1;
      }
      return next;
    });

    if (crownRef.current) {
      crownRef.current.rotation.y += delta * 0.8;
      crownRef.current.rotation.z = Math.sin(state.clock.elapsedTime * 1.2) * 0.05;
    }

    sparkRefs.current.forEach((ref, i) => {
      if (!ref) return;
      const spark = sparks[i];
      const t = state.clock.elapsedTime * 1.6 + spark.phase + progress * 2;
      const orbit = spark.radius + Math.sin(t * 2) * 0.08;
      ref.position.set(
        Math.cos(spark.angle + t) * orbit,
        spark.height + Math.sin(t * 1.7) * 0.05,
        Math.sin(spark.angle + t) * orbit,
      );
    });
  });

  if (completed) return null;

  const live = (1 - finishT) * (0.45 + progress * 0.55);

  return (
    <group ref={crownRef} position={[x, 0, z]}>
      <mesh position={[0, 0.48, 0]}>
        <sphereGeometry args={[0.35 + progress * 0.22, 24, 24]} />
        <meshStandardMaterial
          emissive="#ffd54f"
          emissiveIntensity={4.4 * live}
          color="#fff4c1"
          transparent
          depthWrite={false}
          opacity={0.38 * live}
        />
      </mesh>

      <mesh position={[0, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1 + progress * 0.18, 1 + progress * 0.18, 1]}>
        <ringGeometry args={[0.36, 0.84, 40]} />
        <meshStandardMaterial
          emissive="#ffb300"
          emissiveIntensity={3.2 * live}
          color="#ffe082"
          transparent
          depthWrite={false}
          opacity={0.55 * live}
        />
      </mesh>

      <mesh position={[0, 0.92, 0]}>
        <coneGeometry args={[0.18 + progress * 0.04, 0.5 + progress * 0.08, 6]} />
        <meshStandardMaterial
          emissive="#ffecb3"
          emissiveIntensity={4.2 * live}
          color="#ffc107"
          transparent
          depthWrite={false}
          opacity={0.92 * live}
        />
      </mesh>

      {[...Array(3)].map((_, i) => (
        <mesh
          key={`crown-prong-${i}`}
          position={[
            Math.cos((i / 3) * Math.PI * 2) * 0.22,
            0.72 + (i % 2) * 0.12,
            Math.sin((i / 3) * Math.PI * 2) * 0.22,
          ]}
        >
          <boxGeometry args={[0.05, 0.22, 0.05]} />
          <meshStandardMaterial
            emissive="#fff8e1"
            emissiveIntensity={3.5 * live}
            color="#ffd740"
            transparent
            depthWrite={false}
            opacity={0.95 * live}
          />
        </mesh>
      ))}

      {sparks.map((_, i) => (
        <mesh key={`legendary-spark-${i}`} ref={(ref) => { sparkRefs.current[i] = ref; }}>
          <sphereGeometry args={[0.035 + (i % 3) * 0.008, 8, 8]} />
          <meshStandardMaterial
            emissive={i % 2 === 0 ? '#ffd54f' : '#ffecb3'}
            emissiveIntensity={4.2 * live}
            color={i % 2 === 0 ? '#fff3c4' : '#fff8e1'}
            transparent
            depthWrite={false}
            opacity={0.85 * live}
          />
        </mesh>
      ))}
    </group>
  );
}
