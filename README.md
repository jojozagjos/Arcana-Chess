# Arcana Chess

Arcana Chess is a server-authoritative, online chess variant with collectible Arcana cards that modify gameplay.

This repository contains the client (React + Vite) and server (Node + Socket.io) code used to run local development and production builds.

## Quick Links
- Project root: this README
- Client: `client/`
- Server: `server/`

## Requirements
- Node.js 18+ (LTS recommended)
- npm (or yarn)

## Dev: Install & Run
1. Install dependencies (project root):

```bash
cd /c/Users/jgsla/OneDrive/Desktop/Github-Projects/Arcana-Chess
npm install
```

2. Start the server (development):

```bash
cd server
npm start
```

3. Start the client (development, Vite):

```bash
cd /c/Users/jgsla/OneDrive/Desktop/Github-Projects/Arcana-Chess
npm run dev
```

Open two browser windows to the dev server URL (normally http://localhost:5173) to test multiplayer flows locally.

## Build (production)

```bash
cd /c/Users/jgsla/OneDrive/Desktop/Github-Projects/Arcana-Chess
npm run build
```

The Vite build artifacts are placed for serving; see `server/public/` for production assets used by the server.

## Tests & Verification
This repo contains a verification matrix and several manual test items under `VERIFICATION_MATRIX.md` and `FINAL_IMPLEMENTATION_REPORT.md`.

Key runtime checks to perform locally:
- VFX timing overlap test — ensure card animations do not overlap or double-trigger.
- Reconnect/resume flow — refresh a client mid-game and call `resumeGame` to confirm state resynchronization.
- Automatch race test — simulate concurrent `autoMatch` calls to ensure a single lobby/game is created.
- Action idempotency stress test — rapidly emit `playerAction` with same `actionId` and verify the server dedupes applications.

## Notable Implementation Details
- Server-authoritative game state: all game logic runs on the server in `server/gameManager.js`.
- Action idempotency: clients attach an `actionId` to moves, draws, arcana use, and rematch votes. The server tracks processed IDs per-game and silently accepts duplicate retries to avoid double-applying actions.
	- Server methods: `isActionDuplicate(gameId, actionId)` and `markActionProcessed(gameId, actionId)` in `server/gameManager.js`.
- Fog of War: per-viewer serialization (`serialiseGameState`) hides the opponent's `lastMove` when fog is active.
- Audio: `client/src/game/soundManager.js` handles music and SFX; audio settings persist to localStorage. A bug where Intro screen unconditionally re-enabled audio was fixed so that `Mute All` persists across navigation.

## Mute / Audio Behavior
- Mute state is stored in `localStorage` (key: `arcanaChess.settings`).
- The app respects `globalSettings.audio.muted` when navigating screens; the `IntroScreen` no longer forces audio on.

## Development Notes
- When modifying server-side game logic, keep rules server-authoritative and avoid duplicating logic on the client.
- If adding new networked actions, ensure the client generates and attaches an `actionId` and the server marks processed IDs.

## Contributing
- Fork the repo, make changes in a feature branch, and open a PR. Include a short verification plan for any gameplay changes.

## License
MIT

---
If you want this README expanded with developer workflows (linting, formatting, test harness), or want me to add automated tests (stress tests or Cypress/e2e), tell me which you'd prefer and I'll scaffold them.