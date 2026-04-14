function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return (a || 0) + ((b || 0) - (a || 0)) * t;
}

function lerpVec3(a, b, t) {
  return [
    lerp(a?.[0] ?? 0, b?.[0] ?? 0, t),
    lerp(a?.[1] ?? 0, b?.[1] ?? 0, t),
    lerp(a?.[2] ?? 0, b?.[2] ?? 0, t),
  ];
}

function cubicBezierY(t, x1, y1, x2, y2) {
  const inv = 1 - t;
  const b0 = inv * inv * inv;
  const b1 = 3 * inv * inv * t;
  const b2 = 3 * inv * t * t;
  const b3 = t * t * t;
  const x = b1 * x1 + b2 * x2 + b3;
  const y = b1 * y1 + b2 * y2 + b3;
  if (Math.abs(x - t) < 0.00001) return y;
  return y;
}

export function easingToT(easing = 'linear', t = 0, bezier = [0.25, 0.1, 0.25, 1]) {
  const x = clamp(t, 0, 1);
  switch (easing) {
    case 'linear':
      return x;
    case 'instant':
      return x < 1 ? 0 : 1;
    case 'easeInQuad':
      return x * x;
    case 'easeOutQuad':
      return 1 - (1 - x) * (1 - x);
    case 'easeInOutQuad':
      return x < 0.5 ? 2 * x * x : 1 - ((-2 * x + 2) ** 2) / 2;
    case 'easeInCubic':
      return x ** 3;
    case 'easeOutCubic':
      return 1 - (1 - x) ** 3;
    case 'easeInOutCubic':
      return x < 0.5 ? 4 * x ** 3 : 1 - ((-2 * x + 2) ** 3) / 2;
    case 'customBezier':
      return cubicBezierY(x, bezier[0], bezier[1], bezier[2], bezier[3]);
    default:
      return x;
  }
}

function sortKeys(keys = []) {
  return keys.slice().sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
}

function getSegment(keys = [], timeMs = 0) {
  if (!Array.isArray(keys) || !keys.length) return { from: null, to: null, alpha: 0 };
  const sorted = sortKeys(keys);
  if (timeMs <= (sorted[0].timeMs || 0)) return { from: sorted[0], to: sorted[0], alpha: 0 };
  const last = sorted[sorted.length - 1];
  if (timeMs >= (last.timeMs || 0)) return { from: last, to: last, alpha: 1 };

  for (let i = 0; i < sorted.length - 1; i += 1) {
    const from = sorted[i];
    const to = sorted[i + 1];
    const fromMs = from.timeMs || 0;
    const toMs = to.timeMs || 0;
    if (timeMs >= fromMs && timeMs <= toMs) {
      const span = Math.max(1, toMs - fromMs);
      return { from, to, alpha: clamp((timeMs - fromMs) / span, 0, 1) };
    }
  }

  return { from: last, to: last, alpha: 1 };
}

export function sampleCameraTrack(track, timeMs = 0) {
  const { from, to, alpha } = getSegment(track?.keys || [], timeMs);
  if (!from) {
    return { position: [0, 7, 7], target: [0, 0, 0], rotation: [0, 0, 0], fov: 55, easing: 'linear', blendMode: 'curve' };
  }
  if (!to || from === to || to.blendMode === 'cut') {
    return {
      position: from.position || [0, 7, 7],
      target: from.target || [0, 0, 0],
      rotation: from.rotation || [0, 0, 0],
      fov: from.fov || 55,
      easing: from.easing || 'linear',
      blendMode: from.blendMode || 'curve',
    };
  }

  const eased = easingToT(to.easing || from.easing || 'linear', alpha, to.bezier || from.bezier);
  return {
    position: lerpVec3(from.position, to.position, eased),
    target: lerpVec3(from.target, to.target, eased),
    rotation: lerpVec3(from.rotation, to.rotation, eased),
    fov: lerp(from.fov || 55, to.fov || 55, eased),
    easing: to.easing || from.easing || 'linear',
    blendMode: to.blendMode || from.blendMode || 'curve',
  };
}

export function sampleObjectTrack(track, timeMs = 0) {
  const { from, to, alpha } = getSegment(track?.keys || [], timeMs);
  if (!from) {
    return {
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      scale: track?.isAnimatablePiece ? [1.8, 1.8, 1.8] : [1, 1, 1],
    };
  }
  if (!to || from === to) {
    return {
      position: from.position || [0, 0, 0],
      rotation: from.rotation || [0, 0, 0],
      scale: from.scale || [1, 1, 1],
    };
  }

  const eased = easingToT(to.easing || from.easing || 'linear', alpha, to.bezier || from.bezier);
  return {
    position: lerpVec3(from.position, to.position, eased),
    rotation: lerpVec3(from.rotation, to.rotation, eased),
    scale: lerpVec3(from.scale, to.scale, eased),
  };
}

export function sampleOverlayTrack(track, timeMs = 0) {
  const { from, to, alpha } = getSegment(track?.keys || [], timeMs);
  if (!from) return null;
  if (!to || from === to) {
    return {
      x: from.x ?? 50,
      y: from.y ?? 50,
      opacity: from.opacity ?? 1,
      scale: from.scale ?? 1,
      rotation: from.rotation ?? 0,
      text: from.text ?? track?.content ?? '',
    };
  }

  const eased = easingToT(to.easing || from.easing || 'linear', alpha, to.bezier || from.bezier);
  return {
    x: lerp(from.x ?? 50, to.x ?? 50, eased),
    y: lerp(from.y ?? 50, to.y ?? 50, eased),
    opacity: lerp(from.opacity ?? 1, to.opacity ?? 1, eased),
    scale: lerp(from.scale ?? 1, to.scale ?? 1, eased),
    rotation: lerp(from.rotation ?? 0, to.rotation ?? 0, eased),
    text: to.text ?? from.text ?? track?.content ?? '',
  };
}

export function sampleParticleTrack(track, timeMs = 0) {
  const { from, to, alpha } = getSegment(track?.keys || [], timeMs);
  if (!from) {
    return { active: false, seed: 1337, overrides: {}, params: track?.params || {} };
  }

  const baseParams = track?.params || {};
  const fromOverrides = from.overrides || {};
  if (!to || from === to) {
    return {
      active: Boolean(from.enabled),
      seed: from.seed ?? 1337,
      overrides: fromOverrides,
      params: {
        ...baseParams,
        ...fromOverrides,
      },
    };
  }

  const toOverrides = to.overrides || {};
  const eased = easingToT(to.easing || from.easing || 'linear', alpha, to.bezier || from.bezier);
  const merged = {
    ...baseParams,
    ...fromOverrides,
    ...toOverrides,
  };

  Object.keys(merged).forEach((key) => {
    const a = fromOverrides[key] ?? baseParams[key];
    const b = toOverrides[key] ?? baseParams[key];

    if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a) && Number.isFinite(b)) {
      merged[key] = lerp(a, b, eased);
      return;
    }

    if (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v) => typeof v === 'number') && b.every((v) => typeof v === 'number')) {
      merged[key] = a.map((val, idx) => lerp(val, b[idx], eased));
    }
  });

  return {
    active: Boolean(from.enabled),
    seed: from.seed ?? 1337,
    overrides: fromOverrides,
    params: merged,
  };
}

export function collectTimelineRows(card) {
  if (!card?.tracks) return [];
  return [
    ...(card.tracks.camera || []).map((track) => ({ type: 'camera', id: track.id, label: track.name || 'Camera' })),
    ...(card.tracks.objects || []).map((track) => ({ type: 'object', id: track.id, label: track.name || 'Object' })),
    ...(card.tracks.particles || []).map((track) => ({ type: 'particle', id: track.id, label: track.name || 'Particle' })),
    ...(card.tracks.overlays || []).map((track) => ({ type: 'overlay', id: track.id, label: track.name || 'Overlay' })),
    ...(card.tracks.sounds || []).map((track) => ({ type: 'sound', id: track.id, label: track.name || 'Audio' })),
    ...(card.tracks.events || []).map((track) => ({ type: 'event', id: track.id, label: track.name || 'Event' })),
  ];
}
