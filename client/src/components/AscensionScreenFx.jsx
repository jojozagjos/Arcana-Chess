import React, { useEffect, useState } from 'react';

export function AscensionScreenFx({ token }) {
  const [state, setState] = useState({ visible: false, progress: 1 });

  useEffect(() => {
    if (!token) return;

    const durationMs = 2200;
    let rafId = null;
    let hideTimer = null;
    const start = performance.now();
    setState({ visible: true, progress: 0 });

    const animate = (now) => {
      const progress = Math.min((now - start) / durationMs, 1);
      setState({ visible: true, progress });
      if (progress < 1) {
        rafId = requestAnimationFrame(animate);
      } else {
        hideTimer = setTimeout(() => {
          setState({ visible: false, progress: 1 });
        }, 120);
      }
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [token]);

  if (!state.visible) return null;

  const p = state.progress;
  const burst = Math.sin(Math.min(1, p * 1.25) * Math.PI);
  const veilOpacity = Math.max(0, (1 - p) * 0.9);
  const ringScale = 0.5 + p * 1.9;
  const ringOpacity = Math.max(0, (1 - p) * 0.65);
  const titleOpacity = Math.max(0, Math.sin(Math.min(1, p * 1.2) * Math.PI));

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 1400,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at 50% 50%, rgba(136,192,208,${0.36 * burst}) 0%, rgba(111,66,193,${0.22 * burst}) 32%, rgba(6,12,24,${veilOpacity}) 75%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${ringScale})`,
          width: '42vmin',
          height: '42vmin',
          borderRadius: '999px',
          border: `2px solid rgba(168,230,255,${ringOpacity})`,
          boxShadow: `0 0 70px rgba(122, 201, 255, ${ringOpacity})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -52%) scale(${1 + burst * 0.08})`,
          fontSize: 'clamp(2rem, 7vw, 5.4rem)',
          letterSpacing: '0.14em',
          fontWeight: 800,
          color: 'rgba(226,245,255,0.98)',
          textShadow: '0 0 24px rgba(136,192,208,0.88), 0 0 52px rgba(94,155,255,0.55)',
          opacity: titleOpacity,
          textTransform: 'uppercase',
          textAlign: 'center',
          whiteSpace: 'nowrap',
        }}
      >
        Ascension!
      </div>
    </div>
  );
}
