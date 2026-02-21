import { randomBytes } from 'crypto';

export class LobbyManager {
  constructor() {
    this.lobbies = new Map();      // lobbyId -> lobby
    this.socketToLobby = new Map(); // socketId -> lobbyId
  }

  _generateId() {
    return randomBytes(3).toString('hex');
  }

  _generateCode() {
    return randomBytes(3).toString('hex').toUpperCase();
  }

  createLobby(socket, payload) {
    const {
      lobbyName = 'New Lobby',
      isPrivate = false,
      gameMode = 'Ascendant',
      timeControl = 'unlimited',
    } = payload || {};

    const id = this._generateId();
    const code = this._generateCode();

    const lobby = {
      id,
      name: lobbyName,
      code,
      isPrivate,
      gameMode,
      timeControl,
      hostId: socket.id,
      players: [socket.id],
      createdAt: Date.now(),
    };

    this.lobbies.set(id, lobby);
    this.socketToLobby.set(socket.id, id);
    socket.join(id);

    return lobby;
  }

  _findLobbyByCode(code) {
    const upper = (code || '').toUpperCase().trim();
    for (const lobby of this.lobbies.values()) {
      if (lobby.code === upper) return lobby;
    }
    return null;
  }

  joinLobby(socket, payload) {
    const { lobbyId, code } = payload || {};

    let lobby = null;
    if (lobbyId) {
      lobby = this.lobbies.get(lobbyId) || null;
    } else if (code) {
      lobby = this._findLobbyByCode(code);
    }

    if (!lobby) {
      throw new Error('Lobby not found');
    }

    if (lobby.isPrivate && lobby.code !== (code || '').toUpperCase().trim()) {
      throw new Error('Incorrect lobby code for private lobby');
    }

    // Enforce 2-player limit
    if (lobby.players.length >= 2 && !lobby.players.includes(socket.id)) {
      throw new Error('Lobby is full');
    }

    if (!lobby.players.includes(socket.id)) {
      lobby.players.push(socket.id);
    }
    this.socketToLobby.set(socket.id, lobby.id);
    socket.join(lobby.id);

    return lobby;
  }

  leaveLobby(socketId) {
    const lobbyId = this.socketToLobby.get(socketId);
    if (!lobbyId) return null;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      this.socketToLobby.delete(socketId);
      return null;
    }
    // Remove this socket from lobby players
    const idx = lobby.players.indexOf(socketId);
    if (idx !== -1) lobby.players.splice(idx, 1);
    // Unmap the leaving socket
    this.socketToLobby.delete(socketId);

    // If host left, reassign host to first remaining player if any
    if (lobby.hostId === socketId && lobby.players.length > 0) {
      lobby.hostId = lobby.players[0];
    }

    // If lobby is now empty, delete it
    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
      return { lobbyId, closed: true };
    }

    // Persist updated lobby
    this.lobbies.set(lobbyId, lobby);
    return { lobbyId, lobby };
  }

  removeSocket(socketId) {
    this.leaveLobby(socketId);
  }

  getPublicLobbies() {
    // Return all lobbies with derived fields expected by clients
    // (client expects `status` and `playerCount` for quick-match filtering)
    return [...this.lobbies.values()]
      // Exclude lobbies that contain AI players (no need to show AI games in public list)
      .filter(lobby => !Array.isArray(lobby.players) || !lobby.players.some(id => typeof id === 'string' && id.startsWith('AI-')))
      .map((lobby) => {
      const playerCount = Array.isArray(lobby.players) ? lobby.players.length : 0;
      const status = playerCount < 2 ? 'waiting' : 'full';
      return {
        ...lobby,
        playerCount,
        status,
      };
    });
  }

  getLobbyForSocket(socketId) {
    const lobbyId = this.socketToLobby.get(socketId);
    if (!lobbyId) return null;
    return this.lobbies.get(lobbyId) || null;
  }

  updateLobbySettings(socketId, settings) {
    const lobby = this.getLobbyForSocket(socketId);
    if (!lobby) {
      throw new Error('Not in a lobby');
    }

    // Only host can update settings
    if (lobby.hostId !== socketId) {
      throw new Error('Only the host can update lobby settings');
    }

    // Update allowed settings
    if (settings.isPrivate !== undefined) lobby.isPrivate = settings.isPrivate;
    if (settings.gameMode !== undefined) lobby.gameMode = settings.gameMode;
    if (settings.timeControl !== undefined) lobby.timeControl = settings.timeControl;

    this.lobbies.set(lobby.id, lobby);
    return lobby;
  }
}
