import { EventEmitter } from 'events';
import { GameManager } from '../gameManager.js';

// Minimal mock io that records emits
class MockIO {
  constructor() { this.emits = []; }
  to(id) { return { emit: (ev, payload) => this.emits.push({ to: id, ev, payload }) }; }
}

class MockLobbyManager { constructor() { this.lobbies = new Map(); } }

async function run() {
  const io = new MockIO();
  const lobby = new MockLobbyManager();
  const gm = new GameManager(io, lobby);

  // Create two fake sockets
  const s1 = { id: 'p1' };
  const s2 = { id: 'p2' };

  // Start a multiplayer game by creating state directly
  const state = gm.startMultiplayerGame({ id: 'p1' }, { lobbyId: 'lobby1' });
  console.log('started game', state.id);
  console.log('E2E: emits so far', io.emits.length);
}

run().catch(e => { console.error(e); process.exit(1); });
