import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { squareToPosition } from './sharedHelpers.jsx';
import { getArcanaEffectDuration } from './arcanaTimings.js';
import { effectResourcePool } from '../effectResourcePool.js';

// Safe disposal utility to prevent WebGL context errors
function safeDispose(obj) {
  try {
    if (obj?.geometry) {
      obj.geometry.dispose();
    }
    if (obj?.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        m?.dispose?.();
      }
    }
  } catch (e) {
    // Silently ignore WebGL context errors during cleanup
  }
}

// ArcanaVisualHost mounts visual components exported from arcanaVisuals.jsx
// It expects `effectsModule` to be an object of visual components (loaded dynamically).
export function ArcanaVisualHost({ effectsModule, activeVisualArcana, gameState, pawnShields, showFog, viewerColorCode }) {
  const Effects = effectsModule || {};

  if (!Effects) return null;

  // Helper to map arcanaId -> component name fallback
  const getEffectComponent = (arcanaId) => {
    const compName = `${pascalCase(arcanaId)}Effect`;
    return Effects[compName] || null;
  };

  // Render persistent effects based on gameState.activeEffects
  const active = gameState?.activeEffects || {};
  const poisonedSquares = new Set((active.poisonedPieces || []).map((p) => p.square).filter(Boolean));

  // Local instances to allow fade-out after the effect finishes
  const [instances, setInstances] = useState([]);
  const idRef = useRef(1);

  // When a new activeVisualArcana appears, check resource limits then add instance with fade-out
  useEffect(() => {
    if (!activeVisualArcana) return;
    const { arcanaId, params } = activeVisualArcana;
    const EffectComp = getEffectComponent(arcanaId);
    if (!EffectComp) return;

    // Check if we can create a new effect (resource limits)
    const particleEstimate = params?.count || 60;
    if (!effectResourcePool.canCreateEffect(particleEstimate)) {
      console.warn(`[GameScene] Cannot create effect ${arcanaId} - resource limits reached`);
      return;
    }

    const id = idRef.current++;
    const duration = getArcanaEffectDuration(arcanaId) || 3000;
    const fadeMs = 600; // fade-out duration

    // Register effect with resource pool
    const cappedParticleCount = effectResourcePool.registerEffect(id, particleEstimate);
    const adjustedParams = params ? { ...params, count: cappedParticleCount } : { count: cappedParticleCount };

    const inst = { id, arcanaId, params: adjustedParams, EffectComp, fading: false };
    setInstances(prev => [...prev, inst]);

    // Start fade after main duration, then remove after fadeMs
    const startFade = setTimeout(() => {
      setInstances(prev => prev.map(p => p.id === id ? { ...p, fading: true } : p));
      const removeT = setTimeout(() => {
        setInstances(prev => prev.filter(p => p.id !== id));
        // Unregister from resource pool
        effectResourcePool.unregisterEffect(id);
        clearTimeout(removeT);
      }, fadeMs);
      clearTimeout(startFade);
    }, duration);

    return () => {
      clearTimeout(startFade);
      effectResourcePool.unregisterEffect(id);
    };
  }, [activeVisualArcana]);

  // Deferred disposal disabled here to avoid cross-context WebGL delete errors.

  return (
    <group>
      {/* One-off visual instances with fade support */}
      {instances.map(inst => (
        <EffectWrapper
          key={inst.id}
          Effect={inst.EffectComp}
          params={inst.params}
          fading={inst.fading}
        />
      ))}

      {/* Fog of War: render only if this viewer should see the fog overlay (showFog) */}
      {showFog && Effects.FogOfWarEffect ? (
        <Effects.FogOfWarEffect />
      ) : null}

      {/* Poisoned pieces */}
      {active.poisonedPieces && active.poisonedPieces.map((p, i) => (
        Effects.PoisonedPieceEffect ? <Effects.PoisonedPieceEffect key={`poison-${i}`} square={p.square} turnsLeft={p.turnsLeft} /> : null
      ))}

      {/* Squire Support indicators */}
      {active.squireSupport && active.squireSupport.map((s, i) => (
        Effects.SquireSupportEffect && (!viewerColorCode || !s.ownerColor || s.ownerColor === viewerColorCode)
          ? <Effects.SquireSupportEffect key={`squire-${i}`} square={s.square} />
          : null
      ))}

      {/* Sanctuary indicators */}
      {active.sanctuaries && active.sanctuaries.map((s, i) => (
        Effects.SanctuaryIndicatorEffect ? <Effects.SanctuaryIndicatorEffect key={`sanctuary-${i}`} square={s.square} /> : null
      ))}

      {/* Cursed square indicators */}
      {active.cursedSquares && active.cursedSquares.map((c, i) => (
        Effects.CursedSquareIndicatorEffect ? <Effects.CursedSquareIndicatorEffect key={`cursed-${i}`} square={c.square} turnsLeft={c.turns} /> : null
      ))}

      {/* Pawn shields (display for both colors if present) */}
      {pawnShields?.w && Effects.ShieldGlowEffect && !poisonedSquares.has(pawnShields.w.square) ? <Effects.ShieldGlowEffect square={pawnShields.w.square} /> : null}
      {pawnShields?.b && Effects.ShieldGlowEffect && !poisonedSquares.has(pawnShields.b.square) ? <Effects.ShieldGlowEffect square={pawnShields.b.square} /> : null}
      
      {/* Iron Fortress shields - show only for currently active fortress color */}
      {Effects.ShieldGlowEffect && active.ironFortress?.w && active.ironFortressShields?.w?.map((sq, i) => (
        <Effects.ShieldGlowEffect key={`fortress-w-${i}`} square={sq} />
      ))}
      {Effects.ShieldGlowEffect && active.ironFortress?.b && active.ironFortressShields?.b?.map((sq, i) => (
        <Effects.ShieldGlowEffect key={`fortress-b-${i}`} square={sq} />
      ))}
    </group>
  );
}

function EffectWrapper({ Effect, params, fading }) {
  const ref = useRef();
  const opacityRef = useRef(1);
  const fadeDuration = 600; // ms
  const last = useRef(Date.now());
  const materialOriginals = useRef(new Map());
  const [fadeOpacityState, setFadeOpacityState] = useState(1);

  // On mount: ensure transparent materials do not write depth to avoid board see-through
  useEffect(() => {
    if (!ref.current) return;
    ref.current.traverse((obj) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!materialOriginals.current.has(m)) {
          materialOriginals.current.set(m, {
            transparent: m.transparent,
            opacity: typeof m.opacity === 'number' ? m.opacity : 1,
            depthWrite: m.depthWrite,
            uniforms: m.uniforms ? { ...m.uniforms } : null,
          });
        }
        try {
          if (m.transparent) m.depthWrite = false;
        } catch (e) {}
      }
    });
  }, []);

  // Apply fading by reducing material opacity on each frame; also support ShaderMaterial uniforms
  useFrame(() => {
    if (!ref.current) return;
    if (!fading) return;
    const now = Date.now();
    const dt = now - last.current;
    last.current = now;
    // linear decay
    opacityRef.current -= dt / fadeDuration;
    if (opacityRef.current < 0) opacityRef.current = 0;
    // update React state for prop propagation
    setFadeOpacityState(opacityRef.current);

    ref.current.traverse((obj) => {
      if (!obj.material) return;
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!materialOriginals.current.has(m)) {
          materialOriginals.current.set(m, {
            transparent: m.transparent,
            opacity: typeof m.opacity === 'number' ? m.opacity : 1,
            depthWrite: m.depthWrite,
            uniforms: m.uniforms ? { ...m.uniforms } : null,
          });
        }

        // ensure transparent and depthWrite disabled for fade
        try { m.transparent = true; } catch (e) {}
        try { m.depthWrite = false; } catch (e) {}

        // set common opacity field
        if (typeof m.opacity === 'number') {
          try { m.opacity = opacityRef.current; } catch (e) {}
        }

        // shader uniforms: try common names
        if (m.uniforms) {
          if ('uOpacity' in m.uniforms) {
            try { m.uniforms.uOpacity.value = opacityRef.current; } catch (e) {}
          }
          if ('opacity' in m.uniforms) {
            try { m.uniforms.opacity.value = opacityRef.current; } catch (e) {}
          }
        }
      }
    });
  });

  useEffect(() => {
    // when fading is cleared, restore original material props where possible
    if (!fading && ref.current) {
      ref.current.traverse((obj) => {
        if (!obj.material) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          const orig = materialOriginals.current.get(m);
          if (orig) {
            try { m.transparent = orig.transparent; } catch (e) {}
            try { m.opacity = orig.opacity; } catch (e) {}
            try { m.depthWrite = orig.depthWrite; } catch (e) {}
            if (orig.uniforms && m.uniforms) {
              if ('uOpacity' in m.uniforms && 'uOpacity' in orig.uniforms) try { m.uniforms.uOpacity.value = orig.uniforms.uOpacity.value; } catch (e) {}
              if ('opacity' in m.uniforms && 'opacity' in orig.uniforms) try { m.uniforms.opacity.value = orig.uniforms.opacity.value; } catch (e) {}
            }
          }
        }
      });
      opacityRef.current = 1;
      materialOriginals.current.clear();
    }
  }, [fading]);

  useEffect(() => {
    // cleanup on unmount: restore material properties only.
    // Let R3F/Three own disposal to ensure it happens on the correct WebGL context.
    return () => {
      if (ref.current) {
        ref.current.traverse((obj) => {
          if (!obj.material) return;
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const m of mats) {
            const orig = materialOriginals.current.get(m);
            if (orig) {
              try { m.transparent = orig.transparent; } catch (e) {}
              try { m.opacity = orig.opacity; } catch (e) {}
              try { m.depthWrite = orig.depthWrite; } catch (e) {}
              if (orig.uniforms && m.uniforms) {
                if ('uOpacity' in m.uniforms && 'uOpacity' in orig.uniforms) try { m.uniforms.uOpacity.value = orig.uniforms.uOpacity.value; } catch (e) {}
                if ('opacity' in m.uniforms && 'opacity' in orig.uniforms) try { m.uniforms.opacity.value = orig.uniforms.opacity.value; } catch (e) {}
              }
            }
          }
        });
      }
      materialOriginals.current.clear();
    };
  }, []);

  const normalizedParams = { ...(params || {}) };
  if (!normalizedParams.square && normalizedParams.targetSquare) {
    normalizedParams.square = normalizedParams.targetSquare;
  }
  if (!normalizedParams.origin && normalizedParams.square) {
    normalizedParams.origin = normalizedParams.square;
  }
  if (!Array.isArray(normalizedParams.chained) && Array.isArray(normalizedParams.destroyedPieces)) {
    normalizedParams.chained = normalizedParams.destroyedPieces.map((p) => p?.square).filter(Boolean);
  }

  return (
    <group ref={ref}>
      <Effect {...normalizedParams} fadeOpacity={fadeOpacityState} fading={fading} />
    </group>
  );
}

function pascalCase(id) {
  if (!id) return '';
  return id.split(/[_-]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}
