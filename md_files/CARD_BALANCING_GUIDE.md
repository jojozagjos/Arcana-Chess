# Card Balancing Tool - User Guide

## Quick Start

1. **Access the Tool**
   - Launch the game (`npm run dev`)
   - On the main menu, click **"Dev Mode"** button (bottom-right)
   - Click the **"🛠️ Card Balancing Tool"** button

## Features Overview

### 1. Card Selection Panel (Left)
- **Browse all cards** organized by rarity
- **Click any card** to select it for testing
- Selected card is highlighted in blue
- See card count and rarity at a glance

### 2. 3D Board Testing (Center)
- **Interactive 3D chessboard** with full piece visualization
- **Test scenarios dropdown**: Choose from 6 predefined board states
  - Starting Position
  - Midgame
  - Endgame
  - Pawn About to Promote
  - King in Check
  - Crowded Center
- **Player color selector**: Test as White or Black
- **Click squares** to select pieces or choose targets
- **Camera controls**: Rotate, zoom, pan the board

### 3. Card Details Panel (Right)
- **Card preview** with full artwork
- **Description & stats** (rarity, effects)
- **Custom parameters** for cards requiring targets
  - Target square selection
  - Piece type transformation (for Metamorphosis)
- **Test results** showing:
  - Changes detected (removed, added, transformed pieces)
  - Before/After FEN comparison
- **Event log** tracking all actions with timestamps

## How to Test a Card

### Basic Testing Flow:

1. **Select a card** from the left panel
2. **Choose a test scenario** (e.g., "Midgame")
3. **Select player color** (White or Black)
4. **Set parameters** (if card requires targeting):
   - Click a square on the board for target selection
   - Choose piece type for transformations
5. **Click "Test Card"** button
6. **Review results** in the right panel:
   - See what pieces were removed/added/changed
   - Compare before/after board states
   - Check event log for detailed actions

### Example: Testing "Execution" Card

```
1. Select "Execution" from card list
2. Choose "Midgame" scenario
3. Set player as "White"
4. Click on an enemy piece (e.g., black knight on c6)
5. Click "Test Card"
6. See result: Knight removed from c6
```

### Example: Testing "Metamorphosis" Card

```
1. Select "Metamorphosis" from card list
2. Choose any scenario
3. Click on one of your pieces
4. Select transformation type (Queen/Rook/Bishop/Knight)
5. Click "Test Card"
6. See result: Piece transformed to new type
```

## Card Categories & Testing Tips

### 🛡️ Defense Cards
- **Shield Pawn**: Select a pawn to protect
- **Iron Fortress**: No targeting needed, protects all pawns
- **Bishop's Blessing**: Select a bishop to make invulnerable
- **Divine Intervention**: No targeting, protects king from check/capture

### ⚔️ Offensive Cards
- **Execution**: Click enemy piece to destroy (not king)
- **Castle Breaker**: Automatically finds and destroys enemy rook
- **Double Strike**: Enables second attack after capture
- **Poison Touch**: Damages adjacent enemies after capture

### 🎭 Transformation Cards
- **Metamorphosis**: Select piece + choose new type
- **Promotion Ritual**: Select pawn to promote to queen
- **Mirror Image**: Select piece to duplicate
- **Royal Swap**: Select piece to swap with king

### 🔮 Utility Cards
- **Vision**: Shows opponent's legal moves (visual effect)
- **Cursed Square**: Select square to make deadly
- **Sanctuary**: Select square to prevent captures
- **Time Travel**: Undoes last 2 moves

### 🚀 Movement Cards
- **Spectral March**: Rook passes through friendly pieces
- **Phantom Step**: Piece moves like a knight
- **Queen's Gambit**: Grants extra move
- **Pawn Rush**: All pawns can move 2 squares

## Advanced Features

### Test Scenarios
Each scenario is designed to test specific card interactions:

- **Starting Position**: Basic setup testing
- **Midgame**: Crowded board, lots of pieces to target
- **Endgame**: Minimal pieces, test win condition effects
- **Pawn Promotion**: Test promotion-related cards
- **King in Check**: Test defensive/protective cards
- **Crowded Center**: Test area-effect and movement cards

### Multiplayer Sync Testing
- Click **"Show Multiplayer Test"** to open sync panel
- Start a test game to verify card effects sync between players
- Useful for catching desync bugs in online play

### Event Log
- Color-coded messages:
  - **Gray**: Info messages
  - **Green**: Success/completion
  - **Orange**: Warnings
  - **Red**: Errors
  - **Blue**: Test actions
- Timestamps for debugging
- Auto-scrolls to latest message

## Balancing Workflow

### Recommended Testing Process:

1. **Single Card Deep Dive**
   - Select one card to focus on
   - Test in ALL scenarios
   - Verify it works as intended
   - Check for edge cases

2. **Parameter Tuning**
   - Test different board states
   - Try as both colors
   - Experiment with different targets

3. **Power Level Assessment**
   - Is the card too strong? (removes multiple pieces easily)
   - Is it too weak? (minimal impact on board state)
   - Compare to similar rarity cards

4. **Multiplayer Verification**
   - Start a multiplayer test
   - Verify effects sync correctly
   - Check opponent sees the same changes

5. **Documentation**
   - Note any bugs found in event log
   - Document expected vs actual behavior
   - Track balance changes needed

## Keyboard Shortcuts & Tips

- **Click board**: Select piece or set target
- **Test Card**: Preview effect immediately
- **Reset**: Clear selections and start over
- **Switch scenarios**: Quick board state changes
- **Dev Mode toggle**: Show/hide balancing tool button

## Common Testing Scenarios

### Testing Area-Effect Cards
1. Choose "Crowded Center" scenario
2. Select card (e.g., Chain Lightning, Poison Touch)
3. Make a capture move first (if required)
4. Verify adjacent pieces are affected

### Testing Movement Enhancement Cards
1. Choose "Starting Position"
2. Select movement card (e.g., Spectral March)
3. Try moving pieces through blockers
4. Verify legal move highlights are correct

### Testing King Protection
1. Choose "King in Check" scenario
2. Select defensive card (e.g., Divine Intervention)
3. Verify king cannot be captured
4. Test that check is prevented

### Testing Transformation Effects
1. Select any scenario with target pieces
2. Choose transformation card
3. Select source piece
4. Verify transformation applies correctly
5. Check piece type and color match expectations

## Troubleshooting

**Card has no effect?**
- Check if targeting is required (see right panel)
- Verify target is valid (correct piece type/color)
- Check event log for error messages

**Board looks wrong?**
- Click "Reset" to clear state
- Try changing scenario and back
- Refresh page if needed

**Can't select piece?**
- Ensure scenario is loaded
- Check player color matches piece
- Some cards require empty squares

**Multiplayer test not working?**
- Start dev server first (`npm run dev`)
- Check browser console for errors
- Verify socket connection is active

## Next Steps

After testing and balancing cards:

1. **Document changes** needed in card definitions
2. **Update** `client/src/game/arcanaDefinitions.js`
3. **Sync server** logic in `server/gameManager.js`
4. **Re-test** in actual multiplayer game
5. **Gather feedback** from playtesters
6. **Iterate** on balance changes

---

**Happy Balancing! 🎮**

For bugs or feature requests, check the event log and browser console.
