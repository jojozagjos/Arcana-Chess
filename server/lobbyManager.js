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

    // Get all players before deletion
    const allPlayers = [...lobby.players];
    
    // Remove this socket
    this.socketToLobby.delete(socketId);
    
    // Remove all other players from the lobby
    allPlayers.forEach(playerId => {
      this.socketToLobby.delete(playerId);
    });

    // Always delete the lobby when anyone leaves
    this.lobbies.delete(lobbyId);

    return { lobbyId, allPlayers };
  }

  removeSocket(socketId) {
    this.leaveLobby(socketId);
  }

  getPublicLobbies() {
    // Return all lobbies; client will show lock icon for private ones
    return [...this.lobbies.values()];
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
