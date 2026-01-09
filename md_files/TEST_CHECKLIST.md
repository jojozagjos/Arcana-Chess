# ARCANA CHESS - POST-CLEANUP TEST CHECKLIST

**Status**: Ready for testing  
**Changes**: Phases 1-3 complete (1 critical bug, 3 memory leaks, 4 duplicates fixed)

---

## **CRITICAL TESTS (Must Pass)**

### **1. Game Stability**
- [ ] Start AI game (Classic mode)
  - [ ] No crashes on turn 1
  - [ ] No crashes after 5+ turns
  - [ ] Turn transitions smooth (no delays or freezes)
  
- [ ] Start AI game (Ascendant mode)
  - [ ] Ascension triggers correctly
  - [ ] First card draw works
  - [ ] Cooldown enforced (can't draw 2 cards immediately)
  - [ ] Multiple turns with arcana effects work

### **2. ReferenceError Fix Verification**
- [ ] Play game with Fog of War card
  - [ ] Use Fog of War on your turn
  - [ ] Opponent's turn completes (no crash)
  - [ ] Effect clears properly after turn ends
  
- [ ] Play game with Vision card
  - [ ] Use Vision card
  - [ ] Turn ends without crash
  - [ ] Vision effect clears correctly

### **3. Memory Leak Fix Verification**
- [ ] Open intro screen
  - [ ] Click "Continue" normally → no console warnings
  - [ ] Refresh page during fade → no console warnings
  
- [ ] Play multiplayer game
  - [ ] Return to menu mid-game → no console warnings
  - [ ] Check browser DevTools Console - no "setState on unmounted component" errors
  
- [ ] Draw arcana cards
  - [ ] Opponent draws card → notification shows → auto-dismisses (2 sec)
  - [ ] Navigate to menu before 2 seconds pass → no console warnings

### **4. Socket Validation Fix Verification**
- [ ] Try to perform invalid actions:
  - [ ] Can't send move + arcana simultaneously (server rejects)
  - [ ] Normal moves still work
  - [ ] Normal arcana use still works
  - [ ] Draw card still works
  - [ ] Check server console - validation errors logged if malformed payload

### **5. Deduplication Verification**
- [ ] Adjacent square calculations work:
  - [ ] Berserker Rage card (checks adjacent squares for captures)
  - [ ] Knight of Storms card (targets adjacent squares)
  - [ ] All effects using getAdjacentSquares() function correctly
  
- [ ] Camera cutscenes work:
  - [ ] Use Execution card → camera zooms to target square
  - [ ] Use Divine Intervention → cutscene plays
  - [ ] Use Time Travel → dual overlay effects play
  - [ ] Only one CameraCutscene implementation active

---

## **EXTENDED TESTS (Optional)**

### **6. Card Balancing Tool**
- [ ] Access dev endpoint: `POST /api/test-card`
  - [ ] Send test card effect → receives response
  - [ ] `getAllPiecesFromChess()` still works
  - [ ] `applyTestCardEffect()` still works

### **7. Multiplayer Stress Test**
- [ ] Create lobby
- [ ] Player 2 joins
- [ ] Play full game (20+ moves)
- [ ] Use 5+ different arcana cards
- [ ] Verify no crashes, no memory leaks, smooth gameplay

### **8. Visual Effects**
- [ ] All arcana visual effects render correctly:
  - [ ] Execution (lightning effect)
  - [ ] Divine Intervention (holy light)
  - [ ] Time Travel (blue + purple overlays)
  - [ ] Cutscene overlays play without glitches
  - [ ] Particle systems render correctly

---

## **ACCEPTANCE CRITERIA**

✅ **Pass Criteria**:
- All Critical Tests (1-5) pass
- No console errors or warnings
- No crashes during gameplay
- All arcana effects work as expected
- Memory usage stable (no leaks)

❌ **Fail Criteria**:
- Any ReferenceError in console
- Game crashes during turn transitions
- Console warnings about setState on unmounted component
- Invalid socket payloads accepted by server
- Duplicate files still present

---

## **TEST RESULTS**

### **Pre-Deployment Checklist**:
- [ ] All critical tests passed
- [ ] No errors in browser console
- [ ] No errors in server logs
- [ ] Memory profiling clean (no leaks)
- [ ] Code review complete
- [ ] Documentation updated

**Tested By**: _________________  
**Date**: _________________  
**Result**: ☐ PASS ☐ FAIL (If fail, attach error logs)

---

## **ROLLBACK PLAN (If Tests Fail)**

If critical tests fail:

1. **Check commit history**: `git log --oneline`
2. **Identify pre-cleanup commit**: Look for commit before cleanup changes
3. **Revert changes**: `git revert <commit-hash>` or `git reset --hard <pre-cleanup-commit>`
4. **Verify rollback**: Run critical tests again
5. **Report issue**: Include error logs, stack traces, steps to reproduce

**Critical Files to Check**:
- `server/gameManager.js` (line 1405 - endingColor declaration)
- `client/src/components/IntroScreen.jsx` (fade interval cleanup)
- `client/src/components/GameScene.jsx` (timeout tracking)
- `server/arcana/arcanaUtils.js` (getAdjacentSquares export)

---

**Testing Status**: ☐ Not Started ☐ In Progress ☐ Complete
