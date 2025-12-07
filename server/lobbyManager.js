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
    if (!lobbyId) return;

    const lobby = this.lobbies.get(lobbyId);
    if (!lobby) {
      this.socketToLobby.delete(socketId);
      return;
    }

    lobby.players = lobby.players.filter((id) => id !== socketId);
    this.socketToLobby.delete(socketId);

    // If host leaves, assign new host if possible
    if (lobby.hostId === socketId && lobby.players.length > 0) {
      lobby.hostId = lobby.players[0];
    }

    // If no one left, delete lobby
    if (lobby.players.length === 0) {
      this.lobbies.delete(lobbyId);
    } else {
      this.lobbies.set(lobbyId, lobby);
    }
  }

  removeSocket(socketId) {
    this.leaveLobby(socketId);
  }

  getPublicLobbies() {
    return [...this.lobbies.values()].filter((lobby) => !lobby.isPrivate);
  }

  getLobbyForSocket(socketId) {
    const lobbyId = this.socketToLobby.get(socketId);
    if (!lobbyId) return null;
    return this.lobbies.get(lobbyId) || null;
  }
}
