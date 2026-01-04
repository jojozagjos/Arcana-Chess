// Arcana effect timing configurations
// Defines duration and delay constants for visual effects

export function getArcanaEffectDuration(arcanaId) {
  const durations = {
    // Quick effects (< 1s)
    shield_pawn: 800,
    soft_push: 900,
    pawn_rush: 1000,
    
    // Medium effects (1-2s)
    phantom_step: 1200,
    spectral_march: 1500,
    poison_touch: 1400,
    squire_support: 1100,
    vision: 1000,
    line_of_sight: 1000,
    map_fragments: 1200,
    
    // Long effects (2s+)
    fog_of_war: 2500,
    metamorphosis: 2000,
    sacrifice: 1800,
    
    // Default
    default: 1500,
  };
  
  return durations[arcanaId] || durations.default;
}

export function getArcanaDelay(arcanaId) {
  // Some arcana may need a delay before showing effects
  const delays = {
    fog_of_war: 200,
    default: 0,
  };
  
  return delays[arcanaId] || delays.default;
}
