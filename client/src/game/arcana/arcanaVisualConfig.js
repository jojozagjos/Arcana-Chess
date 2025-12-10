/**
 * Configuration mapping for arcana visual effects
 * Maps arcana IDs to their visual component names and expected props
 * Ensures consistency between GameScene and CardBalancingToolV2
 */

export const ARCANA_VISUAL_CONFIG = {
  // One-time cutscene effects
  astral_rebirth: {
    component: 'RebirthBeam',
    propMapping: { square: 'targetSquare' }, // Host passes 'square', component expects 'targetSquare'
    type: 'cutscene',
  },
  execution: {
    component: 'ExecutionCutscene',
    propMapping: { square: 'targetSquare' },
    type: 'cutscene',
  },
  time_travel: {
    component: 'TimeTravelCutscene',
    propMapping: {},
    type: 'cutscene',
  },
  mind_control: {
    component: 'MindControlCutscene',
    propMapping: { square: 'targetSquare' },
    type: 'cutscene',
  },
  divine_intervention: {
    component: 'DivineInterventionCutscene',
    propMapping: { square: 'kingSquare' },
    type: 'cutscene',
  },
  chain_lightning: {
    component: 'ChainLightningEffect',
    propMapping: { chained: 'squares' }, // Host passes 'chained', component expects 'squares' or 'targets'
    type: 'cutscene',
  },
  poison_touch: {
    component: 'PoisonCloudEffect',
    propMapping: {},
    type: 'cutscene',
  },
  promotion_ritual: {
    component: 'PromotionRitualEffect',
    propMapping: {},
    type: 'cutscene',
  },
  metamorphosis: {
    component: 'MetamorphosisEffect',
    propMapping: {},
    type: 'cutscene',
  },
  time_freeze: {
    component: 'TimeFreezeEffect',
    propMapping: {},
    type: 'cutscene',
  },
  spectral_march: {
    component: 'SpectralMarchEffect',
    propMapping: { from: 'fromSquare', to: 'toSquare' },
    type: 'cutscene',
  },
  knight_of_storms: {
    component: 'KnightOfStormsEffect',
    propMapping: { to: 'square' },
    type: 'cutscene',
  },
  queens_gambit: {
    component: 'QueensGambitEffect',
    propMapping: {},
    type: 'cutscene',
  },
  royal_swap: {
    component: 'RoyalSwapEffect',
    propMapping: { kingFrom: 'kingFrom', kingTo: 'kingTo' },
    type: 'cutscene',
  },
  double_strike: {
    component: 'DoubleStrikeEffect',
    propMapping: {},
    type: 'cutscene',
  },
  sharpshooter: {
    component: 'SharpshooterEffect',
    propMapping: { from: 'fromSquare', to: 'toSquare' },
    type: 'cutscene',
  },
  berserker_rage: {
    component: 'BerserkerRageEffect',
    propMapping: {},
    type: 'cutscene',
  },
  necromancy: {
    component: 'NecromancyEffect',
    propMapping: { revived: 'squares' },
    type: 'cutscene',
  },
  sacrifice: {
    component: 'SacrificeEffect',
    propMapping: { sacrificed: 'square' },
    type: 'cutscene',
  },
  castle_breaker: {
    component: 'CastleBreakerEffect',
    propMapping: { destroyed: 'square' },
    type: 'cutscene',
  },
  temporal_echo: {
    component: 'TemporalEchoEffect',
    propMapping: {},
    type: 'cutscene',
  },
  chaos_theory: {
    component: 'ChaosTheoryEffect',
    propMapping: {},
    type: 'cutscene',
  },
  fog_of_war: {
    component: 'FogOfWarEffect',
    propMapping: {},
    type: 'cutscene',
  },
  
  // Persistent board effects
  iron_fortress: {
    component: 'IronFortressEffect',
    propMapping: { square: 'kingSquare' },
    type: 'persistent',
  },
  bishops_blessing: {
    component: 'BishopsBlessingEffect',
    propMapping: { bishopSquare: 'square' },
    type: 'persistent',
  },
  pawn_guard: {
    component: 'ShieldGlowEffect',
    propMapping: {},
    type: 'persistent',
  },
  shield_pawn: {
    component: 'ShieldGlowEffect',
    propMapping: {},
    type: 'persistent',
  },
  cursed_square: {
    component: 'CursedSquareEffect',
    propMapping: {},
    type: 'persistent',
  },
  sanctuary: {
    component: 'SanctuaryEffect',
    propMapping: {},
    type: 'persistent',
  },
  mirror_image: {
    component: 'MirrorImageEffect',
    propMapping: {},
    type: 'persistent',
  },
};

/**
 * Get visual config for a specific arcana
 * @param {string} arcanaId - The arcana card ID
 * @returns {Object|null} Config object or null if not found
 */
export function getVisualConfig(arcanaId) {
  return ARCANA_VISUAL_CONFIG[arcanaId] || null;
}

/**
 * Normalize props based on the mapping for a specific arcana
 * @param {string} arcanaId - The arcana card ID
 * @param {Object} hostProps - Props passed from the host
 * @returns {Object} Normalized props for the component
 */
export function normalizeProps(arcanaId, hostProps) {
  const config = getVisualConfig(arcanaId);
  if (!config || !config.propMapping) return hostProps;
  
  const normalized = { ...hostProps };
  
  // Apply prop name mappings
  for (const [hostKey, componentKey] of Object.entries(config.propMapping)) {
    if (hostProps[hostKey] !== undefined) {
      normalized[componentKey] = hostProps[hostKey];
      // Keep original for backward compatibility
      if (hostKey !== componentKey) {
        normalized[hostKey] = hostProps[hostKey];
      }
    }
  }
  
  return normalized;
}
