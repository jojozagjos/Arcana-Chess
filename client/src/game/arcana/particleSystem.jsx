/**
 * GPU-accelerated 3D Particle System for Arcana Chess
 * Uses InstancedMesh for efficient rendering of thousands of particles
 */

import React, { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ============================================================================
// PARTICLE SYSTEM CORE
// ============================================================================

const tempObject = new THREE.Object3D();
const tempColor = new THREE.Color();

/**
 * High-performance instanced particle system
 * @param {Object} props
 * @param {number} props.count - Number of particles
 * @param {Object} props.config - Particle configuration
 * @param {Function} props.onComplete - Called when all particles are dead
 */
export function ParticleSystem({
  count = 100,
  config = {},
  position = [0, 0, 0],
  onComplete,
}) {
  const meshRef = useRef();
  const particlesRef = useRef([]);
  const [isComplete, setIsComplete] = useState(false);

  const {
    // Emission
    emitOnce = true,
    emitRate = 50, // particles per second for continuous emission
    lifetime = [0.5, 1.5],
    
    // Position
    spawnShape = 'point', // 'point', 'sphere', 'ring', 'box'
    spawnRadius = 0.5,
    spawnBox = [1, 1, 1],
    
    // Velocity
    velocity = [0, 1, 0],
    velocitySpread = [0.5, 0.5, 0.5],
    radialVelocity = 0, // outward from center
    
    // Acceleration
    gravity = [0, -2, 0],
    drag = 0,
    
    // Size
    sizeStart = 0.1,
    sizeEnd = 0,
    sizeVariance = 0.02,
    
    // Color
    colorStart = '#ffffff',
    colorEnd = '#ffffff',
    emissive = '#ffffff',
    emissiveIntensity = 2,
    
    // Opacity
    opacityStart = 1,
    opacityEnd = 0,
    
    // Rotation
    rotationSpeed = 0,
    
    // Blending
    blending = THREE.AdditiveBlending,
    depthWrite = false,
  } = config;

  // Initialize particles
  useEffect(() => {
    const particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        age: emitOnce ? 0 : -Math.random() * (count / emitRate), // stagger for continuous
        maxAge: THREE.MathUtils.randFloat(lifetime[0], lifetime[1]),
        size: sizeStart + (Math.random() - 0.5) * sizeVariance * 2,
        rotation: Math.random() * Math.PI * 2,
        alive: emitOnce,
      });
      
      if (emitOnce) {
        initParticle(particles[i], {
          spawnShape, spawnRadius, spawnBox,
          velocity, velocitySpread, radialVelocity,
        });
      }
    }
    particlesRef.current = particles;
  }, [count]);

  // Geometry for particles (use sphere for soft particles)
  const geometry = useMemo(() => new THREE.SphereGeometry(1, 8, 8), []);

  // Update particles each frame
  useFrame((state, delta) => {
    if (!meshRef.current || isComplete) return;

    const particles = particlesRef.current;
    let aliveCount = 0;
    let nextEmitIndex = 0;

    // Continuous emission tracking
    const emitThisFrame = emitOnce ? 0 : Math.floor(emitRate * delta * 2);

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // Handle continuous emission
      if (!emitOnce && !p.alive && nextEmitIndex < emitThisFrame) {
        p.alive = true;
        p.age = 0;
        p.maxAge = THREE.MathUtils.randFloat(lifetime[0], lifetime[1]);
        initParticle(p, {
          spawnShape, spawnRadius, spawnBox,
          velocity, velocitySpread, radialVelocity,
        });
        nextEmitIndex++;
      }

      if (!p.alive) {
        // Hide dead particles
        tempObject.scale.set(0, 0, 0);
        tempObject.updateMatrix();
        meshRef.current.setMatrixAt(i, tempObject.matrix);
        continue;
      }

      p.age += delta;

      if (p.age >= p.maxAge) {
        p.alive = false;
        tempObject.scale.set(0, 0, 0);
        tempObject.updateMatrix();
        meshRef.current.setMatrixAt(i, tempObject.matrix);
        continue;
      }

      aliveCount++;

      // Normalized age (0 to 1)
      const t = p.age / p.maxAge;

      // Apply physics
      p.velocity.x += gravity[0] * delta;
      p.velocity.y += gravity[1] * delta;
      p.velocity.z += gravity[2] * delta;

      if (drag > 0) {
        p.velocity.multiplyScalar(1 - drag * delta);
      }

      p.position.x += p.velocity.x * delta;
      p.position.y += p.velocity.y * delta;
      p.position.z += p.velocity.z * delta;

      p.rotation += rotationSpeed * delta;

      // Interpolate size
      const size = THREE.MathUtils.lerp(sizeStart, sizeEnd, easeOutCubic(t)) * p.size / sizeStart;

      // Update instance matrix
      tempObject.position.copy(p.position);
      tempObject.scale.set(size, size, size);
      tempObject.rotation.z = p.rotation;
      tempObject.updateMatrix();
      meshRef.current.setMatrixAt(i, tempObject.matrix);

      // Update instance color with opacity
      const opacity = THREE.MathUtils.lerp(opacityStart, opacityEnd, t);
      tempColor.set(colorStart).lerp(tempColor.set(colorEnd), t);
      // Encode opacity in alpha-premultiplied color intensity
      tempColor.multiplyScalar(opacity);
      meshRef.current.setColorAt(i, tempColor);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }

    // Check completion
    if (emitOnce && aliveCount === 0 && !isComplete) {
      setIsComplete(true);
      onComplete?.();
    }
  });

  if (isComplete) return null;

  return (
    <group position={position}>
      <instancedMesh
        ref={meshRef}
        args={[geometry, undefined, count]}
        frustumCulled={false}
      >
        <meshStandardMaterial
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          color={colorStart}
          transparent
          opacity={1}
          blending={blending}
          depthWrite={depthWrite}
          toneMapped={false}
        />
      </instancedMesh>
    </group>
  );
}

// Initialize a single particle
function initParticle(particle, config) {
  const { spawnShape, spawnRadius, spawnBox, velocity, velocitySpread, radialVelocity } = config;

  // Spawn position
  switch (spawnShape) {
    case 'sphere': {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.cbrt(Math.random()) * spawnRadius;
      particle.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta),
        r * Math.cos(phi)
      );
      break;
    }
    case 'ring': {
      const angle = Math.random() * Math.PI * 2;
      particle.position.set(
        Math.cos(angle) * spawnRadius,
        0,
        Math.sin(angle) * spawnRadius
      );
      break;
    }
    case 'box': {
      particle.position.set(
        (Math.random() - 0.5) * spawnBox[0],
        (Math.random() - 0.5) * spawnBox[1],
        (Math.random() - 0.5) * spawnBox[2]
      );
      break;
    }
    default: // point
      particle.position.set(0, 0, 0);
  }

  // Base velocity
  particle.velocity.set(
    velocity[0] + (Math.random() - 0.5) * velocitySpread[0] * 2,
    velocity[1] + (Math.random() - 0.5) * velocitySpread[1] * 2,
    velocity[2] + (Math.random() - 0.5) * velocitySpread[2] * 2
  );

  // Add radial velocity (outward from center)
  if (radialVelocity !== 0) {
    const dir = particle.position.clone().normalize();
    if (dir.length() < 0.001) {
      // Random direction for center spawns
      dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    }
    particle.velocity.add(dir.multiplyScalar(radialVelocity));
  }
}

// Easing functions
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeOutElastic = (t) => {
  const c4 = (2 * Math.PI) / 3;
  return t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
};

// ============================================================================
// PRESET PARTICLE EFFECTS
// ============================================================================

/**
 * Radial burst effect - particles explode outward
 */
export function ParticleBurst({
  position = [0, 0, 0],
  count = 60,
  color = '#88c0d0',
  size = 0.08,
  speed = 3,
  lifetime = 0.8,
  onComplete,
}) {
  return (
    <ParticleSystem
      position={position}
      count={count}
      onComplete={onComplete}
      config={{
        emitOnce: true,
        lifetime: [lifetime * 0.7, lifetime],
        spawnShape: 'point',
        velocity: [0, 0, 0],
        velocitySpread: [1, 1, 1],
        radialVelocity: speed,
        gravity: [0, -1, 0],
        sizeStart: size,
        sizeEnd: 0,
        colorStart: color,
        colorEnd: color,
        emissive: color,
        emissiveIntensity: 3,
        opacityStart: 1,
        opacityEnd: 0,
      }}
    />
  );
}

/**
 * Ring wave effect - expanding ring of particles
 */
export function ParticleRing({
  position = [0, 0, 0],
  count = 40,
  color = '#88c0d0',
  size = 0.06,
  expandSpeed = 2,
  lifetime = 0.6,
  onComplete,
}) {
  return (
    <ParticleSystem
      position={position}
      count={count}
      onComplete={onComplete}
      config={{
        emitOnce: true,
        lifetime: [lifetime * 0.8, lifetime],
        spawnShape: 'ring',
        spawnRadius: 0.2,
        velocity: [0, 0.5, 0],
        velocitySpread: [0.2, 0.3, 0.2],
        radialVelocity: expandSpeed,
        gravity: [0, 0, 0],
        sizeStart: size,
        sizeEnd: size * 0.3,
        colorStart: color,
        colorEnd: color,
        emissive: color,
        emissiveIntensity: 2.5,
        opacityStart: 1,
        opacityEnd: 0,
      }}
    />
  );
}

/**
 * Rising sparkles effect - particles float upward
 */
export function ParticleSparkles({
  position = [0, 0, 0],
  count = 30,
  color = '#fff59d',
  size = 0.04,
  height = 1.5,
  duration = 2,
  continuous = true,
  onComplete,
}) {
  return (
    <ParticleSystem
      position={position}
      count={count}
      onComplete={onComplete}
      config={{
        emitOnce: !continuous,
        emitRate: continuous ? 15 : 0,
        lifetime: [duration * 0.6, duration],
        spawnShape: 'ring',
        spawnRadius: 0.3,
        velocity: [0, height / duration, 0],
        velocitySpread: [0.3, 0.2, 0.3],
        gravity: [0, 0.2, 0],
        sizeStart: size,
        sizeEnd: size * 0.5,
        sizeVariance: size * 0.3,
        colorStart: color,
        colorEnd: color,
        emissive: color,
        emissiveIntensity: 4,
        opacityStart: 0.9,
        opacityEnd: 0,
      }}
    />
  );
}

/**
 * Vortex/spiral effect - particles spin around center
 */
export function ParticleVortex({
  position = [0, 0, 0],
  count = 80,
  color = '#9b59b6',
  size = 0.05,
  radius = 1,
  duration = 2,
  onComplete,
}) {
  const groupRef = useRef();
  const [progress, setProgress] = useState(0);

  useFrame((state, delta) => {
    setProgress(p => {
      const next = p + delta / duration;
      if (next >= 1) {
        onComplete?.();
        return 1;
      }
      return next;
    });
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 2;
    }
  });

  if (progress >= 1) return null;

  return (
    <group ref={groupRef} position={position}>
      <ParticleSystem
        count={count}
        config={{
          emitOnce: false,
          emitRate: 40,
          lifetime: [0.8, 1.2],
          spawnShape: 'ring',
          spawnRadius: radius * progress,
          velocity: [0, 1, 0],
          velocitySpread: [0.5, 0.3, 0.5],
          radialVelocity: -0.5, // inward
          gravity: [0, 0.5, 0],
          sizeStart: size,
          sizeEnd: 0,
          colorStart: color,
          colorEnd: color,
          emissive: color,
          emissiveIntensity: 3,
          opacityStart: 1 - progress * 0.5,
          opacityEnd: 0,
        }}
      />
    </group>
  );
}

/**
 * Magic shield particles - swirling protective barrier
 */
export function ParticleShield({
  position = [0, 0, 0],
  count = 60,
  color = '#4fc3f7',
  radius = 0.45,
}) {
  const groupRef = useRef();

  useFrame((state) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * 0.8;
    }
  });

  return (
    <group ref={groupRef} position={position}>
      <ParticleSystem
        count={count}
        config={{
          emitOnce: false,
          emitRate: 20,
          lifetime: [1, 2],
          spawnShape: 'ring',
          spawnRadius: radius,
          velocity: [0, 0.5, 0],
          velocitySpread: [0.1, 0.1, 0.1],
          gravity: [0, 0, 0],
          sizeStart: 0.03,
          sizeEnd: 0.01,
          colorStart: color,
          colorEnd: '#e1f5fe',
          emissive: color,
          emissiveIntensity: 4,
          opacityStart: 0.9,
          opacityEnd: 0,
        }}
      />
    </group>
  );
}

/**
 * Poison drip particles
 */
export function ParticlePoison({
  position = [0, 0, 0],
  count = 40,
  color = '#76ff03',
  intensity = 1,
}) {
  return (
    <ParticleSystem
      position={position}
      count={count}
      config={{
        emitOnce: false,
        emitRate: 15 * intensity,
        lifetime: [0.8, 1.5],
        spawnShape: 'ring',
        spawnRadius: 0.3,
        velocity: [0, -0.3, 0],
        velocitySpread: [0.2, 0.1, 0.2],
        gravity: [0, -1, 0],
        sizeStart: 0.04,
        sizeEnd: 0.06,
        colorStart: color,
        colorEnd: '#b2ff59',
        emissive: color,
        emissiveIntensity: 2 * intensity,
        opacityStart: 0.7,
        opacityEnd: 0,
      }}
    />
  );
}

export default ParticleSystem;
