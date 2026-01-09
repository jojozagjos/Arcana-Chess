# ARCANA-CHESS: PHASE 4-5 EXECUTION ROADMAP

## Overview

This document provides a detailed roadmap for completing **Phase 4 (Full Card Audit)** and **Phase 5 (Apply Fixes)** to finish the comprehensive audit and polish of all Arcana cards.

---

## Phase 4: Full Card Audit & Fixes

### Structure

Phase 4 consists of 4 sub-phases, each focusing on a specific audit category:

1. **4A: Privacy & Redaction Audit** (6 cards)
2. **4B: Validation & Edge Case Audit** (5 cards)
3. **4C: UI & State Management Audit** (4+ cards)
4. **4D: Dev Tool & Multiplayer Parity Audit** (All cards)

---

## Phase 4A: Privacy & Redaction Audit (6 cards)

**Objective**: Ensure opponent-sensitive information is NOT emitted to other players

### Cards Requiring Privacy Checks

| Card | Issue | Fix Location | Priority |
|------|-------|--------------|----------|
| **Vision** | Owner should see opponent moves; others see nothing | `GameScene.jsx` line 199 | HIGH |
| **Line of Sight** | Owner should see legal moves; others see nothing | `GameScene.jsx` line 203 | HIGH |
| **Map Fragments** | Owner should see predicted squares; others see nothing | `GameScene.jsx` line 208 | HIGH |
| **Quiet Thought** | Owner should see threat squares; others see nothing | `GameScene.jsx` line 213 | HIGH |
| **Peek Card** | Reveal is owner-only; opponent doesn't know which card | `GameScene.jsx` line 450+ | HIGH |
| **Fog of War** | Opponent doesn't see hidden pieces (rendering issue) | `GameScene.jsx` line 709 | MEDIUM |

### Implementation Pattern

**Server-side** (`server/arcana/arcanaHandlers.js`):
```javascript
// Bad: Always emit params
socket.emit('arcanaTriggered', { arcanaId, params, ... });

// Good: Check ownership and redact
const isOwner = arcanaCard.playerId === socket.id;
const emitParams = isOwner ? params : null; // or {} for non-owner
socket.emit('arcanaTriggered', { arcanaId, params: emitParams, ... });
```

**Client-side** (`GameScene.jsx`):
```javascript
// Bad: Always show highlights
setHighlightedSquares(params?.legalMoves || []);

// Good: Only show if you own the card
const isMyCard = payload.owner === socket.id;
if (isMyCard) {
  setHighlightedSquares(params?.legalMoves || []);
}
```

### Testing Checklist

- [ ] Vision: Player A can see opponent's moves; Player B cannot
- [ ] Line of Sight: Player A can see selected piece's moves; Player B cannot
- [ ] Map Fragments: Player A can see predicted squares; Player B cannot
- [ ] Quiet Thought: Player A can see threat squares; Player B cannot
- [ ] Peek Card: Player A reveals card; Player B only sees notification "opponent peeked"
- [ ] Fog of War: Opponent's pieces hidden when fog active; shows "?" or grayed out

---

## Phase 4B: Validation & Edge Case Audit (5 cards)

**Objective**: Ensure game rules are properly enforced, especially around complex mechanics

### Cards Requiring Validation Fixes

#### 1. **Double Strike** (RARE)
**Issue**: Non-adjacent rule not enforced  
**Current**: Allows 2 captures from same piece (could be adjacent)  
**Should Be**: First capture kills piece; second capture must NOT be adjacent to first kill  
**Fix Location**: `server/gameManager.js` `handlePlayerAction()` → move validation  
**Server Code Change**:
```javascript
// In move validation for Double Strike:
const firstKillSquare = /* tracked from previous move */;
const secondMoveTarget = params.to;

if (firstKillSquare) {
  // Calculate if second target is adjacent
  const isAdjacentToFirst = Math.abs(
    'abcdefgh'.indexOf(firstKillSquare[0]) - 'abcdefgh'.indexOf(secondMoveTarget[0])
  ) <= 1 && Math.abs(
    parseInt(firstKillSquare[1]) - parseInt(secondMoveTarget[1])
  ) <= 1;
  
  if (isAdjacentToFirst) {
    return { valid: false, reason: 'Second capture cannot be adjacent to first' };
  }
}
```

**Priority**: HIGH (affects gameplay balance)

---

#### 2. **Berserker Rage** (RARE)
**Issue**: Same as Double Strike - non-adjacent rule  
**Current**: Same allow adjacent captures  
**Should Be**: Same as Double Strike (first kill → second must not be adjacent)  
**Fix Location**: `server/gameManager.js` (same pattern as Double Strike)  
**Priority**: HIGH

---

#### 3. **Temporal Echo** (RARE)
**Issue**: Pattern validation missing  
**Current**: Stores last move delta but doesn't validate if repeated move is legal  
**Should Be**: 
- Remember last move delta (e.g., e2→e4 = file: 0, rank: 2)
- Next piece moved must be able to repeat that delta
- If illegal (blocked, off-board, etc.), fail gracefully
**Fix Location**: `server/gameManager.js` move validation  
**Server Code Change**:
```javascript
// In move validation:
if (gameState.activeEffects.temporalEcho) {
  const { pattern, color } = gameState.activeEffects.temporalEcho;
  if (pattern && piece.color === color) {
    // Check if piece can move by that delta
    const targetFile = 'abcdefgh'['abcdefgh'.indexOf(fromSquare[0]) + pattern.fileDelta];
    const targetRank = parseInt(fromSquare[1]) + pattern.rankDelta;
    const targetSquare = targetFile + targetRank;
    
    // Validate targetSquare is on-board and legal
    if (!targetSquare.match(/^[a-h][1-8]$/)) {
      return { valid: false, reason: 'Echo pattern moves off-board' };
    }
    // Further validate it's a legal move for the piece...
  }
}
```

**Priority**: MEDIUM (complex edge case)

---

#### 4. **Mirror Image** (EPIC)
**Issue**: Cleanup on capture/expiration unclear  
**Current**: Stored in `gameState.activeEffects.mirrorImages[]` with `turnsLeft`  
**Should Be**: When duplicate expires OR is captured, remove from array and cleanup  
**Fix Location**: `server/gameManager.js` `decrementEffects()` and move validation  
**Server Code Change**:
```javascript
// In decrementEffects():
if (gameState.activeEffects.mirrorImages) {
  gameState.activeEffects.mirrorImages = gameState.activeEffects.mirrorImages
    .filter(img => {
      img.turnsLeft--;
      // Remove expired mirrors
      if (img.turnsLeft <= 0) {
        // Remove from board
        const board = chess.board();
        const squareIndex = boardSquareToIndex(img.square);
        board[squareIndex] = null;
        chess.load(boardToFen(board));
        return false; // Filter out
      }
      return true; // Keep
    });
}

// In move validation (capture):
// If capturing a mirror, remove from array
const capturedMirror = gameState.activeEffects.mirrorImages?.find(m => m.square === toSquare);
if (capturedMirror) {
  gameState.activeEffects.mirrorImages = 
    gameState.activeEffects.mirrorImages.filter(m => m !== capturedMirror);
}
```

**Priority**: MEDIUM (edge case, affects game state)

---

#### 5. **Chaos Theory** (EPIC)
**Issue**: Shuffle validation incomplete  
**Current**: Randomizes 3 pieces per side to different positions  
**Should Be**: 
- Validate all 3 shuffled pieces have legal destination squares
- No piece lands on same square twice
- No piece lands on occupied square
**Fix Location**: `server/arcana/arcanaHandlers.js` `applyChao sTheory()`  
**Server Code Change**:
```javascript
export function applyChaosTheory(gameState, color) {
  const chess = gameState.chess;
  const board = chess.board();
  const colorChar = color === 'white' ? 'w' : 'b';
  
  // Get all pieces of this color
  const pieces = [];
  for (let i = 0; i < 64; i++) {
    const piece = board[i];
    if (piece && piece.color === colorChar) {
      pieces.push({ piece, index: i });
    }
  }
  
  if (pieces.length < 3) {
    return { valid: false, reason: 'Not enough pieces to shuffle' };
  }
  
  // Randomly select 3 pieces
  const selectedIndices = [];
  while (selectedIndices.length < 3) {
    const idx = Math.floor(Math.random() * pieces.length);
    if (!selectedIndices.includes(idx)) selectedIndices.push(idx);
  }
  
  // Get shuffled positions
  const shuffledPositions = [...selectedIndices].sort(() => Math.random() - 0.5);
  const usedSquares = new Set();
  
  // Move pieces
  for (let i = 0; i < selectedIndices.length; i++) {
    const fromIdx = pieces[selectedIndices[i]].index;
    const toIdx = pieces[shuffledPositions[i]].index;
    
    // Validate destination is empty or contains different piece
    if (usedSquares.has(toIdx)) {
      return { valid: false, reason: 'Shuffle collision, aborting' };
    }
    
    usedSquares.add(toIdx);
    board[toIdx] = board[fromIdx];
    board[fromIdx] = null;
  }
  
  // Reconstruct FEN and validate
  const newFen = boardToFen(board);
  chess.load(newFen);
  
  return { valid: true, newFen };
}
```

**Priority**: MEDIUM (game-breaking if invalid)

---

### Testing Checklist

- [ ] Double Strike: Blocks adjacent second captures
- [ ] Berserker Rage: Blocks adjacent second captures
- [ ] Temporal Echo: Rejects off-board and blocked patterns
- [ ] Mirror Image: Removes expired duplicates
- [ ] Mirror Image: Removes captured duplicates
- [ ] Chaos Theory: Validates no collisions in shuffle
- [ ] All: Log errors clearly (not silent failures)

---

## Phase 4C: UI & State Management Audit (4+ cards)

**Objective**: Implement missing UI elements and proper state cleanup

### Cards Requiring UI/State Work

#### 1. **Arcane Cycle** (COMMON)
**Issue**: Discard dialog not implemented  
**Current**: Discards card by index but no UI  
**Should Be**: Show hand, player picks card to discard, new card drawn  
**Implementation**:
```jsx
// In GameScene.jsx, add state:
const [arcaneDiscard Dialog, setArcaneDiscardDialog] = useState(null); 
// { handCards: [...], onSelect: (index) => {} }

// In socket handler for arcane_cycle_select:
const handleArcaneDiscardSelect = (cardIndex) => {
  socket.emit('arcanaAction', {
    gameId,
    arcanaIndex,
    action: 'arcane_cycle_discard',
    params: { cardIndex },
  });
  setArcaneCycleDialog(null);
};

// Render:
{arcaneDiscardDialog && (
  <CardDiscardDialog
    cards={arcaneDiscardDialog.handCards}
    onSelect={handleArcaneDiscardSelect}
    onCancel={() => setArcaneCycleDialog(null)}
  />
)}
```

**Priority**: HIGH (blocks card usage)

---

#### 2. **Antidote** (COMMON)
**Issue**: Target selection validation incomplete  
**Current**: Accepts any piece, should only accept poisoned pieces  
**Should Be**: Only show poisoned pieces as valid targets  
**Implementation**:
```javascript
// In arcanaSimulation.js, getValidTargetSquares for Antidote:
case 'antidote': {
  if (!gameState.activeEffects.poisonedPieces) return [];
  
  // Only poisoned squares are valid targets
  return gameState.activeEffects.poisonedPieces
    .filter(p => p.color === myColor) // Only own poisoned pieces
    .map(p => p.square);
}

// Client-side validation:
const validTargets = getValidTargetSquares(gameState, 'antidote', myColor);
if (!validTargets.includes(selectedSquare)) {
  return { valid: false, reason: 'Target piece is not poisoned' };
}
```

**Priority**: HIGH (UX clarity)

---

#### 3. **Cursed Square** (RARE)
**Issue**: Array cleanup on expiration  
**Current**: Stored in `gameState.activeEffects.cursedSquares[]` but cleanup timing unclear  
**Should Be**: Decrement `turnsLeft` each turn, remove when 0  
**Implementation**:
```javascript
// In decrementEffects():
if (gameState.activeEffects.cursedSquares) {
  gameState.activeEffects.cursedSquares = gameState.activeEffects.cursedSquares
    .map(curse => ({
      ...curse,
      turnsLeft: curse.turnsLeft - 1,
    }))
    .filter(curse => curse.turnsLeft > 0); // Remove expired
}

// In move validation:
const landingCurse = gameState.activeEffects.cursedSquares?.find(
  c => c.square === toSquare && c.turnsLeft > 0
);
if (landingCurse) {
  // Piece is destroyed
  capturedPiece = moveResult.captured; // Mark as destroyed
  // Emit destruction event
}
```

**Priority**: MEDIUM (affects gameplay)

---

#### 4. **Poison** & **Sacrifice** (Various)
**Issue**: Array cleanup and animation lifecycle  
**Current**: Expires but no animation on death  
**Should Be**: When poisoned piece dies (after 3 turns), animate death + show notification  
**Implementation**:
```javascript
// In turn-end check:
const deadPoisonedPieces = gameState.activeEffects.poisonedPieces
  .filter(p => p.turnsLeft <= 0);
  
for (const piece of deadPoisonedPieces) {
  // Kill piece on board
  chess.remove(piece.square);
  
  // Emit death event for VFX
  socket.emit('arcanaTriggered', {
    arcanaId: 'poison_death',
    params: { square: piece.square },
  });
  
  // Add to captured list
  gameState.capturedByColor[piece.color] ?.push(piece);
}
```

**Priority**: MEDIUM (polish)

---

### Testing Checklist

- [ ] Arcane Cycle: Discard dialog appears and works
- [ ] Antidote: Only poisoned pieces shown as targets
- [ ] Cursed Square: Expires correctly after 2 turns
- [ ] Poison: Pieces die after 3 turns with animation
- [ ] Sacrifice: Card draw animation plays
- [ ] All: No orphaned state after cleanup
- [ ] All: Multiplayer synced correctly

---

## Phase 4D: Dev Tool & Multiplayer Parity Audit

**Objective**: Ensure Card Tester and in-game show identical behavior

### Audit Approach

For each of 43 cards:

1. **Simulate in Card Tester** (CardBalancingToolV2.jsx)
   - Apply card, check effect applies
   - Check board state updates correctly
   - Check UI shows effect correctly

2. **Use in real game** (multiplayer)
   - Both players apply same card (if allowed)
   - Verify same state result
   - Verify visual effects same
   - Verify sound effects same

3. **Compare results**
   - State must be identical
   - UI presentation must be identical
   - Timing must be identical (or very close)

### Parity Checklist Template

```markdown
## Card: [Name]

### Card Tester
- [ ] Applies without error
- [ ] Board updates correctly
- [ ] UI shows effect
- [ ] Targeting works
- [ ] Targeting validations work

### In-Game
- [ ] Applies without error
- [ ] Board updates correctly
- [ ] UI shows effect
- [ ] Both players see same state
- [ ] Sound effects work (or mocked)

### Multiplayer
- [ ] State identical after apply
- [ ] Visual timing identical
- [ ] Opponent sees correct outcome
- [ ] Cleanup doesn't leak state
```

### High-Risk Cards for Parity

- **Execution**: Card Tester doesn't have camera; should still remove piece
- **Time Freeze**: Card Tester can't skip turns; should show monochrome overlay
- **Time Travel**: Card Tester should reverse moves; in-game must sync FEN
- **Mind Control**: Piece color change must be visible in both
- **Fog of War**: Card Tester needs piece hiding logic

### Testing Process

**For each card**:
1. Read card definition in `arcanaDefinitions.js`
2. Check handler in `arcanaHandlers.js`
3. Check simulation in `arcanaSimulation.js`
4. Check visuals in `arcanaVisuals.jsx`
5. Test in Card Tester
6. Test in multiplayer game
7. Document any differences

---

## Phase 5: Apply Fixes in Safe Batches

### Batch Strategy

Fixes are applied in 5 batches, each targeting specific systems:

### Batch 1: Server Validation & State (Week 1)

**Fixes applied**:
- Double Strike non-adjacent rule
- Berserker Rage non-adjacent rule
- Temporal Echo pattern validation
- Mirror Image expiration cleanup
- Chaos Theory collision validation

**Testing**:
- Single-player game (bot)
- Verify edge cases handled
- Check error messages clear

**Deployment Risk**: LOW (mostly edge case fixes)

---

### Batch 2: Privacy & Redaction (Week 1)

**Fixes applied**:
- Vision ownership checks (server)
- Line of Sight ownership checks
- Map Fragments ownership checks
- Quiet Thought ownership checks
- Peek Card reveal redaction

**Testing**:
- Two-player game
- Player A uses utility card
- Verify Player B doesn't see hidden info
- Check highlights only shown to owner

**Deployment Risk**: LOW (filtering only, no logic changes)

---

### Batch 3: UI & State Management (Week 2)

**Fixes applied**:
- Arcane Cycle discard dialog
- Antidote target validation
- Cursed Square expiration
- Poison death animation
- Sacrifice draw animation

**Testing**:
- Single-player game
- Test all UI interactions
- Verify state cleanup
- Check animations smooth

**Deployment Risk**: MEDIUM (UI changes, needs UX testing)

---

### Batch 4: Dev Tool Parity (Week 2)

**Fixes applied**:
- Card Tester simulation parity
- All cards work in dev tool
- State identical in both environments
- Visuals consistent (or noted differences)

**Testing**:
- Test each card in Card Tester
- Compare with in-game behavior
- Document any acceptable differences

**Deployment Risk**: LOW (dev tool only, no gameplay impact)

---

### Batch 5: Final Polish & Testing (Week 3)

**Fixes applied**:
- Any remaining edge cases
- Performance optimizations
- Error message improvements
- Documentation updates

**Testing**:
- Full multiplayer testing (4+ games)
- Stress test rapid cutscenes
- Test network disconnection recovery
- Final audit of state management

**Deployment Risk**: VERY LOW (polish only)

---

## Success Metrics

### Phase 4 Complete When:
- ✅ All 43 cards in trace map audited
- ✅ 6 privacy/redaction issues fixed
- ✅ 5 validation edge cases handled
- ✅ 4+ UI gaps filled
- ✅ All cards work identically in Card Tester and in-game
- ✅ No console errors in dev tools
- ✅ Multiplayer state fully synced

### Phase 5 Complete When:
- ✅ All batches applied without regression
- ✅ 10+ multiplayer games completed successfully
- ✅ No new bugs introduced
- ✅ Performance acceptable (60 FPS cutscenes)
- ✅ All edge cases handled gracefully
- ✅ Documentation updated
- ✅ Ready for player testing

---

## Estimated Timeline

- **Phase 4A** (Privacy): 1-2 days
- **Phase 4B** (Validation): 2-3 days
- **Phase 4C** (UI/State): 2-3 days
- **Phase 4D** (Parity): 3-4 days
- **Phase 4 Total**: ~1 week

- **Phase 5A-B** (Batch 1-2): 2-3 days
- **Phase 5C-D** (Batch 3-4): 2-3 days
- **Phase 5E** (Batch 5): 1-2 days
- **Phase 5 Total**: ~1 week

**Grand Total**: ~2 weeks to complete comprehensive audit and polish

---

## Conclusion

This roadmap provides clear, actionable steps to complete the comprehensive audit of Arcana Chess. Each phase builds on previous work and has clear success criteria. By following this plan, all 43 cards will be fully audited, validated, and polished for production.

**Ready to begin Phase 4A**? Start with privacy checks on 6 utility cards.
