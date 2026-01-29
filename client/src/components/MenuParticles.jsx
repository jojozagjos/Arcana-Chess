import React, { useRef, useMemo, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { ArcanaCard } from './ArcanaCard.jsx';
import { ARCANA_DEFINITIONS } from '../../../shared/arcanaDefinitions.js';

// --- CONFIG: Tunable spawn rates and visual settings ---
// Change these constants to tweak particle/nebula/card behavior quickly.
const PARTICLE_SPAWN_PROB = 0.001; // per-frame probability for particle spawn
const NEBULA_AUTO_SPAWN_PROB = 0.0005; // per-frame probability for nebula auto-spawn
const FLOATING_CARD_SPAWN_PROB = 0.0001; // per-frame prob for floating card overlay spawn

const FLOATING_CARD_DEFAULT_DURATION_MS = 14000; // overlay card travel time (ms)
const FLOATING_CARD_DEV_DURATION_MS = 18000; // dev button spawn duration (ms)

const MESH_CARD_DURATION_MIN = 12; // seconds (three.js mesh spawn duration range)
const MESH_CARD_DURATION_MAX = 20; // seconds

const ROTATION_DURATION_MIN = 6; // seconds (rotator animation min)
const ROTATION_DURATION_MAX = 14; // seconds (rotator animation max)


// --- 1. OPTIMIZED ASSET GENERATION ---
function useTextures() {
  return useMemo(() => {
    // glyphs removed: keep only core texture for particles

    const createCore = () => {
      const size = 64;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.2, 'rgba(255,200,200,0.8)');
      grad.addColorStop(0.5, 'rgba(100,100,255,0.2)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, size, size);
      const tex = new THREE.CanvasTexture(canvas);
      tex.needsUpdate = true;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      return tex;
    };

    return {
      runes: [],
      core: createCore(),
    };
  }, []);
}

// --- 2. STAR FIELD (reverted to original look) ---
function StarField({ count = 300 }) {
  const { size } = useThree();
  const geomRef = useRef();

  // positions
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const ix = i * 3;
      arr[ix + 0] = (Math.random() - 0.5) * size.width * 1.2;
      arr[ix + 1] = (Math.random() - 0.5) * size.height * 0.9;
      arr[ix + 2] = -Math.random() * 200 - 50;
    }
    return arr;
  }, [count, size.width, size.height]);

  // per-star color (brightness) and flicker seeds: [phase, speed, base]
  const { colorsArr, seeds } = useMemo(() => {
    const colorsArr = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const base = 0.7 + Math.random() * 0.3; // base brightness (brighter)
      colorsArr[i * 3 + 0] = base;
      colorsArr[i * 3 + 1] = base;
      colorsArr[i * 3 + 2] = base;

      seeds[i * 3 + 0] = Math.random() * Math.PI * 2; // phase
      seeds[i * 3 + 1] = 1.0 + Math.random() * 2.0; // speed (faster flicker)
      seeds[i * 3 + 2] = base; // base
    }
    return { colorsArr, seeds };
  }, [count]);

  // circle texture for points (so stars look round)
  const circleTex = useMemo(() => {
    const s = 64;
    const canvas = document.createElement('canvas');
    canvas.width = s;
    canvas.height = s;
    const ctx = canvas.getContext('2d');
    const cx = s / 2, cy = s / 2, r = s / 2;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.85)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, s, s);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => {
    return () => { try { circleTex && circleTex.dispose(); } catch (_) {} };
  }, [circleTex]);

  // Attach color attribute and animate brightness per-star
  useFrame((state) => {
    if (!geomRef.current) return;
    const colAttr = geomRef.current.attributes.color;
    const t = state.clock.getElapsedTime();
    for (let i = 0; i < count; i++) {
      const phase = seeds[i * 3 + 0];
      const speed = seeds[i * 3 + 1];
      const base = seeds[i * 3 + 2];
      const flick = Math.sin(t * speed + phase) * 0.8 * base; // stronger flicker
      const b = Math.max(0, Math.min(1, base + flick));
      colAttr.array[i * 3 + 0] = b;
      colAttr.array[i * 3 + 1] = b;
      colAttr.array[i * 3 + 2] = b;
    }
    colAttr.needsUpdate = true;
  });

  return (
    <points frustumCulled={false}>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" array={positions} count={positions.length / 3} itemSize={3} />
        <bufferAttribute attach="attributes-color" array={colorsArr} count={colorsArr.length / 3} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial map={circleTex} vertexColors size={3.6} sizeAttenuation depthTest={true} transparent opacity={1.0} color={0xffffff} />
    </points>
  );
}

// --- 3. HIGH-PERFORMANCE PARTICLE SYSTEM ---
function ParticleSystem({ textures, mouseRef, forceRef }) {
  const { size } = useThree();
  const groupRef = useRef();

  const particles = useRef([]);
  const spritePool = useRef([]);

  const spawn = (opts = {}) => {
    // Ensure spawn appears within the visible canvas area (not off-screen)
    const sx = typeof opts.x === 'number' ? opts.x : (Math.random() - 0.5) * size.width * 0.9;
    const sy = typeof opts.y === 'number' ? opts.y : (Math.random() - 0.5) * size.height * 0.9;
    const speed = opts.speed ?? 2000 + Math.random() * 1000;
    // Restrict direction to left or right only, with up/down limited to ±20°
    const MAX_VERTICAL_ANGLE_DEG = 20;
    const maxOffset = (MAX_VERTICAL_ANGLE_DEG * Math.PI) / 180; // radians
    const isLeft = typeof opts.direction === 'string' ? opts.direction === 'left' : (Math.random() < 0.5);
    const baseAngle = isLeft ? Math.PI : 0;
    const angle = typeof opts.angle === 'number' ? opts.angle : (baseAngle + (Math.random() * 2 - 1) * maxOffset);
    const texture = opts.texture ?? ((textures.runes && textures.runes.length) ? textures.runes[Math.floor(Math.random() * textures.runes.length)] : textures.core);
    const life = opts.life ?? 1.5 + Math.random();

    particles.current.push({
      x: sx,
      y: sy,
      z: -40,
      vx: Math.cos(angle) * speed * 0.016,
      vy: Math.sin(angle) * speed * 0.016,
      life,
      maxLife: life,
      scale: 48,
      texture,
      trail: [],
      rotation: Math.random() * Math.PI,
      rotSpeed: (Math.random() - 0.5) * 4,
    });
  };

  useEffect(() => {
    const handler = (e) => spawn(e.detail || {});
    window.addEventListener('spawnShootingStar', handler);
    return () => window.removeEventListener('spawnShootingStar', handler);
  }, [size.width, size.height, textures]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const group = groupRef.current;
    if (!group) return;

    // automatic particle spawn (configurable)
    if (Math.random() < PARTICLE_SPAWN_PROB) spawn();

    // very rare automatic nebula spawn (configurable)
    if (Math.random() < NEBULA_AUTO_SPAWN_PROB) {
      const nx = (Math.random() - 0.5) * size.width * 0.9;
      const ny = (Math.random() - 0.5) * size.height * 0.9;
      const nlife = 8 + Math.random() * 14;
      const ngrowth = 0.6 + Math.random() * 1.6;
      window.dispatchEvent(new CustomEvent('spawnNebula', { detail: { x: nx, y: ny, life: nlife, growth: ngrowth, movable: false } }));
    }

    for (let i = particles.current.length - 1; i >= 0; i--) {
      const p = particles.current[i];
      p.life -= dt;
      p.x += p.vx * (dt * 60);
      p.y += p.vy * (dt * 60);
      p.rotation += p.rotSpeed * dt;

      // Append new trail points (oldest -> newest order). Interpolate
      // between last and current to avoid gaps when particles move quickly.
      const newPoint = { x: p.x, y: p.y };
      if (!p.trail || p.trail.length === 0) {
        p.trail.push(newPoint);
      } else {
        const prev = p.trail[p.trail.length - 1];
        const dx = newPoint.x - prev.x;
        const dy = newPoint.y - prev.y;
        const dist = Math.hypot(dx, dy);
        const maxGap = 8; // smaller value = denser trail
        if (dist <= maxGap) {
          p.trail.push(newPoint);
        } else {
          const steps = Math.ceil(dist / maxGap);
          for (let si = 1; si <= steps; si++) {
            const t = si / steps;
            p.trail.push({ x: prev.x + dx * t, y: prev.y + dy * t });
          }
        }
      }
      // keep trail capped to most recent N points
      const MAX_TRAIL = 20;
      if (p.trail.length > MAX_TRAIL) p.trail.splice(0, p.trail.length - MAX_TRAIL);

      if (p.life <= 0) particles.current.splice(i, 1);
    }

    const trailCount = particles.current.reduce((acc, p) => acc + p.trail.length, 0);
    const needed = trailCount; // trails-only: no solid core sprite

    while (spritePool.current.length < needed) {
      const mat = new THREE.SpriteMaterial({ color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const s = new THREE.Sprite(mat);
      group.add(s);
      spritePool.current.push(s);
    }

    spritePool.current.forEach(s => (s.visible = false));

    let spriteIdx = 0;
    particles.current.forEach(p => {
      const trailLen = p.trail.length || 1;
      // render from newest -> oldest so head is drawn first (highest opacity)
      for (let ri = trailLen - 1; ri >= 0; ri--) {
        const t = p.trail[ri];
        const idxFromHead = (trailLen - 1) - ri; // 0 = head
        const ts = spritePool.current[spriteIdx++];
        if (ts) {
          ts.visible = true;
          ts.material.map = textures.core;
          ts.material.rotation = 0;
          const tfac = 1 - idxFromHead / Math.max(1, trailLen - 1);
          ts.material.opacity = tfac * 0.95 * Math.min(1, p.life / p.maxLife + 0.12);
          ts.position.set(t.x, t.y, p.z - 1 - idxFromHead * 0.02);
          const sc = p.scale * 0.45 * (0.6 + tfac * 0.6);
          ts.scale.set(sc, sc, 1);
        }
      }
    });
  });

  return <group ref={groupRef} />;
}

function ParticleWrapper({ mouseRef, forceRef }) {
  const textures = useTextures();

  // natural DOM overlay floating-card spawns: small chance each frame
  useFrame(() => {
    if (Math.random() < FLOATING_CARD_SPAWN_PROB) {
      // dispatch DOM-only so three.js CardFloat ignores it
      window.dispatchEvent(new CustomEvent('spawnFloatingCard', { detail: { domOnly: true } }));
    }
  });

  return (
    <>
      <StarField count={400} mouseRef={mouseRef} forceRef={forceRef} />
      <ParticleSystem textures={textures} mouseRef={mouseRef} forceRef={forceRef} />
      {/* Replace three.js floating-card with a single DOM ArcanaCard overlay for sharper visuals */}
      <NebulaCloud />
    </>
  );
}

// DOM-based floating card overlay: uses the `ArcanaCard` JSX component so art is consistent.
function FloatingCardOverlay({ devMode = false }) {
  const [cards, setCards] = useState([]);

  useEffect(() => {
    const handler = (e) => {
      const opts = e && e.detail ? e.detail : {};
      const h = window.innerHeight;
      // vertical position randomized unless provided
      const y = typeof opts.y === 'number' ? (h / 2 - opts.y) : (Math.random() * (h * 0.6) + h * 0.2);
      const side = opts.side || (Math.random() < 0.5 ? 'left' : 'right');
      // Make default slide slower so card crosses screen more leisurely
      const duration = opts.durationMs || FLOATING_CARD_DEFAULT_DURATION_MS;
      const arcanaId = opts.arcanaId || null;
      // By default show the front (useful for dev spawns). If caller explicitly
      // passes isHidden: true, honor that.
      const isHidden = typeof opts.isHidden === 'boolean' ? opts.isHidden : false;

      // create a stable per-card payload so re-renders don't change visuals
      const key = Date.now() + Math.floor(Math.random() * 1000);
      // pick arcana now (stable) if none provided
      let cardArcana = null;
      if (arcanaId) {
        cardArcana = { id: arcanaId, name: arcanaId.replace(/_/g, ' '), description: '', rarity: 'common' };
      } else {
        const pool = Array.isArray(ARCANA_DEFINITIONS) && ARCANA_DEFINITIONS.length ? ARCANA_DEFINITIONS : [{ id: 'phantom_step', name: 'Phantom Step', rarity: 'common' }];
        const pick = pool[Math.floor(Math.random() * pool.length)];
        cardArcana = { id: pick.id, name: pick.name || pick.id.replace(/_/g, ' '), description: pick.description || '', rarity: pick.rarity || 'common' };
      }

      // stable rotation duration and unique slide animation name per card
      const rotSec = (ROTATION_DURATION_MIN + Math.random() * (ROTATION_DURATION_MAX - ROTATION_DURATION_MIN)).toFixed(1);
      const rotDuration = `${rotSec}s`;
      const slideName = `slide${key}`;

      const card = { key, side, topPx: y - h / 2 + (Math.random() * 40 - 20), duration, arcana: cardArcana, isHidden, rotDuration, slideName };
      setCards(prev => [...prev, card]);
      // remove after duration
      setTimeout(() => setCards(prev => prev.filter(c => c.key !== key)), duration + 400);
    };
    window.addEventListener('spawnFloatingCard', handler);
    return () => { window.removeEventListener('spawnFloatingCard', handler); };
  }, []);

  if (!cards || cards.length === 0) return null;

  return (
    <div style={{ position: 'absolute', left: 0, top: '50%', width: '100%', pointerEvents: 'none', zIndex: 50 }}>
      {cards.map((c) => (
        <FloatingCard key={c.key} card={c} />
      ))}
    </div>
  );
}

function FloatingCard({ card }) {
  const { side, topPx, duration, arcana, isHidden, rotDuration, slideName } = card;
  const demoArcana = arcana;
  const CARD_W = 128;
  const CARD_H = 180;

  const wrapperStyle = {
    position: 'absolute',
    top: `calc(50% + ${topPx}px)`,
    left: 0,
    width: '100%',
    display: 'flex',
    justifyContent: side === 'left' ? 'flex-start' : 'flex-end',
    pointerEvents: 'none',
    zIndex: 50,
    padding: '0 12px',
  };

  const cardStyle = {
    width: CARD_W,
    height: CARD_H,
    transformStyle: 'preserve-3d',
    pointerEvents: 'none',
    // per-card slide animation (generated below)
    animation: `${slideName} ${duration}ms linear forwards`,
    // ensure each card renders above older ones
    zIndex: 60,
    margin: '0 12px',
  };

  // per-card rotation duration randomized for variety
  const rotatorStyle = {
    width: '100%',
    height: '100%',
    transformStyle: 'preserve-3d',
    // rotate on multiple axes for a richer 3D feel (per-card duration)
    animation: `rotXYZ ${rotDuration} linear infinite`,
    transformOrigin: 'center center',
  };

  // generate key-specific slide animation (left->right or right->left)
  const fromX = side === 'left' ? '-120vw' : '120vw';
  const toX = side === 'left' ? '120vw' : '-120vw';

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        {/* Two faces: frontFace and backFace. Use backface-visibility to hide mirrored content. */}
        <div style={{ ...rotatorStyle, transform: isHidden ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
          {/* Front face (visible at rotation 0) - give a slightly larger front size */}
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(0deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isHidden ? (
              <div style={{
                width: CARD_W,
                height: CARD_H,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #2e3440 0%, #1a1f2e 100%)',
                border: '2px solid #88c0d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.2rem',
                color: '#88c0d0',
                boxShadow: '0 0 16px rgba(136,192,208,0.55)'
              }}>
                🂠
              </div>
            ) : (
              <div style={{ width: CARD_W, height: CARD_H }}><ArcanaCard arcana={demoArcana} size="small" style={{ width: '100%', height: '100%' }} /></div>
            )}
          </div>

          {/* Back face (visible when rotated 180deg) - make back slightly smaller so they don't perfectly align */}
          <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isHidden ? (
              <div style={{ width: CARD_W, height: CARD_H }}><ArcanaCard arcana={demoArcana} size="small" style={{ width: '100%', height: '100%' }} /></div>
            ) : (
              <div style={{
                width: CARD_W,
                height: CARD_H,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #2e3440 0%, #1a1f2e 100%)',
                border: '2px solid #88c0d0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '2.2rem',
                color: '#88c0d0',
                boxShadow: '0 0 16px rgba(136,192,208,0.55)'
              }}>
                🂠
              </div>
            )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes rotXYZ {
          0% { transform: rotateX(0deg) rotateY(0deg) rotateZ(0deg); }
          25% { transform: rotateX(18deg) rotateY(90deg) rotateZ(8deg); }
          50% { transform: rotateX(36deg) rotateY(180deg) rotateZ(16deg); }
          75% { transform: rotateX(18deg) rotateY(270deg) rotateZ(8deg); }
          100% { transform: rotateX(0deg) rotateY(360deg) rotateZ(0deg); }
        }
        @keyframes ${slideName} { 0% { transform: translateX(${fromX}); opacity: 0; } 8% { opacity: 1; } 92% { opacity: 1; } 100% { transform: translateX(${toX}); opacity: 0.95; } }
      `}</style>
    </div>
  );
}

// --- 4. FLOATING 3D CARD EFFECT ---
function CardFloat({ textures }) {
  const { size } = useThree();
  const groupRef = useRef();
  const cards = useRef([]);
  const pool = useRef([]);

  // helper to make a simple card texture (rounded rect with symbol)
  function makeCardTexture(symbol) {
    const w = 256; const h = 360;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    // background
    const colors = ['#111827','#0b1220','#071029','#08121a','#0b1220'];
    const bg = colors[Math.floor(Math.random() * colors.length)];
    ctx.fillStyle = bg;
    const radius = 18;
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(w - radius, 0);
    ctx.quadraticCurveTo(w, 0, w, radius);
    ctx.lineTo(w, h - radius);
    ctx.quadraticCurveTo(w, h, w - radius, h);
    ctx.lineTo(radius, h);
    ctx.quadraticCurveTo(0, h, 0, h - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.fill();
    // subtle border
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // symbol
    ctx.fillStyle = '#f8fafc';
    ctx.font = '140px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 12;
    ctx.fillText(symbol || '♟', w / 2, h / 2 - 12);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
    return tex;
  }

  const spawn = (opts = {}) => {
    const w = size.width; const h = size.height;
    const side = opts.side || (Math.random() < 0.5 ? 'left' : 'right');
    const y = typeof opts.y === 'number' ? opts.y : (Math.random() - 0.5) * h * 0.8;
    const startX = side === 'left' ? -w / 2 - 160 : w / 2 + 160;
    const targetX = side === 'left' ? w / 2 + 160 : -w / 2 - 160;
    const duration = opts.duration ?? (MESH_CARD_DURATION_MIN + Math.random() * (MESH_CARD_DURATION_MAX - MESH_CARD_DURATION_MIN));
    const speed = (targetX - startX) / duration; // px per sec
    const symbolSet = ['♟','♜','♞','♝','♛','♚','★'];
    const symbol = opts.symbol || symbolSet[Math.floor(Math.random() * symbolSet.length)];

    // allocate mesh from pool
    let mesh;
    if (pool.current.length > 0) {
      mesh = pool.current.pop();
    } else {
      const geom = new THREE.PlaneGeometry(2, 2);
      const mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
      mesh = new THREE.Mesh(geom, mat);
      mesh.scale.set(120, 168, 1);
    }

    // set texture
    const tex = makeCardTexture(symbol);
    if (mesh.material.map && mesh.material.map !== tex) {
      mesh.material.map.dispose();
    }
    mesh.material.map = tex;
    mesh.material.needsUpdate = true;
    mesh.position.set(startX, y, -60 - Math.random() * 10);
    mesh.userData = { vx: speed, life: duration, age: 0, targetX };
    mesh.rotation.set(0, side === 'left' ? -0.4 : 0.4, (Math.random() - 0.5) * 0.2);
    mesh.visible = true;
    groupRef.current && groupRef.current.add(mesh);
    cards.current.push(mesh);
  };

  useEffect(() => {
    const handler = (e) => {
      const opts = e && e.detail ? e.detail : {};
      // if caller requested DOM-only (overlay) cards, ignore in three.js float
      if (opts && opts.domOnly) return;
      spawn(opts);
    };
    window.addEventListener('spawnFloatingCard', handler);
    return () => window.removeEventListener('spawnFloatingCard', handler);
  }, [size.width, size.height, spawn]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const group = groupRef.current;
    if (!group) return;

    // occasional auto-spawn
    if (Math.random() < 0.0009) spawn();

    for (let i = cards.current.length - 1; i >= 0; i--) {
      const m = cards.current[i];
      m.userData.age += dt;
      const t = m.userData.age / m.userData.life;
      m.position.x += m.userData.vx * dt;
      // slight bobbing
      m.position.y += Math.sin(state.clock.getElapsedTime() * 1.5 + i) * 0.1 * dt * 60 * (1 - t);
      // gentle yaw rotation as it moves
      m.rotation.y += 0.25 * dt * (m.userData.vx > 0 ? 1 : -1);
      // fade near end
      if (t > 0.85) {
        m.material.opacity = Math.max(0, 1 - (t - 0.85) / 0.15);
        m.material.transparent = true;
      }
      if (m.userData.age >= m.userData.life || (m.userData.vx > 0 ? m.position.x > m.userData.targetX : m.position.x < m.userData.targetX)) {
        // recycle
        try { if (m.material.map) m.material.map.dispose(); } catch (_) {}
        group.remove(m);
        cards.current.splice(i, 1);
        pool.current.push(m);
      }
    }
  });

  return <group ref={groupRef} />;
}

// --- Nebula Cloud Component ---
function NebulaCloud() {
  const groupRef = useRef();
  const clouds = useRef([]);
  const texturesRef = useRef([]);
  function makeNebulaTexture(color = '#8b5cf6', size = 512) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2, cy = size / 2;
    const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, size / 1.4);
    grd.addColorStop(0, 'rgba(255,255,255,0.95)');
    grd.addColorStop(0.18, color);
    grd.addColorStop(0.48, 'rgba(0,0,0,0.12)');
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grd;
    // add soft noise using small semi-random radial blobs for realism
    for (let i = 0; i < 18; i++) {
      const rx = cx + (Math.random() - 0.5) * size * 0.6;
      const ry = cy + (Math.random() - 0.5) * size * 0.4;
      const rr = size * (0.06 + Math.random() * 0.18);
      const g2 = ctx.createRadialGradient(rx, ry, 0, rx, ry, rr);
      g2.addColorStop(0, 'rgba(255,255,255,0.12)');
      g2.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g2;
      ctx.fillRect(rx - rr, ry - rr, rr * 2, rr * 2);
    }
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.minFilter = THREE.LinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    texturesRef.current.push(tex);
    return tex;
  }

  useEffect(() => {
    const handler = (e) => {
      const opts = e && e.detail ? e.detail : {};
      const w = window.innerWidth;
      const h = window.innerHeight;
      // cluster center
      const cx = typeof opts.x === 'number' ? opts.x : (Math.random() - 0.5) * w * 0.5;
      const cy = typeof opts.y === 'number' ? opts.y : (Math.random() - 0.5) * h * 0.35;
      // support array of colors or single color; fallback palette
      const palette = Array.isArray(opts.colors) && opts.colors.length ? opts.colors : [opts.color || '#7c3aed', opts.color2 || '#60a5fa', opts.color3 || '#fb7185'];
      const clusterCount = Math.max(1, Math.min(6, Math.floor(opts.clusterCount || (2 + Math.floor(Math.random() * 2)))));
      const life = opts.life ?? 12 + Math.random() * 10;
      const baseScale = opts.scale ?? (Math.min(w, h) * (0.06 + Math.random() * 0.12));

      // spawn clusterCount nearby nebulae, each with 2-3 layered sprites
      for (let ci = 0; ci < clusterCount; ci++) {
        const jitterX = (Math.random() - 0.5) * (Math.min(w, h) * 0.08);
        const jitterY = (Math.random() - 0.5) * (Math.min(w, h) * 0.06);
        const x = cx + jitterX;
        const y = cy + jitterY;
        // pick a color from the palette (wrap)
        const color = palette[ci % palette.length] || palette[Math.floor(Math.random() * palette.length)];

        const tex = makeNebulaTexture(color, 512);
        const baseColor = new THREE.Color(color);

        const layers = [];
        const layerCount = 2 + Math.floor(Math.random() * 2); // 2-3 layers
        for (let i = 0; i < layerCount; i++) {
          const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: baseColor.clone() });
          const s = new THREE.Sprite(mat);
          s.position.set(x + (Math.random() - 0.5) * 24, y + (Math.random() - 0.5) * 12, -80 - i);
          const scale = baseScale * (0.5 + i * 0.45 + Math.random() * 0.12);
          s.scale.set(scale, scale, 1);
          s.userData = { baseScale: scale };
          s.material.opacity = 0.0;
          layers.push(s);
        }

        const growth = typeof opts.growth === 'number' ? opts.growth : (0.7 + Math.random() * 1.0);
        const movable = !!opts.movable;
        const vx = movable ? (Math.random() - 0.5) * 8 : 0;
        const vy = movable ? (Math.random() - 0.5) * 3 : 0;
        clouds.current.push({ layers, life, age: 0, vx, vy, baseColor, growth, movable });
      }
    };

    window.addEventListener('spawnNebula', handler);
    return () => {
      window.removeEventListener('spawnNebula', handler);
      texturesRef.current.forEach(t => { try { t.dispose(); } catch (_) {} });
      texturesRef.current.length = 0;
    };
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const group = groupRef.current;
    if (!group) return;

    for (let i = clouds.current.length - 1; i >= 0; i--) {
      const c = clouds.current[i];
      c.age += dt;
      const t = c.age / c.life;

      // add layers to scene when first spawned
      if (c.layers && c.layers.length && c.layers[0].parent !== group) {
        c.layers.forEach((l) => group.add(l));
      }

      // fade in then fade out
      const fadeIn = 0.12; // fraction of life
      const fadeOut = 0.22; // fraction of life
      for (let idx = 0; idx < c.layers.length; idx++) {
        const l = c.layers[idx];
        // subtle drifting
        l.position.x += c.vx * dt * (12 + idx * 6);
        l.position.y += c.vy * dt * (6 + idx * 3);

        // rotation & slow scale breathing
        l.material.rotation = Math.sin(c.age * (0.12 + idx * 0.05) + idx) * 0.15;
        const baseScale = (l.userData && l.userData.baseScale) ? l.userData.baseScale : l.scale.x;
        // growth over lifetime (t goes 0->1)
        const grow = 1 + (c.growth || 0) * Math.min(1, Math.max(0, c.age / Math.max(0.0001, c.life)));
        const scaleFactor = 1 + Math.sin(c.age * (0.08 + idx * 0.02) + idx) * 0.02;
        const finalScale = baseScale * grow * scaleFactor;
        l.scale.set(finalScale, finalScale, 1);

        // compute alpha with fade in/out
        let alpha = 1;
        if (t < fadeIn) alpha = t / fadeIn;
        else if (t > 1 - fadeOut) alpha = (1 - t) / fadeOut;
        // layer-specific phase and tint oscillation
        const phase = 0.6 + (idx === 0 ? Math.sin(c.age * 0.8) * 0.18 : Math.cos(c.age * 0.6 + idx) * 0.12);
        const finalAlpha = Math.max(0, Math.min(1, alpha * phase * 0.95));
        l.material.opacity = finalAlpha;

        // slight color tint oscillation to add depth
        const tintOsc = 1 + Math.sin(c.age * (0.3 + idx * 0.12) + idx) * 0.07;
        const col = c.baseColor.clone().multiplyScalar(tintOsc);
        l.material.color.copy(col);
      }

      if (c.age > c.life) {
        c.layers.forEach(l => { try { group.remove(l); l.material.map && l.material.map.dispose(); l.material.dispose(); } catch (_) {} });
        clouds.current.splice(i, 1);
      }
    }
  });

  return <group ref={groupRef} />;
}

export default function MenuParticlesCanvas({ devMode = false }) {
  const mouseRef = useRef(new THREE.Vector2(0, 0));
  const forceRef = useRef(0);
  const showDevControls = !!devMode;

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = -(e.clientY - rect.top - rect.height / 2);
    mouseRef.current.set(x, y);
  };

  const handleLeave = () => mouseRef.current.set(0, 0);

  const handleClick = () => {
    forceRef.current = 3.5;
    window.setTimeout(() => (forceRef.current = 0), 250);
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: showDevControls ? 'auto' : 'none' }}>
      <div
        style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'auto' }}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onClick={handleClick}
      />
      <Canvas
        className="menu-particles"
        orthographic
        camera={{ left: -window.innerWidth / 2, right: window.innerWidth / 2, top: window.innerHeight / 2, bottom: -window.innerHeight / 2, position: [0, 0, 100], near: 0.1, far: 2000, zoom: 1 }}
        gl={{ antialias: false, alpha: true, depth: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
        onCreated={({ gl }) => {
          const canvas = gl.domElement;
          const handleLost = (e) => { e.preventDefault(); };
          const handleRestored = () => { try { gl.resetState(); } catch (_) {} };
          canvas.addEventListener('webglcontextlost', handleLost, false);
          canvas.addEventListener('webglcontextrestored', handleRestored, false);
          try { gl.setPixelRatio && gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); } catch (_) {}
        }}
        style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}
      >
        <ParticleWrapper mouseRef={mouseRef} forceRef={forceRef} />
      </Canvas>

      {/* Floating card DOM overlay (single instance) */}
      <FloatingCardOverlay devMode={showDevControls} />

      {showDevControls && (
        <div style={{ position: 'absolute', right: 20, top: 20, zIndex: 40, pointerEvents: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button style={devButtonStyle} onClick={() => window.dispatchEvent(new CustomEvent('spawnShootingStar'))}>Spawn Shooting Star</button>
          <button style={devButtonStyle} onClick={() => window.dispatchEvent(new CustomEvent('spawnNebula'))}>Spawn Nebula</button>
          <button style={devButtonStyle} onClick={() => window.dispatchEvent(new CustomEvent('spawnFloatingCard', { detail: { durationMs: FLOATING_CARD_DEV_DURATION_MS, domOnly: true } }))}>Spawn Floating Card</button>
          {/* <div style={{ color: '#cbd5e1', fontSize: 12, background: 'rgba(0,0,0,0.12)', padding: '6px 8px', borderRadius: 6 }}>Dev Controls</div> */}
        </div>
      )}
    </div>
  );
}

const devButtonStyle = { background: 'linear-gradient(135deg,#4c6fff,#7c3aed)', color: '#fff', padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer' };
