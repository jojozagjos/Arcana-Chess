import { ARCANA_DEFINITIONS } from '../arcanaDefinitions.js';

export const ARCANA_RARITY_ORDER = Object.freeze({
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
  '???': 6,
});

const ARCANA_ID_ALIASES = Object.freeze({
  filtered_cycle: 'arcane_cycle',
});

const ARCANA_ID_REVERSE_ALIASES = Object.freeze(
  Object.entries(ARCANA_ID_ALIASES).reduce((acc, [alias, canonical]) => {
    acc[canonical] = alias;
    return acc;
  }, {}),
);

export function resolveArcanaDefinitionId(cardId = '') {
  const normalized = String(cardId || '').trim();
  return ARCANA_ID_ALIASES[normalized] || normalized;
}

export function toStudioArcanaId(cardId = '') {
  const normalized = String(cardId || '').trim();
  return ARCANA_ID_REVERSE_ALIASES[normalized] || normalized;
}

export function listArcanaDefinitions() {
  return Array.isArray(ARCANA_DEFINITIONS) ? ARCANA_DEFINITIONS : [];
}

export function getArcanaDefinition(cardId = '') {
  const definitionId = resolveArcanaDefinitionId(cardId);
  return listArcanaDefinitions().find((entry) => entry?.id === definitionId) || null;
}

export function listSortedArcanaDefinitions() {
  const defs = [...listArcanaDefinitions()];
  return defs.sort((a, b) => {
    const rankA = ARCANA_RARITY_ORDER[String(a?.rarity || '').toLowerCase()] || 999;
    const rankB = ARCANA_RARITY_ORDER[String(b?.rarity || '').toLowerCase()] || 999;
    if (rankA !== rankB) return rankA - rankB;
    return String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || ''));
  });
}
