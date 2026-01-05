import React from 'react';
import { squareToPosition } from './sharedHelpers.jsx';

// ArcanaVisualHost mounts visual components exported from arcanaVisuals.jsx
// It expects `effectsModule` to be an object of visual components (loaded dynamically).
export function ArcanaVisualHost({ effectsModule, activeVisualArcana, gameState, pawnShields }) {
  const Effects = effectsModule || {};

  if (!Effects) return null;

  // Render an active arcana cutscene/effect (one-off)
  const ActiveEffect = activeVisualArcana && Effects[`${pascalCase(activeVisualArcana.arcanaId)}Effect`];

  // Helper to map arcanaId -> component name fallback
  const getEffectComponent = (arcanaId) => {
    // Most components follow the pattern: `<PascalCaseArcanaId>Effect`
    const compName = `${pascalCase(arcanaId)}Effect`;
    return Effects[compName] || null;
  };

  // Render persistent effects based on gameState.activeEffects
  const active = gameState?.activeEffects || {};

  return (
    <group>
      {/* One-off visual from server-triggered arcana */}
      {activeVisualArcana && ActiveEffect ? (
        <ActiveEffect {...(activeVisualArcana.params || {})} />
      ) : null}

      {/* Fog of War (render if either side has fog of war active) */}
      {((active.fogOfWar && active.fogOfWar.w) || (active.fogOfWar && active.fogOfWar.b)) && Effects.FogOfWarEffect ? (
        <Effects.FogOfWarEffect />
      ) : null}

      {/* Poisoned pieces */}
      {active.poisonedPieces && active.poisonedPieces.map((p, i) => (
        Effects.PoisonedPieceEffect ? <Effects.PoisonedPieceEffect key={`poison-${i}`} square={p.square} turnsLeft={p.turnsLeft} /> : null
      ))}

      {/* Squire Support indicators */}
      {active.squireSupport && active.squireSupport.map((s, i) => (
        Effects.SquireSupportEffect ? <Effects.SquireSupportEffect key={`squire-${i}`} square={s.square} /> : null
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
      {pawnShields?.w && Effects.ShieldGlowEffect ? <Effects.ShieldGlowEffect square={pawnShields.w.square} /> : null}
      {pawnShields?.b && Effects.ShieldGlowEffect ? <Effects.ShieldGlowEffect square={pawnShields.b.square} /> : null}
    </group>
  );
}

function pascalCase(id) {
  if (!id) return '';
  return id.split(/[_-]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}
