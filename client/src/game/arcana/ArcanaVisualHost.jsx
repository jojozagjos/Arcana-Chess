/**
 * Shared component that renders all arcana visual effects
 * Used by both GameScene and CardBalancingToolV2 to ensure identical visuals
 */
import React from 'react';
import { normalizeProps } from './arcanaVisualConfig';

export function ArcanaVisualHost({ 
  effectsModule, 
  activeVisualArcana, 
  gameState, 
  pawnShields = { w: null, b: null } 
}) {
  if (!effectsModule) return null;

  const Effects = effectsModule;

  return (
    <>
      {/* One-time Cutscene Effects (triggered by activeVisualArcana) */}
      {activeVisualArcana?.arcanaId === 'astral_rebirth' && activeVisualArcana.params?.square && Effects?.RebirthBeam && (
        <Effects.RebirthBeam {...normalizeProps('astral_rebirth', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'execution' && activeVisualArcana.params?.square && Effects?.ExecutionCutscene && (
        <Effects.ExecutionCutscene {...normalizeProps('execution', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'time_travel' && Effects?.TimeTravelCutscene && (
        <Effects.TimeTravelCutscene />
      )}
      {activeVisualArcana?.arcanaId === 'mind_control' && activeVisualArcana.params?.square && Effects?.MindControlCutscene && (
        <Effects.MindControlCutscene {...normalizeProps('mind_control', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'divine_intervention' && Effects?.DivineInterventionCutscene && (
        <Effects.DivineInterventionCutscene {...normalizeProps('divine_intervention', activeVisualArcana.params || {})} />
      )}
      {activeVisualArcana?.arcanaId === 'chain_lightning' && activeVisualArcana.params?.chained && Effects?.ChainLightningEffect && (
        <Effects.ChainLightningEffect {...normalizeProps('chain_lightning', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'poison_touch' && activeVisualArcana.params?.square && Effects?.PoisonCloudEffect && (
        <Effects.PoisonCloudEffect {...normalizeProps('poison_touch', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'promotion_ritual' && activeVisualArcana.params?.square && Effects?.PromotionRitualEffect && (
        <Effects.PromotionRitualEffect {...normalizeProps('promotion_ritual', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'metamorphosis' && activeVisualArcana.params?.square && Effects?.MetamorphosisEffect && (
        <Effects.MetamorphosisEffect {...normalizeProps('metamorphosis', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'iron_fortress' && activeVisualArcana.params?.square && Effects?.IronFortressEffect && (
        <Effects.IronFortressEffect {...normalizeProps('iron_fortress', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'bishops_blessing' && activeVisualArcana.params?.square && Effects?.BishopsBlessingEffect && (
        <Effects.BishopsBlessingEffect {...normalizeProps('bishops_blessing', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'time_freeze' && Effects?.TimeFreezeEffect && (
        <Effects.TimeFreezeEffect />
      )}
      {activeVisualArcana?.arcanaId === 'spectral_march' && activeVisualArcana.params?.from && activeVisualArcana.params?.to && Effects?.SpectralMarchEffect && (
        <Effects.SpectralMarchEffect {...normalizeProps('spectral_march', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'knight_of_storms' && activeVisualArcana.params?.to && Effects?.KnightOfStormsEffect && (
        <Effects.KnightOfStormsEffect {...normalizeProps('knight_of_storms', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'queens_gambit' && activeVisualArcana.params?.square && Effects?.QueensGambitEffect && (
        <Effects.QueensGambitEffect {...normalizeProps('queens_gambit', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'royal_swap' && activeVisualArcana.params?.kingFrom && activeVisualArcana.params?.kingTo && Effects?.RoyalSwapEffect && (
        <Effects.RoyalSwapEffect {...normalizeProps('royal_swap', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'double_strike' && activeVisualArcana.params?.square && Effects?.DoubleStrikeEffect && (
        <Effects.DoubleStrikeEffect {...normalizeProps('double_strike', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'sharpshooter' && activeVisualArcana.params?.from && activeVisualArcana.params?.to && Effects?.SharpshooterEffect && (
        <Effects.SharpshooterEffect {...normalizeProps('sharpshooter', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'berserker_rage' && activeVisualArcana.params?.square && Effects?.BerserkerRageEffect && (
        <Effects.BerserkerRageEffect {...normalizeProps('berserker_rage', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'necromancy' && activeVisualArcana.params?.revived && Effects?.NecromancyEffect && (
        <Effects.NecromancyEffect {...normalizeProps('necromancy', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'mirror_image' && activeVisualArcana.params?.square && Effects?.MirrorImageEffect && (
        <Effects.MirrorImageEffect {...normalizeProps('mirror_image', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'fog_of_war' && Effects?.FogOfWarEffect && (
        <Effects.FogOfWarEffect />
      )}
      {activeVisualArcana?.arcanaId === 'chaos_theory' && Effects?.ChaosTheoryEffect && (
        <Effects.ChaosTheoryEffect />
      )}
      {activeVisualArcana?.arcanaId === 'sacrifice' && activeVisualArcana.params?.sacrificed && Effects?.SacrificeEffect && (
        <Effects.SacrificeEffect {...normalizeProps('sacrifice', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'castle_breaker' && activeVisualArcana.params?.destroyed && Effects?.CastleBreakerEffect && (
        <Effects.CastleBreakerEffect {...normalizeProps('castle_breaker', activeVisualArcana.params)} />
      )}
      {activeVisualArcana?.arcanaId === 'temporal_echo' && activeVisualArcana.params?.square && Effects?.TemporalEchoEffect && (
        <Effects.TemporalEchoEffect {...normalizeProps('temporal_echo', activeVisualArcana.params)} />
      )}

      {/* Persistent Board Effects (from gameState) */}
      {gameState?.activeEffects?.cursedSquares?.map((c, i) => (
        Effects?.CursedSquareEffect ? <Effects.CursedSquareEffect key={`cursed-${i}`} square={c.square} /> : null
      ))}
      {gameState?.activeEffects?.sanctuaries?.map((s, i) => (
        Effects?.SanctuaryEffect ? <Effects.SanctuaryEffect key={`sanctuary-${i}`} square={s.square} /> : null
      ))}
      {gameState?.activeEffects?.mirrorImages?.map((m, i) => (
        Effects?.MirrorImageEffect ? <Effects.MirrorImageEffect key={`mirror-${i}`} square={m.square} /> : null
      ))}
      {(gameState?.activeEffects?.fogOfWar?.w || gameState?.activeEffects?.fogOfWar?.b) && (
        Effects?.FogOfWarEffect ? <Effects.FogOfWarEffect /> : null
      )}
      
      {/* Pawn Shields */}
      {pawnShields.w?.square && (Effects?.ShieldGlowEffect ? <Effects.ShieldGlowEffect square={pawnShields.w.square} /> : null)}
      {pawnShields.b?.square && (Effects?.ShieldGlowEffect ? <Effects.ShieldGlowEffect square={pawnShields.b.square} /> : null)}
    </>
  );
}
