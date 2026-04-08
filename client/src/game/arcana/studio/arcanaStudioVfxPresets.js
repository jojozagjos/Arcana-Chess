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

function hashCardId(cardId = '') {
  const value = normalizeCardId(cardId);
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
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
  const cardHash = hashCardId(id);

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

  if (id === 'promotion_ritual') {
    return {
      name: 'Promotion Ritual Beam',
      colors: [vfx.beamColor || '#fff6a8', '#ffe36a', '#ffb03f'],
      emissionRate: toNumber(vfx.promotionParticles, 58),
      burstCount: toNumber(vfx.lightBeam ? 30 : 18, 30),
      velocityMin: 0.45,
      velocityMax: toNumber(vfx.particleVelocity, 1.6),
      lifetimeMin: 0.3,
      lifetimeMax: 1.15,
      spawnRadius: 0.42,
      gravity: [0, -4.8, 0],
      noiseStrength: 0.34,
      spawnShape: 'cone',
      burstDelayMs: Math.max(0, toNumber(vfx.beamDuration, 0) * 0.3),
    };
  }

  if (id === 'breaking_point') {
    return {
      name: 'Breaking Point Rupture',
      colors: [vfx.pressureColor || '#ff4d4d', '#ff9a4f', vfx.fractureColor || '#8de3ff'],
      emissionRate: Math.max(28, toNumber(vfx.fractureBolts, 56)),
      burstCount: Math.max(24, toNumber(vfx.shardBurst, 132)),
      velocityMin: 0.95,
      velocityMax: toNumber(vfx.particleVelocity, 3.15),
      lifetimeMin: 0.18,
      lifetimeMax: 1.22,
      spawnRadius: 0.68,
      gravity: [0, -9.4, 0],
      noiseStrength: 0.72,
      noiseFrequency: 2.3,
      spawnShape: 'ring',
      burstDelayMs: 320,
    };
  }

  if (id === 'edgerunner_overdrive') {
    return {
      name: 'Overdrive Dash Tracer',
      colors: ['#d6ffd9', '#6cff8f', '#00c356'],
      emissionRate: 66,
      burstCount: 34,
      velocityMin: 1.2,
      velocityMax: toNumber(vfx.particleVelocity, 3.8),
      lifetimeMin: 0.14,
      lifetimeMax: 0.82,
      spawnRadius: 0.46,
      gravity: [0, -3.1, 0],
      noiseStrength: 0.58,
      noiseFrequency: 2.8,
      drag: 0.03,
      spawnShape: 'sphere',
      burstDelayMs: 140,
    };
  }

  // filtered_cycle has no canonical particle metadata in legacy definitions.
  // Do not auto-generate VFX for it unless real vfx payload exists.
  if (id === 'filtered_cycle' && !hasVfxData(vfx)) return null;

  if (hasVfxData(vfx)) {
    const paletteIndex = cardHash % 4;
    const palettes = [
      ['#a6ecff', '#62beff', '#3f59ff'],
      ['#ffd8f8', '#f78fff', '#8b3dff'],
      ['#c8ffe4', '#5ce6b0', '#16857f'],
      ['#ffe3c2', '#ffb066', '#ff6d6d'],
    ];
    const shapeByHash = ['sphere', 'ring', 'cone', 'box'];
    const shape = vfx.spawnShape || shapeByHash[paletteIndex];

    return {
      name: `Imported VFX ${paletteIndex + 1}`,
      colors: [vfx.glowColor || palettes[paletteIndex][0], palettes[paletteIndex][1], palettes[paletteIndex][2]],
      emissionRate: toNumber(vfx.bloodParticles || vfx.rewindParticles || vfx.astralParticles || vfx.snowParticles, 28 + (cardHash % 14)),
      burstCount: 6 + (cardHash % 10),
      velocityMin: 0.28 + ((cardHash % 5) * 0.06),
      velocityMax: toNumber(vfx.particleVelocity, 1.2 + ((cardHash % 8) * 0.16)),
      lifetimeMin: 0.2 + ((cardHash % 4) * 0.05),
      lifetimeMax: 0.95 + ((cardHash % 6) * 0.12),
      spawnRadius: 0.28 + ((cardHash % 7) * 0.05),
      gravity: [0, -4.2 - (cardHash % 5), 0],
      noiseStrength: 0.18 + ((cardHash % 6) * 0.05),
      noiseFrequency: 1 + ((cardHash % 7) * 0.22),
      drag: 0.04 + ((cardHash % 5) * 0.03),
      sizeOverLife: [1.05 + ((cardHash % 3) * 0.07), 0.68 + ((cardHash % 4) * 0.04), 0.08 + ((cardHash % 3) * 0.04)],
      spawnShape: shape,
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

function buildSecondaryProfile(profile, cardId = '', vfx = {}) {
  if (!profile) return null;
  const cardHash = hashCardId(cardId);
  const shouldHaveSecondary = ['execution', 'time_travel', 'mind_control', 'astral_rebirth', 'divine_intervention'].includes(normalizeCardId(cardId))
    || hasVfxData(vfx);
  if (!shouldHaveSecondary) return null;

  const a = (Array.isArray(profile.colors) && profile.colors.length > 0) ? profile.colors[0] : '#9ad7ff';
  const b = (Array.isArray(profile.colors) && profile.colors.length > 1) ? profile.colors[1] : '#4cb6ff';
  return {
    name: `${profile.name || 'Imported VFX'} Echo`,
    colors: [b, a, '#ffffff'],
    emissionRate: Math.max(6, Math.round(toNumber(profile.emissionRate, 20) * (0.32 + (cardHash % 4) * 0.08))),
    burstCount: Math.max(2, Math.round(toNumber(profile.burstCount, 8) * 0.45)),
    velocityMin: Math.max(0.12, toNumber(profile.velocityMin, 0.4) * 0.45),
    velocityMax: Math.max(0.42, toNumber(profile.velocityMax, 1.2) * 0.72),
    lifetimeMin: Math.max(0.18, toNumber(profile.lifetimeMin, 0.25) * 1.2),
    lifetimeMax: Math.max(0.55, toNumber(profile.lifetimeMax, 1.1) * 1.35),
    spawnRadius: Math.max(0.2, toNumber(profile.spawnRadius, 0.4) * 1.2),
    gravity: [0, (Array.isArray(profile.gravity) ? toNumber(profile.gravity[1], -6) : -6) * 0.42, 0],
    noiseStrength: Math.max(0.08, toNumber(profile.noiseStrength, 0.2) * 0.7),
    noiseFrequency: Math.max(0.7, toNumber(profile.noiseFrequency, 1.4) * 0.9),
    drag: Math.max(0.03, toNumber(profile.drag, 0.08) + 0.04),
    sizeOverLife: [0.72, 0.5, 0.14],
    spawnShape: (cardHash % 2 === 0) ? 'ring' : 'sphere',
    burstDelayMs: 90 + (cardHash % 4) * 45,
  };
}

function buildCinematicAccentProfile(profile, cardId = '') {
  if (!profile) return null;
  const id = normalizeCardId(cardId);
  const cinematicIds = new Set([
    'time_freeze',
    'divine_intervention',
    'execution',
    'astral_rebirth',
    'promotion_ritual',
    'time_travel',
    'mind_control',
    'breaking_point',
    'edgerunner_overdrive',
  ]);
  if (!cinematicIds.has(id)) return null;

  return {
    name: `${profile.name || 'Cinematic'} Accent`,
    colors: ['#ffffff', ...(Array.isArray(profile.colors) ? profile.colors.slice(0, 2) : ['#9ad7ff', '#4cb6ff'])],
    emissionRate: Math.max(8, Math.round(toNumber(profile.emissionRate, 24) * 0.22)),
    burstCount: Math.max(3, Math.round(toNumber(profile.burstCount, 10) * 0.38)),
    velocityMin: Math.max(0.1, toNumber(profile.velocityMin, 0.4) * 0.35),
    velocityMax: Math.max(0.7, toNumber(profile.velocityMax, 1.2) * 0.62),
    lifetimeMin: Math.max(0.2, toNumber(profile.lifetimeMin, 0.25) * 1.1),
    lifetimeMax: Math.max(0.8, toNumber(profile.lifetimeMax, 1.1) * 1.5),
    spawnRadius: Math.max(0.32, toNumber(profile.spawnRadius, 0.4) * 1.45),
    gravity: [0, -1.2, 0],
    noiseStrength: Math.max(0.04, toNumber(profile.noiseStrength, 0.2) * 0.45),
    noiseFrequency: Math.max(0.8, toNumber(profile.noiseFrequency, 1.4) * 0.72),
    drag: Math.max(0.06, toNumber(profile.drag, 0.08) + 0.08),
    sizeOverLife: [0.58, 0.44, 0.12],
    spawnShape: 'ring',
    burstDelayMs: 210,
  };
}

export function buildStudioParticleTracksFromLegacy({ cardId = '', legacyConfig = null, durationMs = 4000, objectTrackId = null } = {}) {
  const normalizedId = normalizeCardId(cardId);
  const vfx = legacyConfig?.vfx && typeof legacyConfig.vfx === 'object' ? legacyConfig.vfx : {};
  const profile = inferProfile(normalizedId, vfx);
  if (!profile) return [];

  const baseSeed = 1200 + (hashCardId(normalizedId) % 90000);

  const mainTrack = buildParticleTrack(profile, {
    id: `pt_${normalizedId || 'card'}_main`,
    seed: baseSeed,
    durationMs,
    objectTrackId,
  });
  if (!mainTrack) return [];

  const tracks = [mainTrack];
  const secondaryProfile = buildSecondaryProfile(profile, normalizedId, vfx);
  if (secondaryProfile) {
    const secondaryTrack = buildParticleTrack(secondaryProfile, {
      id: `pt_${normalizedId || 'card'}_echo`,
      seed: baseSeed + 313,
      durationMs,
      objectTrackId,
    });
    if (secondaryTrack) tracks.push(secondaryTrack);
  }

  const cinematicAccent = buildCinematicAccentProfile(profile, normalizedId);
  if (cinematicAccent) {
    const accentTrack = buildParticleTrack(cinematicAccent, {
      id: `pt_${normalizedId || 'card'}_accent`,
      seed: baseSeed + 911,
      durationMs,
      objectTrackId,
    });
    if (accentTrack) tracks.push(accentTrack);
  }

  return tracks;
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

function normalizeVector(vec = [0, 0, 0]) {
  const length = Math.hypot(vec[0] || 0, vec[1] || 0, vec[2] || 0);
  if (length < 0.0001) return [0, 1, 0];
  return [(vec[0] || 0) / length, (vec[1] || 0) / length, (vec[2] || 0) / length];
}

function addVec3(a = [0, 0, 0], b = [0, 0, 0]) {
  return [
    (a[0] || 0) + (b[0] || 0),
    (a[1] || 0) + (b[1] || 0),
    (a[2] || 0) + (b[2] || 0),
  ];
}

export function buildParticlePreviewPoints({ sample, anchor = [0, 0, 0], maxPoints = 72 } = {}) {
  if (!sample?.active) return [];

  const params = sample.params || {};
  const emissionRate = Math.max(0, toNumber(params.emissionRate, 12));
  const burstCount = Math.max(0, toNumber(params.burstCount, 0));
  const count = clamp(Math.round(emissionRate * 0.6 + burstCount * 1.15), 8, maxPoints);
  const seed = Number.isInteger(sample.seed) ? sample.seed : 1337;
  const rand = mulberry32(seed);

  const spawnRadius = Math.max(0.01, toNumber(params.spawnRadius, 0.35));
  const velocityMin = Math.max(0, toNumber(params.velocityMin, 0.35));
  const velocityMax = Math.max(velocityMin + 0.01, toNumber(params.velocityMax, 1.6));
  const lifetime = Math.max(0.1, toNumber(params.lifetimeMax, 1.2));
  const gravity = Array.isArray(params.gravity) ? params.gravity : [0, -6, 0];
  const drag = Math.max(0, toNumber(params.drag, 0.08));
  const noiseStrength = Math.max(0, toNumber(params.noiseStrength, 0.2));
  const spawnShape = params.spawnShape || 'sphere';
  const colors = Array.isArray(params.colorOverLife) ? params.colorOverLife : ['#9ad7ff', '#4cb6ff'];
  const sizeOverLife = Array.isArray(params.sizeOverLife) ? params.sizeOverLife : [1, 0.7, 0.2];

  const points = [];
  const burstQuota = Math.min(burstCount, Math.max(0, Math.round(count * 0.45)));
  const trailQuota = Math.max(0, count - burstQuota);

  const pushPoint = ({ position, lifeT, energy = 1, direction = [0, 1, 0], velocityScale = 1 }) => {
    const sizeShape = sampleArrayCurve(sizeOverLife, lifeT, 1);
    const opacityBias = clamp(1 - lifeT * 0.95, 0, 1);
    points.push({
      position,
      color: sampleColor(colors, lifeT),
      size: (0.022 + sizeShape * 0.05) * clamp(0.65 + energy * 0.65, 0.5, 1.5),
      opacity: clamp(0.18 + opacityBias * 0.72 - drag * lifeT * 0.35 + energy * 0.12, 0.1, 0.98),
      direction,
      velocityScale,
    });
  };

  for (let i = 0; i < burstQuota; i += 1) {
    const offset = spawnOffset(spawnShape, spawnRadius, rand);
    const direction = normalizeVector(offset);
    const speed = velocityMin + (velocityMax - velocityMin) * rand();
    const lifeT = clamp(rand() * 0.22, 0, 1);
    const arc = lifetime * (0.7 + rand() * 0.35);
    const swirl = (rand() * 2 - 1) * noiseStrength;
    const gravityDrift = gravity[1] * arc * arc * 0.06;
    const position = [
      anchor[0] + offset[0] + direction[0] * speed * arc * 0.85 + swirl * 0.25,
      anchor[1] + 0.14 + offset[1] + direction[1] * speed * arc + gravityDrift,
      anchor[2] + offset[2] + direction[2] * speed * arc * 0.85 + swirl * 0.25,
    ];
    pushPoint({ position, lifeT, energy: 1, direction, velocityScale: speed });
  }

  for (let i = 0; i < trailQuota; i += 1) {
    const lifeT = trailQuota <= 1 ? 1 : i / (trailQuota - 1);
    const age = 1 - lifeT;
    const offset = spawnOffset(spawnShape, spawnRadius, rand);
    const direction = normalizeVector(addVec3(offset, [0, spawnShape === 'cone' ? 1 : 0.35, 0]));
    const speed = velocityMin + (velocityMax - velocityMin) * rand();
    const arc = lifetime * (0.28 + age * 0.9);
    const gravityDrift = [
      gravity[0] * age * age * 0.08,
      gravity[1] * age * age * 0.08,
      gravity[2] * age * age * 0.08,
    ];
    const swirl = noiseStrength * (rand() * 2 - 1);
    const trail = addVec3(
      anchor,
      addVec3(offset, [
        direction[0] * speed * arc + swirl * 0.18,
        direction[1] * speed * arc + swirl * 0.08,
        direction[2] * speed * arc + swirl * 0.18,
      ]),
    );

    pushPoint({
      position: addVec3(trail, gravityDrift),
      lifeT,
      energy: 0.55 + age * 0.45,
      direction,
      velocityScale: speed,
    });
  }

  return points;
}
