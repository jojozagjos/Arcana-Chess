/**
 * Shared arcana card service for both dev tool and in-game
 * This ensures consistent card behavior across CardBalancingToolV2 and GameScene
 */

/**
 * Extract square/target information from arcana event params
 * Handles various param field names used by different cards
 * @param {object} params - Card parameters from arcana event
 * @returns {string|null} Square name (e.g., 'e4') or null
 */
export function extractCardTargetSquare(params) {
  if (!params) return null;
  
  return params.targetSquare || 
         params.square ||
         params.kingTo ||
         params.rebornSquare ||
         null;
}

/**
 * List of cards that trigger cutscenes
 * Used by both dev tool and in-game to show camera effects
 * @returns {array} List of cutscene card IDs
 */
export function getCutsceneCardIds() {
  return ['execution', 'astral_rebirth', 'time_travel', 'mind_control', 'promotion_ritual'];
}

/**
 * Check if a card should display visuals on activation
 * Divine Intervention is special - it activates silently
 * @param {string} cardId - Card ID to check
 * @returns {boolean} True if card should show visuals immediately
 */
export function shouldShowVisualsOnActivation(cardId) {
  // Divine Intervention activates silently - only shows visuals when check occurs
  if (cardId === 'divine_intervention') {
    return false;
  }
  return true;
}

/**
 * Get arcana effect duration for visual timing
 * Used to synchronize dev tool and in-game animations
 * @param {string} cardId - Card ID
 * @returns {number} Duration in milliseconds
 */
export function getArcanaEffectDuration(cardId) {
  const durations = {
    'shield_pawn': 800,
    'soft_push': 900,
    'pawn_rush': 1000,
    'execution': 800,
    'peek_card': 600,
    'mirror_image': 900,
    'phantom_step': 1200,
    'spectral_march': 1500,
    'poison_touch': 1400,
    'squire_support': 1100,
    'vision': 1000,
    'line_of_sight': 1000,
    'map_fragments': 1200,
    'temporal_echo': 1400,
    'double_strike': 1500,
    'berserker_rage': 1500,
    'chain_lightning': 1400,
    'cursed_square': 1800,
    'mind_control': 2000,
    'time_travel': 2200,
    'fog_of_war': 2500,
    'metamorphosis': 2000,
    'sacrifice': 1800,
    'necromancy': 1600,
    'promotion_ritual': 1500,
    'arcane_cycle': 800,
    'sanctuary': 1000,
    'iron_fortress': 900,
    'astral_rebirth': 2200,
    'chaos_theory': 1800,
    'divine_intervention': 0, // No visual on activation
  };
  
  return durations[cardId] || 1500;
}

/**
 * Validate if a card can be used based on game state
 * Examples: revive cards need captured pieces, etc.
 * @param {string} cardId - Card ID
 * @param {object} gameState - Game state object
 * @param {string} playerColor - 'w' or 'b'
 * @returns {object} { canUse: boolean, reason: string }
 */
export function validateCardUsability(cardId, gameState, playerColor) {
  const captured = (gameState.capturedByColor || {})[playerColor] || [];
  
  switch (cardId) {
    case 'necromancy':
      const pawns = captured.filter(c => c.type === 'p');
      if (pawns.length === 0) {
        return { canUse: false, reason: 'No captured pawns to revive' };
      }
      break;
      
    case 'astral_rebirth':
      if (captured.length === 0) {
        return { canUse: false, reason: 'No captured pieces to revive' };
      }
      break;
  }
  
  return { canUse: true, reason: '' };
}

/**
 * Cards that activate silently (for logging purposes)
 * @returns {array} List of silent activation card IDs
 */
export function getSilentActivationCards() {
  return ['divine_intervention'];
}

/**
 * Check if a card ends the current turn
 * @param {string} cardId - Card ID
 * @returns {boolean} True if card ends turn
 */
export function doesCardEndTurn(cardId) {
  const turnEndingCards = [
    'execution', 'astral_rebirth', 'necromancy',
    'time_travel', 'chaos_theory', 'mind_control',
    'royal_swap', 'promotion_ritual', 'cursed_square'
  ];
  
  return turnEndingCards.includes(cardId);
}

/**
 * Convert pascal case (ExecutionEffect) back to snake_case (execution)
 * @param {string} pascalCase - PascalCase string
 * @returns {string} snake_case string
 */
export function pascalToSnake(pascalCase) {
  return pascalCase
    .replace(/([A-Z]+)/g, match => '_' + match.toLowerCase())
    .replace(/^_/, '')
    .replace(/Effect$/, '');
}

/**
 * Convert snake_case (execution) to PascalCase (ExecutionEffect)
 * @param {string} snakeCase - snake_case string
 * @returns {string} PascalCase string (with Effect suffix for visuals)
 */
export function snakeToPascal(snakeCase) {
  return snakeCase
    .split(/[_-]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('') + 'Effect';
}
