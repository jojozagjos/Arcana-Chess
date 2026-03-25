# Arcana Studio - Quick Start Guide

## Overview

Arcana Studio is a full-featured cutscene and animation editor for creating dynamic card effects in Arcana Chess. It allows you to:

- Animate chess pieces on the board
- Control the camera with smooth transitions
- Add particle effects for magical visuals  
- Display text and image overlays
- Trigger sounds and custom events
- Create cinematic cutscenes

## Getting Started (5 Minutes)

### 1. Create Your First Card

1. Click **"New Card"**
2. Enter a card ID like `fire_spell` (lowercase, underscores, no spaces)
3. Your card appears in "Loaded Cards" on the left
4. The main editor opens with an empty workspace

### 2. Add a Camera Keyframe

1. In the Outliner, click **"+ Camera"** to create a camera track
2. This creates your first keyframe at time 0ms
3. The viewport shows you exactly what this camera sees
4. In the Inspector on the right, adjust the position and target to frame your scene

### 3. Add Piece Animation

1. Click **"+ Object"** to create an object animation track
2. In the Inspector, set:
   - **Type:** "piece"
   - **Piece Square:** "e4" (starting square)
3. This creates a keyframe for your piece at time 0ms
4. The piece appears on the board in the viewport

### 4. Create Motion

1. Drag the playhead slider to time 500ms (0.5 seconds)
2. Click **"Add Key"** to create a new keyframe
3. Select the object track and adjust the **Position** in the Inspector
4. Try setting it to `[0, 0, 1]` to move it forward one square

### 5. Preview Your Animation

1. Press **Space** or click **"Play"** to see your animation
2. The piece moves smoothly from e4 forward
3. Watch it loop or adjust timings as needed
4. Click **"Rewind"** to return to the start

### 6. Export Your Card

Click **"Export Card"** to download your current card JSON for backup and sharing.

## Key Concepts

### Tracks
Each track type handles one type of animation:
- **Camera:** View angle, position, focus
- **Object:** Piece or mesh animation (position, rotation, scale)
- **Particle:** Magical effects and emitters
- **Overlay:** Text, images, HUD elements
- **Sound:** Audio playback
- **Event:** Custom triggers (e.g., "highlight_squares", "create_explosion")

### Keyframes
Keyframes are snapshots in time. Your animation blends between them:
- Create keyframe at time 0ms: piece at e4
- Create keyframe at time 500ms: piece at e5
- Arcana Studio automatically blends the motion between them

### Timeline
The timeline shows all your keyframes across time:
- **Click on a track name** to select it
- **Double-click the timeline** to add a keyframe at that time
- **Drag keyframes** left/right to move them in time
- **Drag the playhead** (white/gold line) to scrub through time

### Easing
Different easing curves create different motion feel:
- **Linear:** constant speed
- **Ease-in:** slow start, fast end
- **Ease-out:** fast start, slow end
- **Ease-in-out:** slow start and end, fast middle

Select the easing in the Inspector's "Easing" dropdown.

## Common Tasks

### Animate a Piece Moving

```
1. Create object track (type: "piece")
2. Set piece square to starting position (e.g., "e2")
3. At time 0ms: position [0, 0, 0]
4. At time 500ms: position [0, 0, 1] (moves to next square)
5. Play to watch movement
```

### Add a Text Overlay

```
1. Create overlay track (type: "text")
2. Set "Space" to "screen" (for HUD) or "world" (for world position)
3. In Inspector, set "Content" to your text (e.g., "Checkmate!")
4. At time 0ms: position 50%, 50% (center), opacity 1
5. At time 500ms: position 50%, 40% (move up), opacity 0.5
```

### Create a Camera Pan

```
1. Create camera track
2. At time 0ms: position [8, 10, 8], target [0, 0, 0]
3. At time 2000ms: position [2, 8, 2], target [4, 0, 4]
4. Set easing to "easeInOutCubic" for smooth motion
5. Play to see the camera pan across the board
```

### Add Particle Effects

```
1. Create particle track
2. In Inspector, adjust emission rate, velocity, lifetime, colors
3. Create keyframe at time 0ms: enabled true
4. Create keyframe at time 1000ms: enabled false
5. Particles burst and fade over 1 second
```

## Interface Guide

### Sidebar (Left)
- **Loaded Cards:** Switch between your cards
- **Outliner:** All tracks in the current card
  - Click **"+ Camera/Object/Particle..."** buttons to add new tracks
  - Click a track to select it

### Main Area
- **Viewport:** 3D preview of your animation
  - Frame controls: **G** (move), **R** (rotate), **S** (scale)
  - View modes: **Preview Cam** (see keyframe camera) or **Free Cam** (explore freely)
  - Middle-mouse drag to rotate view
  - Scroll to zoom

- **Timeline:** All keyframes across time
  - Double-click to add a keyframe
  - Drag the playhead to scrub
  - Drag keyframes to move them in time
  - Click "Play" to preview

- **Graph:** Easing curve preview (bottom-right)
  - Shows how your keyframe blends between values
  - Different curves create different motion feel

### Inspector (Right)
- **Card Properties:** Title, duration, FEN (board state), snap settings
- **Track Properties:** Type-specific options (piece square, particle settings, etc.)
- **Keyframe Properties:** Details of the selected keyframe (time, position, rotation, etc.)

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Z` / `Cmd+Z` | Undo |
| `Ctrl+Shift+Z` / `Cmd+Shift+Z` | Redo |
| `Space` | Play/Pause |
| `G` | Translate mode |
| `R` | Rotate mode |
| `S` | Scale mode |
| `Delete` / `Backspace` | Delete selected keyframe |

## Tips & Tricks

### Performance
- Keep particle counts under 100 for smooth playback
- Use "cut" blend mode for instant camera changes (faster than curves)
- Test on target devices to ensure smooth playback

### Piece Animation Best Practices
- Use "follow" attach mode to keep pieces relative to the board
- Keyframe position changes between squares (0 to 1 unit = adjacent squares)
- Add animations for captures, promotions, sacrifices

### Synchronized Multi-Track Effects
- Multiple tracks play at once
- Set keyframes at the same time on different tracks to synchronize
- Example: camera cut + sound effect + particle burst = dramatic moment

### Export & Backup
- Click **"Export Card"** to download a JSON file (backup/sharing)
- Click **"Export Legacy"** for compatibility with older formats

## Troubleshooting

**Camera resets during transform?**
- Normal! Switch to "Free Cam" to pan freely while transforming

**Keyframes not appearing?**
- Make sure the track is selected and visible in the timeline
- Check that keyframes are within the card's duration

**Object not animating?**
- Verify the track is enabled (visible in timeline)
- Make sure keyframes have different values
- Check that duration is long enough for animation to play

**Particles not showing?**
- Check the "enabled" keyframe property is true during playback

**Audio not playing?**
- Make sure the sound ID matches files in `/public/sounds/`
- Supported formats: WAV, MP3, OGG

## Next Steps

Once you've created a few cards:
1. Open the **in-editor Tutorial** (click the **"?"** button) for detailed information
2. Explore advanced features: blend modes, bezier curves, sub-emitters
3. Try combining multiple effects for dramatic cutscenes
4. Export and share your best creations!

## Getting Help

- Click the **"?"** button for the full interactive tutorial
- Hover over UI elements for tooltips
- Check the Timeline description: "Drag playhead or keyframes"
- Each track type has detailed inspector options

---

**Happy Creating!** 🎬✨
