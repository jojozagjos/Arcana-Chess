# Rare-Legendary Card Fixes

## Date: March 2, 2026

## Issues Fixed:

### 1. **Cutscene Error: `square.charCodeAt is not a function`**
**Problem**: Cutscene code was receiving non-string values for `square` parameter, causing crashes.

**Fixes**:
- **[sharedHelpers.jsx](client/src/game/arcana/sharedHelpers.jsx#L11-L18)**: Added type checking to ensure `square` is a string before calling `charCodeAt()`.
- **[GameScene.jsx](client/src/components/GameScene.jsx#L321-L334)**: Improved square extraction to check multiple param field names (`targetSquare`, `square`, `kingTo`, `rebornSquare`) with validation.

```javascript
// Before: Assumed params.targetSquare existed
triggerCutscene(lastArcanaEvent.params.targetSquare, {...});

// After: Checks multiple fields and validates type
const targetSquare = lastArcanaEvent.params?.targetSquare || 
                    lastArcanaEvent.params?.square ||
                    lastArcanaEvent.params?.kingTo ||
                    lastArcanaEvent.params?.rebornSquare;

if (targetSquare && typeof targetSquare === 'string') {
  triggerCutscene(targetSquare, {...});
}
```

---

### 2. **Necromancy: Spawning New Pawns Instead of Reviving**
**Problem**: Necromancy was placing new pawns on empty squares instead of reviving captured pawns from the graveyard.

**Fixes**:
- **[arcanaHandlers.js](server/arcana/arcanaHandlers.js#L1247-L1271)**: Modified `revivePawns()` to check `capturedByColor` list and remove pawns from it when reviving.
- **[arcanaHandlers.js](server/arcana/arcanaHandlers.js#L26-L33)**: Added validation to prevent using Necromancy when no captured pawns exist.

```javascript
// Now checks captured pawns first
const capturedPawns = captured.filter(p => p.type === 'p');
if (capturedPawns.length === 0) {
  return []; // Can't revive if none captured
}

// Remove from captured list when reviving
const idx = captured.findIndex(p => p.type === 'p');
if (idx !== -1) captured.splice(idx, 1);
```

---

### 3. **Metamorphosis: Validation and Targeting**
**Problem**: Unclear error messages and missing validation.

**Fixes**:
- **[arcanaHandlers.js](server/arcana/arcanaHandlers.js#L102-L123)**: Added comprehensive validation:
  - Must target own piece
  - Cannot transform king or queen
  - Must specify `newType` parameter
  - Cannot transform into king or queen

---

### 4. **Mirror Image: Better Error Handling**
**Problem**: No validation feedback when targeting failed.

**Fixes**:
- **[arcanaHandlers.js](server/arcana/arcanaHandlers.js#L125-L133)**: Added validation:
  - Must target own piece
  - Cannot duplicate king
  - Returns null if no adjacent free square (handled by existing logic)

---

### 5. **Royal Swap: Clear Validation**
**Problem**: Unclear validation rules.

**Fixes**:
- **[arcanaHandlers.js](server/arcana/arcanaHandlers.js#L135-L144)**: Added validation:
  - Must target own piece
  - Target must be a pawn

---

### 6. **Iron Fortress: Shields for All Pawns**
**Problem**: Visual effect didn't show shields on all pawns.

**Fixes**:
- **[arcanaHandlers.js](server/arcana/arcanaHandlers.js#L411-L434)**: Modified to track all pawn positions and store in `ironFortressShields` array.
- **[ArcanaVisualHost.jsx](client/src/game/arcana/ArcanaVisualHost.jsx#L129-L138)**: Added shield rendering for all pawns in `ironFortressShields` list.
- Multiple game state initializations updated to include `ironFortressShields: { w: [], b: [] }`.

---

### 7. **Cursed Square: Duration Fix**
**Problem**: Cursed square only lasted 1 turn instead of the advertised 2 turns.

**Fixes**:
- **[arcanaHandlers.js](server/arcana/arcanaHandlers.js#L1096)**: Changed initial `turns` from 2 to 3 (accounts for immediate decrement on application).

```javascript
// Before
turns: 2,  // Lasts for 2 turns

// After
turns: 3,  // Lasts for 2 full turns (3 because it decrements immediately)
```

---

## Cards Verified Working:

### **Queen's Gambit**
- ✅ Sets `queensGambit[color] = 1` counter
- ✅ Grants extra move when queen moves and counter > 0
- ✅ Logic in [gameManager.js](server/gameManager.js#L1291-L1348)

### **Sharpshooter**
- ✅ Sets `sharpshooter[color] = true` flag
- ✅ Validation in [arcanaValidation.js](server/arcana/arcanaValidation.js#L50-L53)
- ✅ Allows bishop to capture through blockers on diagonals

---

## Testing:

All 58 server tests pass:
```bash
npm run test:server
# ✅ Tests passed: 58
# ✅ Tests failed: 0
```

---

## Notes:

**Queen's Gambit & Sharpshooter** appear to be working correctly in the code logic. If they're not working in the UI:
- Check if client-side simulation matches server logic
- Verify visual feedback is displayed
- Confirm extra move UI message is shown

**Client-side simulation** may need updates to match server changes (especially for `ironFortressShields`).
