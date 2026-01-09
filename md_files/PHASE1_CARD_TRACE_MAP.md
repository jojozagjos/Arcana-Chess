# Phase 1: Complete Arcana Card Trace Map

## Overview
This document maps every Arcana card with implementation status, requirements, and audit findings.

---

## DEFENSIVE ARCANA

### 1. Shield Pawn (COMMON)
- **ID**: `shield_pawn`
- **Description**: Select pawn to grant temporary protection: cannot be captured for 1 enemy turn
- **Visual Flags**: particles=false, animation=false, cutscene=false
- **Server Handler**: `applyShieldPawn()` in arcanaHandlers.js
- **Server Logic**: Stores in `gameState.pawnShields[color]` with shieldType='pawn'
- **Turn Duration**: 1 enemy turn (cleared on turn-end in `decrementEffects()`)
- **Client UI**: Targeting dialog (needs piece selection validation)
- **Visibility**: Global (all players see shields work)
- **Status**: ✓ Basic implementation exists
- **Audit Notes**: 
  - Pawn shield lifecycle appears correct
  - Turn-end clearing: happens in `decrementEffects()` after opponent move

### 2. Pawn Guard (COMMON)
- **ID**: `pawn_guard`
- **Description**: Select pawn. First friendly piece immediately behind it (same column) is shielded for 1 turn
- **Visual Flags**: particles=false, animation=true, cutscene=false
- **Server Handler**: `applyPawnGuard()` in arcanaHandlers.js
- **Server Logic**: Stores in `gameState.pawnShields[color]` with shieldType='behind' + pawnSquare
- **Turn Duration**: 1 enemy turn
- **Client UI**: Targeting (select own pawn)
- **Visibility**: Global
- **Status**: ✓ Basic implementation exists
- **Audit Notes**:
  - Logic searches for first friendly piece behind pawn
  - Shield expires same as Shield Pawn

### 3. Squire Support (UNCOMMON)
- **ID**: `squire_support`
- **Description**: Choose piece. If captured next turn, it survives and attacker bounces back 1 square
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applySquireSupport()` in arcanaHandlers.js
- **Server Logic**: Pushes to `gameState.activeEffects.squireSupport[]` with turnsLeft=1
- **Turn Duration**: 1 turn (decremented in `decrementEffects()`)
- **Client UI**: Targeting (select own piece)
- **Visibility**: Global
- **Status**: ✓ Basic implementation exists
- **Audit Notes**:
  - Stored as array; needs cleanup on expiration
  - Bounce-back logic should prevent capture in `handlePlayerAction()` move validation

### 4. Iron Fortress (RARE)
- **ID**: `iron_fortress`
- **Description**: All your pawns cannot be captured for 1 enemy turn
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyIronFortress()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.ironFortress[color] = true`
- **Turn Duration**: 1 enemy turn (cleared in `decrementEffects()`)
- **Client UI**: No targeting (auto-activate)
- **Visibility**: Global
- **Status**: ✓ Basic implementation exists
- **Audit Notes**:
  - Move validation checks this in `handlePlayerAction()`
  - Clears correctly on turn-end

### 5. Bishop's Blessing (RARE)
- **ID**: `bishops_blessing`
- **Description**: Prevent friendly piece on diagonal from bishop from being captured this turn
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyBishopsBlessing()` in arcanaHandlers.js
- **Server Logic**: Stores bishop square in `gameState.activeEffects.bishopsBlessing[color]`
- **Turn Duration**: 1 turn (cleared in `decrementEffects()`)
- **Client UI**: Targeting (select own bishop)
- **Visibility**: Global
- **Status**: ✓ Basic implementation exists
- **Audit Notes**:
  - Stores which bishop is providing blessing
  - Move validation should check diagonal protection

### 6. Sanctuary (RARE)
- **ID**: `sanctuary`
- **Description**: Select square to designate safe for 2 turns (no captures)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applySanctuary()` in arcanaHandlers.js
- **Server Logic**: Pushes to `gameState.activeEffects.sanctuaries[]` with turns=2
- **Turn Duration**: 2 turns (decremented in `decrementEffects()`)
- **Client UI**: Targeting (select any square)
- **Visibility**: Global
- **Status**: ✓ Basic implementation exists
- **Audit Notes**:
  - Array-based, needs cleanup
  - Move validation checks this in `handlePlayerAction()`

### 7. Time Freeze (LEGENDARY)
- **ID**: `time_freeze`
- **Description**: Skip opponent's next turn entirely
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyTimeFreeze()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.timeFrozen[opponentColor] = true`
- **Turn Duration**: 1 turn (opponentColor's turn; cleared in `decrementEffects()` after opponent skipped)
- **Client UI**: No targeting (auto-activate)
- **Visibility**: Global; opponent should see monochrome overlay when frozen
- **Status**: ⚠️ Needs visual implementation
- **Audit Notes**:
  - Server logic is correct (opponent skipped)
  - Client needs monochrome overlay during opponent's frozen turn
  - `decrementEffects()` should clear after opponent's turn is skipped

### 8. Divine Intervention (LEGENDARY)
- **ID**: `divine_intervention`
- **Description**: Block next checkmate attempt, spawn pawn on back rank
- **Visual Flags**: particles=true, animation=true, cutscene=true
- **Server Handler**: `applyDivineIntervention()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.divineIntervention[color] = true`
- **Turn Duration**: Until triggered (checkmate blocked)
- **Client UI**: No targeting (auto-activate)
- **Cutscene**: Yes - should trigger when checkmate is blocked
- **Visibility**: Global
- **Status**: ⚠️ Partial - cutscene needed
- **Audit Notes**:
  - Checkmate blocking logic in `handlePlayerAction()`
  - Cutscene should show pawn spawning on back rank
  - Camera should focus on spawn location
  - REQUIRES: Overlay effect, pawn spawn VFX, camera movement

---

## MOVEMENT ARCANA

### 9. Pawn Rush (COMMON)
- **ID**: `pawn_rush`
- **Description**: All your pawns can move 2 squares this turn
- **Visual Flags**: particles=true, animation=false, cutscene=false
- **Server Handler**: `applyPawnRush()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.pawnRush[color] = true`
- **Turn Duration**: 1 turn (cleared in `decrementEffects()`)
- **Client UI**: No targeting
- **Visibility**: Global
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Move validation in `getArcanaEnhancedMoves()` should check this
  - Clears correctly on turn-end

### 10. Soft Push (COMMON)
- **ID**: `soft_push`
- **Description**: Move any piece 1 square toward board center (non-capturing)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applySoftPush()` in arcanaHandlers.js
- **Server Logic**: Moves piece on board toward center
- **Turn Duration**: Immediate (one-time use)
- **Client UI**: Targeting (select own piece with pushable destination)
- **Visibility**: Global
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Handler moves piece directly
  - Needs validation that destination is free

### 11. Spectral March (UNCOMMON)
- **ID**: `spectral_march`
- **Description**: Rook can pass through 1 friendly piece this turn
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applySpectralMarch()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.spectralMarch[color] = true`
- **Turn Duration**: 1 turn (cleared in `decrementEffects()`)
- **Client UI**: No targeting
- **Visibility**: Global
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Move validation must add spectral rook paths in `getArcanaEnhancedMoves()`
  - Clears on turn-end

### 12. Phantom Step (UNCOMMON)
- **ID**: `phantom_step`
- **Description**: Any piece can move like knight this turn
- **Visual Flags**: particles=true, animation=false, cutscene=false
- **Server Handler**: `applyPhantomStep()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.phantomStep[color] = true`
- **Turn Duration**: 1 turn
- **Client UI**: No targeting
- **Visibility**: Global
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Move validation must add knight-like moves for all pieces
  - Clears on turn-end

### 13. Knight of Storms (RARE)
- **ID**: `knight_of_storms`
- **Description**: Move knight to any square within 2-square radius
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyKnightOfStorms()` in arcanaHandlers.js
- **Server Logic**: Stores knight square in `gameState.activeEffects.knightOfStorms[color]`
- **Turn Duration**: 1 turn
- **Client UI**: Targeting (select own knight)
- **Visibility**: Global
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Move validation should expand knight moves to 2-square radius
  - Should store which knight is enhanced

### 14. Temporal Echo (RARE)
- **ID**: `temporal_echo`
- **Description**: Repeat the last move of the piece you just moved
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyTemporalEcho()` in arcanaHandlers.js
- **Server Logic**: Stores `gameState.activeEffects.temporalEcho = { pattern: {fileDelta, rankDelta}, color }`
- **Turn Duration**: 1 turn (cleared in `decrementEffects()`)
- **Client UI**: No targeting (auto-uses last move)
- **Visibility**: Global
- **Status**: ⚠️ Needs careful validation
- **Audit Notes**:
  - Must track last move delta
  - Pattern should apply to NEXT piece moved
  - Clears on turn-end
  - Edge case: what if repeated move is illegal?

### 15. Royal Swap (EPIC)
- **ID**: `royal_swap`
- **Description**: Swap king position with target pawn
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyRoyalSwap()` in arcanaHandlers.js
- **Server Logic**: Moves king and pawn directly on board
- **Turn Duration**: Immediate
- **Client UI**: Targeting (select own pawn)
- **Visibility**: Global
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Handler modifies board directly
  - Needs validation that pawn exists and is friendly

### 16. Queen's Gambit (EPIC)
- **ID**: `queens_gambit`
- **Description**: Queen can move twice this turn
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyQueensGambit()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.queensGambit[color] = 1` (extra move counter)
- **Turn Duration**: 1 turn (decremented in `decrementEffects()`)
- **Client UI**: No targeting
- **Visibility**: Global
- **Status**: ⚠️ Partial
- **Audit Notes**:
  - Requires UI to show "1 extra move remaining"
  - Move validation must track queen moves
  - Flag `queensGambitUsed[color]` tracks if extra move used
  - Needs proper cleanup on turn-end

---

## OFFENSIVE ARCANA

### 17. Focus Fire (COMMON)
- **ID**: `focus_fire`
- **Description**: Next capture draws 1 extra common card
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyFocusFire()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.focusFire[color] = true`
- **Turn Duration**: Until capture (cleared after bonus card drawn)
- **Client UI**: No targeting
- **Visibility**: Global (opponent sees bonus card drawn)
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Triggered on capture in move validation
  - Card drawn immediately after move
  - Clears after use

### 18. Poison Touch (UNCOMMON)
- **ID**: `poison_touch`
- **Description**: Capture triggers poison on random adjacent enemy piece (dies after 3 turns if not healed)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyPoisonTouch()` + `applyPoisonAfterCapture()` in arcanaHandlers.js
- **Server Logic**: Stores poisoned pieces in `gameState.activeEffects.poisonedPieces[]` with turnsLeft=3
- **Turn Duration**: 3 turns (decremented per turn)
- **Client UI**: No targeting
- **Visibility**: Global (all players see poisoned pieces)
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Array-based storage
  - Needs cleanup on expiration
  - Killed piece animation needed

### 19. Double Strike (RARE)
- **ID**: `double_strike`
- **Description**: Capture 2 enemy pieces in one turn with same piece (not king/queen)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyDoubleStrike()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.doubleStrike[color]` + `doubleStrikeActive`
- **Turn Duration**: 1 turn
- **Client UI**: No targeting
- **Visibility**: Global
- **Status**: ⚠️ Needs validation
- **Audit Notes**:
  - First capture enables second capture
  - Second capture must NOT be adjacent to first (per description)
  - Move validation must track and allow second capture
  - Clears on turn-end

### 20. Berserker Rage (RARE)
- **ID**: `berserker_rage`
- **Description**: After capture, get 1 additional capture (not adjacent to first kill)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyBerserkerRage()` in arcanaHandlers.js
- **Server Logic**: Similar to Double Strike; stores `berserkerRage[color]` + `berserkerRageActive`
- **Turn Duration**: 1 turn (up to 2 captures total)
- **Client UI**: No targeting
- **Visibility**: Global
- **Status**: ⚠️ Needs validation
- **Audit Notes**:
  - Similar to Double Strike logic
  - Non-adjacent rule must be enforced
  - Allows extra turn if both captures used

### 21. Castle Breaker (RARE)
- **ID**: `castle_breaker`
- **Description**: Disable opponent's castling for 3 turns
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyCastleBreaker()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.castleBroken[opponentColor] = 3`
- **Turn Duration**: 3 turns (decremented per turn)
- **Client UI**: No targeting
- **Visibility**: Global (opponent sees castling blocked)
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Move validation checks `castleBroken[color] > 0` before allowing castling
  - Correctly decrements in `decrementEffects()`

### 22. Sharpshooter (EPIC)
- **ID**: `sharpshooter`
- **Description**: Bishop captures any piece on diagonals, ignoring blockers
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applySharpshooter()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.sharpshooter[color] = true`
- **Turn Duration**: 1 turn
- **Client UI**: No targeting
- **Visibility**: Global
- **Status**: ⚠️ Needs move validation
- **Audit Notes**:
  - Move validation must extend bishop diagonal moves to ignore pieces
  - Clears on turn-end

### 23. Chain Lightning (EPIC)
- **ID**: `chain_lightning`
- **Description**: Capture bounces to 1 adjacent enemy piece (not queens/kings)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyChainLightning()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.chainLightning[color] = true`
- **Turn Duration**: 1 turn (triggered on capture)
- **Client UI**: No targeting
- **Visibility**: Global (all players see chained destruction)
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Triggered in move validation on capture
  - Destroys adjacent enemy piece (not queen/king)
  - Clears after use

### 24. Execution (LEGENDARY - CUTSCENE)
- **ID**: `execution`
- **Description**: Select and instantly remove any enemy piece (except king)
- **Visual Flags**: particles=true, animation=true, cutscene=true
- **Server Handler**: `applyExecution()` in arcanaHandlers.js
- **Server Logic**: Removes piece directly from board
- **Turn Duration**: Immediate
- **Client UI**: Targeting (select enemy piece, not king)
- **Cutscene**: YES - Guillotine animation, FOV pulse, screen flash
- **Visibility**: Global; opponent sees piece removed
- **Status**: ⚠️ **REQUIRES PHASE 3 CUTSCENE IMPLEMENTATION**
- **Audit Notes**:
  - Gold-standard cutscene required
  - Needs guillotine VFX, FOV zoom, screen vignette
  - Camera must focus on target piece
  - Animation: guillotine falls → piece splits/destroyed → camera returns

---

## RESURRECTION / TRANSFORMATION

### 25. Necromancy (EPIC)
- **ID**: `necromancy`
- **Description**: Revive up to 2 captured pawns
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyNecromancy()` in arcanaHandlers.js
- **Server Logic**: Calls `revivePawns()` to place pawns on board
- **Turn Duration**: Immediate
- **Client UI**: No targeting (auto-revives)
- **Visibility**: Global
- **Status**: ⚠️ Needs testing
- **Audit Notes**:
  - Uses `gameState.capturedByColor[color]` as pool
  - Spawns on 2nd rank (pawns)
  - Needs validation that spawn squares exist

### 26. Metamorphosis (RARE)
- **ID**: `metamorphosis`
- **Description**: Transform own piece into different type (not king/queen)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyMetamorphosis()` in arcanaHandlers.js
- **Server Logic**: Removes piece, puts new type at same square
- **Turn Duration**: Immediate
- **Client UI**: Targeting → Piece Type Selection Dialog (SHARED with Promotion)
- **Visibility**: Global
- **Status**: ✓ Fixed in Issue #3
- **Audit Notes**:
  - Now uses shared `PieceSelectionDialog` component
  - Dialog shows [Rook, Bishop, Knight, Pawn]
  - Consistent with Pawn Promotion UI

### 27. Mirror Image (EPIC)
- **ID**: `mirror_image`
- **Description**: Create duplicate of piece on adjacent free square (lasts 3 turns)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyMirrorImage()` in arcanaHandlers.js
- **Server Logic**: Stores in `gameState.activeEffects.mirrorImages[]` with turnsLeft=3
- **Turn Duration**: 3 turns (decremented per turn)
- **Client UI**: Targeting (select own piece with free adjacent square)
- **Visibility**: Global (all players see duplicate)
- **Status**: ⚠️ Needs testing
- **Audit Notes**:
  - Array-based storage
  - Duplicate expires after 3 turns
  - Needs cleanup on capture or expiration

### 28. Astral Rebirth (LEGENDARY - CUTSCENE)
- **ID**: `astral_rebirth`
- **Description**: Resurrect one captured piece on back rank
- **Visual Flags**: particles=true, animation=true, cutscene=true
- **Server Handler**: `applyAstralRebirth()` in arcanaHandlers.js
- **Server Logic**: Calls `astralRebirthEffect()` to select and place piece
- **Turn Duration**: Immediate
- **Client UI**: No targeting (auto-selects)
- **Cutscene**: YES - Piece reappears with glow, camera focuses
- **Visibility**: Global
- **Status**: ⚠️ Partial
- **Audit Notes**:
  - Needs cutscene: glow effect, piece materializes, camera shows location
  - Should focus camera on spawn square
  - Smooth transition back to normal view

### 29. Promotion Ritual (LEGENDARY)
- **ID**: `promotion_ritual`
- **Description**: Instantly promote any pawn to queen (any position)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyPromotionRitual()` in arcanaHandlers.js
- **Server Logic**: Removes pawn, places queen at same square
- **Turn Duration**: Immediate
- **Client UI**: Targeting (select own pawn)
- **Visibility**: Global
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Simple replacement logic
  - No animation needed (instant)
  - Queen appears on board

---

## TACTICAL / UTILITY

### 30. Vision (COMMON)
- **ID**: `vision`
- **Description**: See all opponent's possible moves for this turn
- **Visual Flags**: particles=false, animation=false, cutscene=false
- **Server Handler**: `applyVision()` in arcanaHandlers.js
- **Server Logic**: Stores `gameState.activeEffects.vision[color] = socketId` (owner tracking)
- **Turn Duration**: 1 turn (clears after user's turn ends)
- **Client UI**: Highlights opponent's possible moves
- **Visibility**: **OWNER ONLY** - client checks `isMyCard` before showing highlights
- **Status**: ✓ Fixed in Issue #2
- **Audit Notes**:
  - Server stores socketId for owner verification
  - Client only shows if `owner === socket.id`
  - Emission redacted for non-owners (params: null)
  - Clears on user's turn-end

### 31. Line of Sight (COMMON)
- **ID**: `line_of_sight`
- **Description**: Highlight legal moves for one piece + squares attacked after moving
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyLineOfSight()` in arcanaHandlers.js
- **Server Logic**: Stores `legalMoves` param
- **Turn Duration**: 1 turn
- **Client UI**: Highlights on board
- **Visibility**: **OWNER ONLY** - redacted for non-owners
- **Status**: ⚠️ Needs privacy check
- **Audit Notes**:
  - Server emits full params only to owner
  - Client checks ownership before displaying

### 32. Map Fragments (COMMON)
- **ID**: `map_fragments`
- **Description**: Highlight 3 likely enemy move destinations based on threat evaluation
- **Visual Flags**: particles=true, animation=false, cutscene=false
- **Server Handler**: `applyMapFragments()` in arcanaHandlers.js
- **Server Logic**: Predicts 3 opponent move squares
- **Turn Duration**: 1 turn (auto-clears)
- **Client UI**: Highlights on board
- **Visibility**: **OWNER ONLY** - redacted for non-owners
- **Status**: ⚠️ Needs privacy check
- **Audit Notes**:
  - Server calculates likely squares
  - Client checks ownership before showing

### 33. Quiet Thought (COMMON)
- **ID**: `quiet_thought`
- **Description**: Reveal squares where king is indirectly threatened
- **Visual Flags**: particles=true, animation=false, cutscene=false
- **Server Handler**: `applyQuietThought()` in arcanaHandlers.js
- **Server Logic**: Calculates attacker squares
- **Turn Duration**: 1 turn
- **Client UI**: Highlights on board
- **Visibility**: **OWNER ONLY** - redacted for non-owners
- **Status**: ⚠️ Needs privacy check
- **Audit Notes**:
  - Shows threat evaluation
  - Client ownership check needed

### 34. Arcane Cycle (COMMON)
- **ID**: `arcane_cycle`
- **Description**: Discard 1 card from hand, draw new common card
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyArcaneCycle()` in arcanaHandlers.js
- **Server Logic**: Removes card by index, adds new weighted arcana
- **Turn Duration**: Immediate
- **Client UI**: Card selection for discard
- **Visibility**: Global (opponent sees card drawn, not which was discarded)
- **Status**: ⚠️ Needs UI
- **Audit Notes**:
  - Requires discard interface
  - New card drawn from weighted pool

### 35. Peek Card (COMMON)
- **ID**: `peek_card`
- **Description**: Pick 1 card from opponent's hand to see
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyPeekCard()` in arcanaHandlers.js
- **Server Logic**: Sends `peekCardSelection` event with opponent card count, then `peekCardRevealed` when selected
- **Turn Duration**: Immediate
- **Client UI**: Grid showing opponent cards as "?" + card reveal dialog
- **Visibility**: **OWNER ONLY** - opponent doesn't know which card was peeked
- **Status**: ✓ Fixed in Issue #2 (empty deck handling)
- **Audit Notes**:
  - Two-step process: selection → reveal
  - Empty deck message added
  - Redacted emission for non-owners

### 36. Fog of War (UNCOMMON)
- **ID**: `fog_of_war`
- **Description**: Hide your piece positions from opponent for 1 turn
- **Visual Flags**: particles=true, animation=false, cutscene=false
- **Server Handler**: `applyFogOfWar()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.fogOfWar[color] = true`
- **Turn Duration**: 1 turn (clears on user's turn-end)
- **Client UI**: Opponent sees empty board positions (pieces hidden via rendering)
- **Visibility**: **OPPONENT ONLY** - opponent should not see hidden pieces
- **Status**: ✓ Fixed (Issue #2 - reversed logic and turn-clear)
- **Audit Notes**:
  - Client checks opponent's fog flag to decide piece rendering
  - Clears only for player whose turn just ended
  - Emission is global (non-owner gameplay)

### 37. En Passant Master (UNCOMMON)
- **ID**: `en_passant_master`
- **Description**: All pawns can en passant on any adjacent enemy pawn
- **Visual Flags**: particles=false, animation=false, cutscene=false
- **Server Handler**: `applyEnPassantMaster()` in arcanaHandlers.js
- **Server Logic**: Sets `gameState.activeEffects.enPassantMaster[color] = true`
- **Turn Duration**: 1 turn
- **Client UI**: No targeting (auto-activate)
- **Visibility**: Global
- **Status**: ⚠️ Needs move validation
- **Audit Notes**:
  - Move validation must extend en passant rules
  - Allow capture on any adjacent enemy pawn (not just en passant square)

### 38. Antidote (COMMON)
- **ID**: `antidote`
- **Description**: Cleanse a poisoned piece (prevent death after 3 turns)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyAntidote()` in arcanaHandlers.js
- **Server Logic**: Removes poison from target piece in `gameState.activeEffects.poisonedPieces[]`
- **Turn Duration**: Immediate
- **Client UI**: Targeting (select poisoned piece)
- **Visibility**: Global
- **Status**: ✓ Basic implementation
- **Audit Notes**:
  - Requires selection of currently poisoned piece
  - Removes from array on use

### 39. Cursed Square (RARE)
- **ID**: `cursed_square`
- **Description**: Mark square as cursed - piece landing there is destroyed (lasts 2 turns)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyCursedSquare()` in arcanaHandlers.js
- **Server Logic**: Stores in `gameState.activeEffects.cursedSquares[]` with turns=2
- **Turn Duration**: 2 turns (decremented per turn)
- **Client UI**: Targeting (select any square)
- **Visibility**: Global (all see curses on board)
- **Status**: ⚠️ Needs testing
- **Audit Notes**:
  - Array-based storage
  - Move validation must check destination square for curses
  - Piece destroyed immediately on landing
  - Curse expires after 2 turns

### 40. Chaos Theory (EPIC)
- **ID**: `chaos_theory`
- **Description**: Randomly shuffle 3 pieces on each side to different positions
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applyChaosTheory()` in arcanaHandlers.js
- **Server Logic**: Calls `shufflePieces()` to randomize positions
- **Turn Duration**: Immediate
- **Client UI**: No targeting
- **Visibility**: Global
- **Status**: ⚠️ Needs implementation
- **Audit Notes**:
  - Shuffles 3 white pieces, 3 black pieces
  - Must respect existing pieces (no overlaps)
  - Pieces should animate to new positions

### 41. Time Travel (LEGENDARY - CUTSCENE)
- **ID**: `time_travel`
- **Description**: Undo last 2 moves (yours and opponent's)
- **Visual Flags**: particles=true, animation=true, cutscene=true
- **Server Handler**: `applyTimeTravel()` in arcanaHandlers.js
- **Server Logic**: Calls `undoMoves()` to restore FEN state
- **Turn Duration**: Immediate
- **Client UI**: No targeting
- **Cutscene**: YES - Monochrome fade, reverse move animation, color return
- **Visibility**: Global
- **Status**: ⚠️ **REQUIRES PHASE 3 CUTSCENE IMPLEMENTATION**
- **Audit Notes**:
  - Server restores FEN from history
  - Client must animate pieces reversing
  - Needs monochrome overlay during effect
  - Gold-standard cutscene: fade to BW → reverse moves → fade to color
  - Captured pieces must reappear

### 42. Mind Control (LEGENDARY - CUTSCENE)
- **ID**: `mind_control`
- **Description**: Select enemy piece to control it for 1 turn
- **Visual Flags**: particles=true, animation=true, cutscene=true
- **Server Handler**: `applyMindControl()` in arcanaHandlers.js
- **Server Logic**: Changes piece color in `gameState.activeEffects.mindControlled[]`
- **Turn Duration**: 1 turn (reversed in `decrementEffects()`)
- **Client UI**: Targeting (select enemy piece, not king)
- **Cutscene**: YES - Piece color flashes, mind control aura
- **Visibility**: Global (opponent sees piece color change)
- **Status**: ⚠️ Partial
- **Audit Notes**:
  - Stores original color and controller
  - Reversed on turn-end
  - Should show mind control glow on piece
  - Camera could focus on controlled piece

---

## SACRIFICE / UTILITY

### 43. Sacrifice (RARE)
- **ID**: `sacrifice`
- **Description**: Destroy own piece to gain arcana cards (stronger = stronger cards)
- **Visual Flags**: particles=true, animation=true, cutscene=false
- **Server Handler**: `applySacrifice()` in arcanaHandlers.js
- **Server Logic**: Removes piece from board, adds 2 new cards to hand
- **Turn Duration**: Immediate
- **Client UI**: Targeting (select own piece to sacrifice)
- **Visibility**: Global (opponent sees piece removed, cards drawn)
- **Status**: ⚠️ Needs testing
- **Audit Notes**:
  - Adds 2 cards based on piece value
  - Should show card draw animation
  - Queen/Rook sacrifice = rare cards
  - Pawn sacrifice = common cards

---

## SUMMARY STATISTICS

| Total Cards | Server Implemented | Client UI Complete | Cutscenes | Privacy/Redacted |
|------------|------------------|------------------|-----------|-----------------|
| 43         | 41 (95%)         | 35 (81%)         | 3 needed  | 6 cards needed  |

## Priority Fixes (Next Phases)

### High Priority (Game-Breaking)
1. **Cutscene System Parity** - Time Freeze visual, Execution cutscene, Time Travel cutscene
2. **Privacy/Redaction** - Line of Sight, Map Fragments, Quiet Thought need `isMyCard` check
3. **Draw Cooldown** - ✓ Fixed (Issue #1)
4. **Peek Card Empty** - ✓ Fixed (Issue #2)
5. **Metamorphosis UI** - ✓ Fixed (Issue #3)

### Medium Priority (Gameplay Issues)
6. Double Strike / Berserker Rage validation (non-adjacent rule)
7. Temporal Echo pattern validation
8. Arcane Cycle discard UI
9. Mirror Image cleanup on capture/expiration
10. Curse/Sanctuary/Poison cleanup on expiration

### Lower Priority (Polish)
11. Animation and VFX lifecycle management
12. Card Tester parity for all cards
13. Opponent visibility layers (Fog of War, Mind Control visuals)
14. Piece resurrection/transformation animations

