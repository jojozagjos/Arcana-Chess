/**
 * Shared helper functions for arcana cards
 * Used across multiple components to ensure consistency
 */

/**
 * Get color associated with card rarity
 * @param {string} rarity - common, uncommon, rare, epic, legendary
 * @returns {string} hex color code
 */
export function getRarityColor(rarity) {
  const colors = {
    common: '#aaa',
    uncommon: '#4ade80',
    rare: '#60a5fa',
    epic: '#c084fc',
    legendary: '#fbbf24',
  };
  return colors[rarity] || '#fff';
}

/**
 * Get display name for log message type
 * @param {string} type - info, success, warning, error, test
 * @returns {string} hex color code
 */
export function getLogColor(type) {
  const colors = {
    info: '#aaa',
    success: '#22c55e',
    warning: '#f59e0b',
    error: '#ef4444',
    test: '#60a5fa',
  };
  return colors[type] || '#aaa';
}
