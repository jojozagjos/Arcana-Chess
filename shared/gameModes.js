/**
 * Game mode definitions.
 * Each mode determines card availability, progression, and ascension behavior.
 */
export const GAME_MODES = {
  /** Arcana unlocks after first capture. */
  Ascendant: {
    id: 'Ascendant',
    label: 'Ascendant',
    description: 'Arcana unlocks after the first capture.',
    ascensionTrigger: 'firstCapture',
    startsAscended: false,
    startingArcana: 'none',
  },

  /** Pure chess, no Arcana cards. */
  Classic: {
    id: 'Classic',
    label: 'Classic',
    description: 'Pure chess with no Arcana cards.',
    ascensionTrigger: 'never',
    startsAscended: false,
    startingArcana: 'none',
  },

  /** Temporary mode: both players start with all Arcana cards. */
  ArcanaOverflow: {
    id: 'ArcanaOverflow',
    label: 'Arcana Overflow',
    description: 'Both players start with every Arcana card available.',
    ascensionTrigger: 'never',
    startsAscended: true,
    startingArcana: 'all',
  },
};

/**
 * Mode selection options for UI menus.
 */
export const GAME_MODE_OPTIONS = Object.values(GAME_MODES).map((mode) => ({
  id: mode.id,
  label: mode.label,
  description: mode.description,
}));

/**
 * Retrieves the full configuration for a game mode.
 * @param {string} modeId - The mode ID to look up.
 * @returns {object} The mode configuration, or Ascendant as default.
 */
export function getGameModeConfig(modeId) {
  return modeId && GAME_MODES[modeId] ? GAME_MODES[modeId] : GAME_MODES.Ascendant;
}
