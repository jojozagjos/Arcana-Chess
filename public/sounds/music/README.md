# Music Assets (Client)

Place your music files here for the client to load via public paths.

Recommended filenames:
- tutorial.mp3  (tutorial screen)
- menu.mp3      (main menu)
- ingame.mp3    (in-game loop)

Guidelines:
- Prefer `.mp3` for broad browser support. Optionally add `.ogg` variants if needed.
- Keep file sizes reasonable (<5–10MB) to minimize load times.
- Ensure seamless loop: trim leading/trailing silence; export with loop-friendly settings.

Integration plan (optional):
- We can add a `musicManager` or extend `soundManager` to support looping tracks and crossfades.
- Example keys: `music:tutorial`, `music:menu`, `music:ingame`.
- The client can reference them with URLs like `/sounds/music/tutorial.mp3`.

Let me know when the files are in place and I’ll wire playback controls (looping, volume, crossfade).