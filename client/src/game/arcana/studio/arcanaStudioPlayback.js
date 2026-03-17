function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
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
  const x = b0 * 0 + b1 * x1 + b2 * x2 + b3 * 1;
  const y = b0 * 0 + b1 * y1 + b2 * y2 + b3 * 1;
  if (Math.abs(x - t) < 0.0001) return y;
  return y;
}

export function easingToT(easing = 'linear', t = 0, bezier = [0.25, 0.1, 0.25, 1]) {
  const x = clamp(t, 0, 1);
  switch (easing) {
    case 'linear':
      return x;
    case 'easeInQuad':
      return x * x;
    case 'easeOutQuad':
      return 1 - (1 - x) * (1 - x);
    case 'easeInOutQuad':
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case 'easeInCubic':
      return x * x * x;
    case 'easeOutCubic':
      return 1 - Math.pow(1 - x, 3);
    case 'easeInOutCubic':
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case 'customBezier':
      return cubicBezierY(x, bezier[0], bezier[1], bezier[2], bezier[3]);
    default:
      return x;
  }
}

function getSegment(keys = [], timeMs = 0) {
  if (!Array.isArray(keys) || keys.length === 0) return { from: null, to: null, alpha: 0 };
  const sorted = [...keys].sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0));
  if (timeMs <= (sorted[0].timeMs || 0)) return { from: sorted[0], to: sorted[0], alpha: 0 };
  const last = sorted[sorted.length - 1];
  if (timeMs >= (last.timeMs || 0)) return { from: last, to: last, alpha: 1 };
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const from = sorted[index];
    const to = sorted[index + 1];
    if (timeMs >= (from.timeMs || 0) && timeMs <= (to.timeMs || 0)) {
      const span = Math.max(1, (to.timeMs || 0) - (from.timeMs || 0));
      return {
        from,
        to,
        alpha: clamp((timeMs - (from.timeMs || 0)) / span, 0, 1),
      };
    }
  }
  return { from: last, to: last, alpha: 1 };
}

export function sampleCameraTrack(track, timeMs = 0) {
  const { from, to, alpha } = getSegment(track?.keys || [], timeMs);
  if (!from) {
    return {
      position: [0, 7, 7],
      target: [0, 0, 0],
      fov: 55,
      easing: 'linear',
    };
  }
  if (!to || from === to) {
    return {
      position: from.position || [0, 7, 7],
      target: from.target || [0, 0, 0],
      fov: from.fov || 55,
      easing: from.easing || 'linear',
      blendMode: from.blendMode || 'curve',
    };
  }
  const eased = easingToT(to.easing || from.easing || 'linear', alpha, to.bezier || from.bezier);
  return {
    position: lerpVec3(from.position, to.position, eased),
    target: lerpVec3(from.target, to.target, eased),
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
      scale: [1, 1, 1],
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
  const keys = Array.isArray(track?.keys) ? [...track.keys].sort((a, b) => a.timeMs - b.timeMs) : [];
  if (keys.length === 0) {
    return { active: false, seed: 1337, overrides: {}, params: track?.params || {} };
  }
  let last = keys[0];
  keys.forEach((key) => {
    if ((key.timeMs || 0) <= timeMs) last = key;
  });
  return {
    active: Boolean(last?.enabled),
    seed: last?.seed ?? 1337,
    overrides: last?.overrides || {},
    params: {
      ...(track?.params || {}),
      ...(last?.overrides || {}),
    },
  };
}

export function collectTimelineRows(card) {
  if (!card?.tracks) return [];
  return [
    ...(card.tracks.camera || []).map((track) => ({ type: 'camera', id: track.id, label: track.name })),
    ...(card.tracks.objects || []).map((track) => ({ type: 'object', id: track.id, label: track.name })),
    ...(card.tracks.particles || []).map((track) => ({ type: 'particle', id: track.id, label: track.name })),
    ...(card.tracks.overlays || []).map((track) => ({ type: 'overlay', id: track.id, label: track.name })),
    ...(card.tracks.sounds || []).map((track) => ({ type: 'sound', id: track.id, label: track.name })),
    ...(card.tracks.events || []).map((track) => ({ type: 'event', id: track.id, label: track.name })),
  ];
}
