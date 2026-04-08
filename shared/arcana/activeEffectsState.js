function cloneValue(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(cloneValue);
  if (typeof value !== 'object') return value;
  return Object.entries(value).reduce((acc, [key, nested]) => {
    acc[key] = cloneValue(nested);
    return acc;
  }, {});
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function createDefaultActiveEffectsState() {
  return {
    ironFortress: { w: false, b: false },
    ironFortressShields: { w: [], b: [] },
    bishopsBlessing: { w: [], b: [] },
    timeFrozen: { w: false, b: false },
    timeFreezeArcanaLock: { w: false, b: false },
    cursedSquares: [],
    sanctuaries: [],
    fogOfWar: { w: false, b: false },
    vision: { w: null, b: null },
    doubleStrike: { w: false, b: false },
    doubleStrikeActive: null,
    berserkerRageActive: null,
    poisonTouch: { w: false, b: false },
    poisonedPieces: [],
    squireSupport: [],
    focusFire: { w: false, b: false },
    queensGambit: { w: 0, b: 0 },
    queensGambitUsed: { w: false, b: false },
    divineIntervention: { w: false, b: false },
    mirrorImages: [],
    spectralMarch: { w: false, b: false },
    phantomStep: { w: false, b: false },
    pawnRush: { w: false, b: false },
    sharpshooter: { w: false, b: false },
    knightOfStorms: { w: null, b: null },
    berserkerRage: { w: null, b: null },
    mindControlled: [],
    enPassantMaster: { w: false, b: false },
    temporalEcho: null,
    chainLightning: { w: false, b: false },
    castleBroken: { w: 0, b: 0 },
  };
}

export function mergeActiveEffectsState(partialState) {
  const base = createDefaultActiveEffectsState();
  if (!isPlainObject(partialState)) return base;

  const merged = { ...base };
  Object.entries(partialState).forEach(([key, value]) => {
    if (!Object.prototype.hasOwnProperty.call(base, key)) return;
    const baseValue = base[key];
    if (isPlainObject(baseValue) && isPlainObject(value)) {
      merged[key] = { ...baseValue, ...cloneValue(value) };
      return;
    }
    merged[key] = cloneValue(value);
  });

  return merged;
}
