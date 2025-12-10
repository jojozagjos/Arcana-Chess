/**
 * Centralized timing constants for arcana animations and cutscenes
 * Ensures identical timing between GameScene and CardBalancingToolV2
 */

export const ARCANA_TIMINGS = {
  // Default durations (ms)
  DEFAULT_CUTSCENE: 3000,
  DEFAULT_EFFECT: 2000,
  DEFAULT_PERSISTENT: 0, // Persistent effects stay until removed
  
  // Specific arcana timings
  astral_rebirth: 2500,
  execution: 2000,
  time_travel: 3000,
  mind_control: 2500,
  divine_intervention: 3000,
  chain_lightning: 2000,
  poison_touch: 2000,
  promotion_ritual: 2500,
  metamorphosis: 2500,
  iron_fortress: 0, // Persistent
  bishops_blessing: 0, // Persistent
  time_freeze: 2000,
  spectral_march: 2000,
  knight_of_storms: 2000,
  queens_gambit: 2000,
  royal_swap: 2500,
  double_strike: 1500,
  sharpshooter: 2000,
  berserker_rage: 2000,
  necromancy: 2500,
  mirror_image: 0, // Persistent
  fog_of_war: 0, // Persistent
  chaos_theory: 2500,
  sacrifice: 2000,
  castle_breaker: 2000,
  temporal_echo: 2500,
  
  // Shield effects
  pawn_guard: 0, // Persistent
  shield_pawn: 0, // Persistent
  
  // Animation easing constants
  EASE_IN_OUT: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
  EASE_IN: (t) => t * t,
  EASE_OUT: (t) => 1 - Math.pow(1 - t, 2),
};

/**
 * Get duration for a specific arcana effect
 * @param {string} arcanaId - The arcana card ID
 * @returns {number} Duration in milliseconds
 */
export function getArcanaEffectDuration(arcanaId) {
  return ARCANA_TIMINGS[arcanaId] ?? ARCANA_TIMINGS.DEFAULT_EFFECT;
}
