import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

function ParticleField({ count = 220, textures = [], mouseRefProp, forceRefProp }) {
  const { size } = useThree();
  const mouse = mouseRefProp || useRef(new THREE.Vector2(-9999, -9999));
  const mouseForce = forceRefProp || useRef(0);
  const groupsRef = useRef([]);

  const effectiveCount = typeof window !== 'undefined' && window.innerWidth < 900 ? Math.floor(count * 0.55) : count;
  const groupCount = Math.max(1, Math.min(6, textures.length || 1));

  const groups = useMemo(() => {
    const g = [];
    const perGroup = Math.ceil(effectiveCount / groupCount);
    for (let gi = 0; gi < groupCount; gi++) {
      const positions = new Float32Array(perGroup * 3);
      const velocities = new Float32Array(perGroup * 3);
      for (let i = 0; i < perGroup; i++) {
        const x = (Math.random() - 0.5) * size.width * 0.9;
        const y = (Math.random() - 0.5) * size.height * 0.7;
        const z = (Math.random() - 0.5) * 300;
        const idx = i * 3;
        positions[idx + 0] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;
        velocities[idx + 0] = (Math.random() - 0.5) * 0.6;
        velocities[idx + 1] = (Math.random() - 0.5) * 0.6;
        velocities[idx + 2] = (Math.random() - 0.5) * 0.03;
      }
      g.push({ positions, velocities, count: perGroup });
    }
    return g;
  }, [effectiveCount, groupCount, size.width, size.height]);

  const phasesRef = useRef([]);
  useEffect(() => {
    phasesRef.current = groups.map((g) => {
      const phases = new Float32Array(g.count);
      const speeds = new Float32Array(g.count);
      for (let i = 0; i < g.count; i++) {
        phases[i] = Math.random() * Math.PI * 2;
        speeds[i] = 0.6 + Math.random() * 0.9; // variation in oscillation speed
      }
      return { phases, speeds };
    });
  }, [groups]);

  useEffect(() => {
    groupsRef.current = groups.map(() => ({ ref: null }));
  }, [groups.length]);

  useFrame((state, delta) => {
    // clamp delta to avoid huge jumps after tabbing out/in
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const mX = mouse.current.x;
    const mY = mouse.current.y;
    const hasMouse = mX > -9000;
    for (let gi = 0; gi < groups.length; gi++) {
      const g = groups[gi];
      const ref = groupsRef.current[gi] && groupsRef.current[gi].ref;
      if (!ref || !ref.geometry || !ref.geometry.attributes.position) continue;
      const posAttr = ref.geometry.attributes.position;
      const pos = posAttr.array;
      const phasePack = phasesRef.current[gi];
      for (let i = 0; i < g.count; i++) {
        const ix = i * 3;
        let px = pos[ix + 0];
        let py = pos[ix + 1];
        let pz = pos[ix + 2];
        // idle noise drift (small) to keep particles moving
        if (phasePack) {
          const ph = phasePack.phases[i];
          const sp = phasePack.speeds[i];
          const nx = Math.cos(ph + t * 0.2 * sp) * 0.02;
          const ny = Math.sin(ph + t * 0.18 * sp) * 0.02;
          g.velocities[ix + 0] += nx * dt * 60;
          g.velocities[ix + 1] += ny * dt * 60;
        }

        if (hasMouse) {
          const dx = mX - px;
          const dy = mY - py;
          const distSq = dx * dx + dy * dy + 1;
          const f = Math.min(2000 / distSq, 0.6) * 0.002 * (mouseForce.current || 1);
          g.velocities[ix + 0] += dx * f * dt * 60;
          g.velocities[ix + 1] += dy * f * dt * 60;
        }

        px += g.velocities[ix + 0] * dt * 60;
        py += g.velocities[ix + 1] * dt * 60;
        pz += g.velocities[ix + 2] * dt * 60;

        g.velocities[ix + 0] *= 0.96;
        g.velocities[ix + 1] *= 0.96;
        g.velocities[ix + 2] *= 0.996;

        const halfW = size.width * 0.6;
        const halfH = size.height * 0.5;
        if (px < -halfW) px = halfW;
        if (px > halfW) px = -halfW;
        if (py < -halfH) py = halfH;
        if (py > halfH) py = -halfH;
        if (pz < -400) pz = 400;
        if (pz > 400) pz = -400;

        pos[ix + 0] = px;
        pos[ix + 1] = py;
        pos[ix + 2] = pz;
      }
      posAttr.needsUpdate = true;
    }
  });

  return (
    <>
      {groups.map((g, gi) => (
        <points
          key={gi}
          ref={(r) => (groupsRef.current[gi] = { ref: r })}
          frustumCulled={false}
        >
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" array={g.positions} count={g.positions.length / 3} itemSize={3} />
          </bufferGeometry>
          <pointsMaterial
            map={textures[gi] || null}
            size={Math.max(4, 8 * (1 - gi * 0.08))}
            sizeAttenuation
            depthTest={false}
            transparent
            opacity={0.95}
            color={0xffffff}
          />
        </points>
      ))}
    </>
  );
}

function makeGlyphTexture(char, color = '#88c0d0') {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = color;
  ctx.font = '48px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(char, size / 2, size / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

function ParticleWrapper({ mouseRef, forceRef }) {
  const [textures] = useState(() => {
    const glyphs = ['♟', '♜', '★', '✦', '⚔'];
    return glyphs.map((g, i) => makeGlyphTexture(g, ['#88c0d0', '#f0a6ff', '#ffd97a', '#7ee7c7', '#c8b6ff'][i % 5]));
  });

  return <ParticleField mouseRefProp={mouseRef} forceRefProp={forceRef} textures={textures} />;
}

export default function MenuParticlesCanvas() {
  const mouseRef = useRef(new THREE.Vector2(-9999, -9999));
  const forceRef = useRef(0);

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = -(e.clientY - rect.top - rect.height / 2);
    mouseRef.current.set(x, y);
  };
  const handleLeave = () => mouseRef.current.set(-9999, -9999);
  const handleClick = () => {
    forceRef.current = 3.5;
    window.setTimeout(() => (forceRef.current = 0), 220);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'auto' }} onMouseMove={handleMove} onMouseLeave={handleLeave} onClick={handleClick} />
      <Canvas className="menu-particles" camera={{ position: [0, 0, 700], fov: 75 }} gl={{ antialias: true }} style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}>
        <ambientLight intensity={0.6} />
        <ParticleWrapper mouseRef={mouseRef} forceRef={forceRef} />
      </Canvas>
    </div>
  );
}
