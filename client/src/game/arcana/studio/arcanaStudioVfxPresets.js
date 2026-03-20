function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeCardId(cardId = '') {
  return cardId === 'arcane_cycle' ? 'filtered_cycle' : cardId;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hasVfxData(vfx = {}) {
  return Object.keys(vfx || {}).length > 0;
}

function inferProfile(cardId = '', vfx = {}) {
  const id = normalizeCardId(cardId);

  if (id === 'execution') {
    return {
      name: 'Execution Blood Burst',
      colors: ['#ffd0d0', '#ff6a6a', '#8f0d0d'],
      emissionRate: toNumber(vfx.bloodParticles, 52),
      burstCount: toNumber(vfx.burstCount, 22),
      velocityMin: 0.9,
      velocityMax: toNumber(vfx.particleVelocity, 2.6),
      lifetimeMin: 0.2,
      lifetimeMax: 0.85,
      spawnRadius: 0.42,
      gravity: [0, -11.4, 0],
      noiseStrength: 0.34,
      burstDelayMs: Math.max(0, toNumber(vfx.bloodExplosionDelay, 0)),
    };
  }

  if (id === 'time_freeze') {
    return {
      name: 'Time Freeze Snow',
      colors: ['#f2fcff', '#9fe6ff', '#5bc8ff'],
      emissionRate: toNumber(vfx.snowParticles, 34),
      burstCount: 0,
      velocityMin: 0.2,
      velocityMax: toNumber(vfx.particleVelocity, 0.75),
      lifetimeMin: 0.8,
      lifetimeMax: 1.9,
      spawnRadius: 0.52,
      gravity: [0, -2.1, 0],
      noiseStrength: 0.16,
      spawnShape: 'ring',
    };
  }

  if (id === 'time_travel') {
    return {
      name: 'Time Rewind Swirl',
      colors: [vfx.trailColor || '#6fe0ff', '#3da0ff', '#2448ff'],
      emissionRate: toNumber(vfx.rewindParticles, 60),
      burstCount: Math.max(0, toNumber(vfx.afterimageCount, 8) * 2),
      velocityMin: 0.6,
      velocityMax: toNumber(vfx.particleVelocity, 1.8),
      lifetimeMin: 0.35,
      lifetimeMax: 1.4,
      spawnRadius: 0.62,
      gravity: [0, -1.3, 0],
      noiseStrength: 0.52,
      spawnShape: 'ring',
    };
  }

  if (id === 'divine_intervention') {
    return {
      name: 'Divine Light Shower',
      colors: ['#fff3b0', '#ffe174', '#f7c948'],
      emissionRate: toNumber(vfx.radiantParticles, 46),
      burstCount: 20,
      velocityMin: 0.45,
      velocityMax: 1.35,
      lifetimeMin: 0.4,
      lifetimeMax: 1.25,
      spawnRadius: 0.5,
      gravity: [0, -4.2, 0],
      noiseStrength: 0.2,
      spawnShape: 'cone',
    };
  }

  if (id === 'mind_control') {
    return {
      name: 'Mind Control Pulse',
      colors: ['#ffd7ff', '#f35cff', '#6f2cff'],
      emissionRate: toNumber(vfx.psychicParticles, 42),
      burstCount: 12,
      velocityMin: 0.5,
      velocityMax: 1.55,
      lifetimeMin: 0.28,
      lifetimeMax: 1.05,
      spawnRadius: 0.48,
      gravity: [0, -5.4, 0],
      noiseStrength: 0.44,
      spawnShape: 'sphere',
    };
  }

  if (id === 'astral_rebirth') {
    return {
      name: 'Astral Rebirth Bloom',
      colors: ['#b8ffe6', '#47f0c8', '#178e88'],
      emissionRate: toNumber(vfx.astralParticles, 56),
      burstCount: 28,
      velocityMin: 0.85,
      velocityMax: toNumber(vfx.particleVelocity, 2.1),
      lifetimeMin: 0.2,
      lifetimeMax: 0.95,
      spawnRadius: 0.36,
      gravity: [0, -6.6, 0],
      noiseStrength: 0.38,
      burstDelayMs: Math.max(0, toNumber(vfx.rebirthDelay, 0)),
    };
  }

  if (id === 'filtered_cycle') {
    return {
      name: 'Cycle Echo Drift',
      colors: ['#d5f1ff', '#87cbff', '#4b78ff'],
      emissionRate: 36,
      burstCount: 10,
      velocityMin: 0.35,
      velocityMax: 1.3,
      lifetimeMin: 0.45,
      lifetimeMax: 1.3,
      spawnRadius: 0.56,
      gravity: [0, -3.2, 0],
      noiseStrength: 0.28,
      spawnShape: 'ring',
    };
  }

  if (hasVfxData(vfx)) {
    return {
      name: 'Imported Cutscene VFX',
      colors: [vfx.glowColor || '#a6ecff', '#62beff', '#3f59ff'],
      emissionRate: toNumber(vfx.bloodParticles || vfx.rewindParticles || vfx.astralParticles || vfx.snowParticles, 30),
      burstCount: 8,
      velocityMin: 0.35,
      velocityMax: toNumber(vfx.particleVelocity, 1.35),
      lifetimeMin: 0.25,
      lifetimeMax: 1.1,
      spawnRadius: 0.4,
      gravity: [0, -5.4, 0],
      noiseStrength: 0.24,
    };
  }

  return null;
}

function buildParticleTrack(profile, options = {}) {
  if (!profile) return null;

  const durationMs = Math.max(700, toNumber(options.durationMs, 4000));
  const seed = Number.isInteger(options.seed) ? options.seed : 1337;

  const keys = [
    { id: `ptk_${seed}_0`, timeMs: 0, enabled: true, seed, easing: 'linear', overrides: {} },
  ];

  if (profile.burstDelayMs > 0 && profile.burstDelayMs < durationMs - 120) {
    keys.push({
      id: `ptk_${seed}_burst`,
      timeMs: Math.round(profile.burstDelayMs),
      enabled: true,
      seed: seed + 17,
      easing: 'linear',
      overrides: {
        burstCount: Math.max(0, toNumber(profile.burstCount, 0) + Math.round(toNumber(profile.emissionRate, 0) * 0.3)),
        emissionRate: Math.round(toNumber(profile.emissionRate, 0) * 1.25),
      },
    });
  }

  keys.push({
    id: `ptk_${seed}_off`,
    timeMs: Math.max(200, durationMs - 120),
    enabled: false,
    seed: seed + 41,
    easing: 'linear',
    overrides: {},
  });

  return {
    id: options.id || `pt_${seed}`,
    name: profile.name || 'Imported VFX',
    attach: {
      mode: 'follow',
      targetId: options.objectTrackId || null,
      parentId: null,
      offset: [0, 0.16, 0],
      parenting: true,
    },
    params: {
      emissionRate: Math.max(0, toNumber(profile.emissionRate, 24)),
      burstCount: Math.max(0, toNumber(profile.burstCount, 0)),
      velocityMin: Math.max(0, toNumber(profile.velocityMin, 0.4)),
      velocityMax: Math.max(0.1, toNumber(profile.velocityMax, 1.6)),
      lifetimeMin: Math.max(0.05, toNumber(profile.lifetimeMin, 0.25)),
      lifetimeMax: Math.max(0.1, toNumber(profile.lifetimeMax, 1.1)),
      sizeOverLife: profile.sizeOverLife || [1, 0.75, 0.15],
      colorOverLife: Array.isArray(profile.colors) && profile.colors.length ? profile.colors : ['#9ad7ff', '#4cb6ff', '#1f4fff'],
      gravity: Array.isArray(profile.gravity) ? profile.gravity : [0, -6, 0],
      drag: Math.max(0, toNumber(profile.drag, 0.08)),
      spawnShape: profile.spawnShape || 'sphere',
      spawnRadius: Math.max(0, toNumber(profile.spawnRadius, 0.4)),
      noiseStrength: Math.max(0, toNumber(profile.noiseStrength, 0.2)),
      noiseFrequency: Math.max(0.1, toNumber(profile.noiseFrequency, 1.4)),
      material: {
        additive: true,
        softParticles: true,
      },
      subemitters: [],
    },
    keys,
  };
}

export function buildStudioParticleTracksFromLegacy({ cardId = '', legacyConfig = null, durationMs = 4000, objectTrackId = null } = {}) {
  const vfx = legacyConfig?.vfx && typeof legacyConfig.vfx === 'object' ? legacyConfig.vfx : {};
  const profile = inferProfile(cardId, vfx);
  if (!profile) return [];

  const track = buildParticleTrack(profile, {
    id: `pt_${normalizeCardId(cardId) || 'card'}_main`,
    seed: 1337,
    durationMs,
    objectTrackId,
  });

  return track ? [track] : [];
}

function sampleArrayCurve(arr, t, fallback = 1) {
  if (!Array.isArray(arr) || !arr.length) return fallback;
  if (arr.length === 1) return toNumber(arr[0], fallback);
  const x = clamp(t, 0, 1) * (arr.length - 1);
  const i = Math.floor(x);
  const frac = x - i;
  const a = toNumber(arr[i], fallback);
  const b = toNumber(arr[Math.min(i + 1, arr.length - 1)], a);
  return a + (b - a) * frac;
}

function sampleColor(colors, t) {
  if (!Array.isArray(colors) || !colors.length) return '#88ccff';
  if (colors.length === 1) return colors[0];
  const x = clamp(t, 0, 1) * (colors.length - 1);
  const idx = Math.round(x);
  return colors[clamp(idx, 0, colors.length - 1)] || '#88ccff';
}

function spawnOffset(shape, radius, rand) {
  const angle = rand() * Math.PI * 2;
  const radial = radius * Math.sqrt(rand());

  if (shape === 'ring') {
    return [Math.cos(angle) * radial, 0, Math.sin(angle) * radial];
  }

  if (shape === 'cone') {
    const y = rand() * radius * 0.8;
    const coneR = (1 - y / Math.max(radius * 0.8, 0.001)) * radial;
    return [Math.cos(angle) * coneR, y, Math.sin(angle) * coneR];
  }

  if (shape === 'box') {
    return [
      (rand() * 2 - 1) * radius,
      (rand() * 2 - 1) * radius,
      (rand() * 2 - 1) * radius,
    ];
  }

  const u = rand() * 2 - 1;
  const theta = rand() * Math.PI * 2;
  const r = radius * Math.cbrt(rand());
  const m = Math.sqrt(Math.max(0, 1 - u * u));
  return [r * m * Math.cos(theta), r * u, r * m * Math.sin(theta)];
}

export function buildParticlePreviewPoints({ sample, anchor = [0, 0, 0], maxPoints = 72 } = {}) {
  if (!sample?.active) return [];

  const params = sample.params || {};
  const emissionRate = Math.max(0, toNumber(params.emissionRate, 12));
  const burstCount = Math.max(0, toNumber(params.burstCount, 0));
  const count = clamp(Math.round(emissionRate * 0.7 + burstCount * 0.5), 6, maxPoints);
  const seed = Number.isInteger(sample.seed) ? sample.seed : 1337;
  const rand = mulberry32(seed);

  const spawnRadius = Math.max(0.01, toNumber(params.spawnRadius, 0.35));
  const velocityMin = Math.max(0, toNumber(params.velocityMin, 0.35));
  const velocityMax = Math.max(velocityMin + 0.01, toNumber(params.velocityMax, 1.6));
  const lifetime = Math.max(0.1, toNumber(params.lifetimeMax, 1.2));
  const gravityY = toNumber(params.gravity?.[1], -6);
  const drag = Math.max(0, toNumber(params.drag, 0.08));
  const noiseStrength = Math.max(0, toNumber(params.noiseStrength, 0.2));
  const spawnShape = params.spawnShape || 'sphere';
  const colors = Array.isArray(params.colorOverLife) ? params.colorOverLife : ['#9ad7ff', '#4cb6ff'];
  const sizeOverLife = Array.isArray(params.sizeOverLife) ? params.sizeOverLife : [1, 0.7, 0.2];

  const points = [];
  for (let i = 0; i < count; i += 1) {
    const lifeT = i / Math.max(1, count - 1);
    const age = 1 - lifeT;
    const speed = velocityMin + (velocityMax - velocityMin) * rand();
    const offset = spawnOffset(spawnShape, spawnRadius, rand);
    const swirl = (rand() * 2 - 1) * noiseStrength;
    const arc = lifetime * age;
    const gravityDrift = gravityY * (age ** 2) * 0.04;

    points.push({
      position: [
        anchor[0] + offset[0] + swirl * 0.5,
        anchor[1] + 0.14 + offset[1] + speed * arc + gravityDrift,
        anchor[2] + offset[2] + swirl * 0.5,
      ],
      color: sampleColor(colors, lifeT),
      size: 0.02 + sampleArrayCurve(sizeOverLife, lifeT, 1) * 0.05,
      opacity: clamp(0.24 + (1 - lifeT) * 0.7 - drag * lifeT * 0.4, 0.12, 0.95),
    });
  }

  return points;
}
