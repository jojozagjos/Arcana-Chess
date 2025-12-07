import React, { useState, useEffect } from 'react';
import { socket } from '../game/socket.js';

export function MainMenu({
  mode = 'root',
  onPlayOnlineHost,
  onPlayOnlineJoin,
  onTutorial,
  onViewArcana,
  onSettings,
  onBack,
}) {
  if (mode === 'root') {
    return (
      <div style={styles.container}>
        <div style={styles.panel}>
          <h1 style={styles.title}>XXI-Chess</h1>
          <p style={styles.subtitle}>Arcana-infused 3D chess with multiplayer and AI.</p>

          <div style={styles.buttonRow}>
            <button style={styles.primaryButton} onClick={onPlayOnlineHost}>
              Host game
            </button>
            <button style={styles.primaryButton} onClick={onPlayOnlineJoin}>
              Join game
            </button>
          </div>

          <div style={styles.secondaryRow}>
            <button style={styles.secondaryButton} onClick={onTutorial}>
              Tutorial
            </button>
            <button style={styles.secondaryButton} onClick={onViewArcana}>
              View Arcana
            </button>
            <button style={styles.secondaryButton} onClick={onSettings}>
              Settings
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'host') {
    return <HostLobbyScreen onBack={onBack} />;
  }

  if (mode === 'join') {
    return <JoinLobbyScreen onBack={onBack} />;
  }

  return null;
}

function HostLobbyScreen({ onBack }) {
  const [tab, setTab] = useState('online'); // 'online' | 'ai'

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <div style={styles.headerRow}>
          <h2 style={styles.heading}>Host game</h2>
          <button style={styles.backButton} onClick={onBack}>Back</button>
        </div>

        <div style={styles.tabRow}>
          <button
            style={{ ...styles.tabButton, ...(tab === 'online' ? styles.tabButtonActive : {}) }}
            onClick={() => setTab('online')}
          >
            Online lobby
          </button>
          <button
            style={{ ...styles.tabButton, ...(tab === 'ai' ? styles.tabButtonActive : {}) }}
            onClick={() => setTab('ai')}
          >
            Versus AI
          </button>
        </div>

        {tab === 'online' ? <OnlineHostForm /> : <AIGameForm />}
      </div>
    </div>
  );
}

function OnlineHostForm() {
  const [lobbyName, setLobbyName] = useState('My Lobby');
  const [isPrivate, setIsPrivate] = useState(false);
  const [gameMode, setGameMode] = useState('Ascendant');
  const [timeControl, setTimeControl] = useState('unlimited');
  const [status, setStatus] = useState('');
  const [currentLobby, setCurrentLobby] = useState(null);

  const handleCreateLobby = () => {
    setStatus('Creating lobby...');
    socket.emit(
      'createLobby',
      { lobbyName, isPrivate, gameMode, timeControl },
      (res) => {
        if (!res || !res.ok) {
          setStatus(`Error: ${res?.error || 'Unknown error'}`);
        } else {
          setCurrentLobby(res.lobby);
          setStatus(`Lobby created. Share code: ${res.lobby.code}`);
        }
      },
    );
  };

  const handleStartGame = () => {
    if (!currentLobby) {
      setStatus('Create a lobby first.');
      return;
    }
    setStatus('Starting game...');
    socket.emit(
      'startGame',
      { lobbyId: currentLobby.id },
      (res) => {
        if (!res || !res.ok) {
          setStatus(`Error: ${res?.error || 'Failed to start game'}`);
        } else {
          setStatus('Game starting...');
        }
      },
    );
  };

  useEffect(() => {
    const handleLobbyUpdated = (lobby) => {
      if (currentLobby && lobby.id === currentLobby.id) {
        setCurrentLobby(lobby);
      }
    };
    socket.on('lobbyUpdated', handleLobbyUpdated);
    return () => {
      socket.off('lobbyUpdated', handleLobbyUpdated);
    };
  }, [currentLobby]);

  const playersCount = currentLobby ? currentLobby.players.length : 0;
  const isHost = currentLobby && currentLobby.hostId === socket.id;

  return (
    <div style={styles.form}>
      <label style={styles.label}>
        Lobby name
        <input
          style={styles.input}
          value={lobbyName}
          onChange={(e) => setLobbyName(e.target.value)}
        />
      </label>

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
        <span>Private lobby (join via code)</span>
      </label>

      <label style={styles.label}>
        Game mode
        <select
          style={styles.input}
          value={gameMode}
          onChange={(e) => setGameMode(e.target.value)}
        >
          <option value="Ascendant">Ascendant (Arcana unlock after capture)</option>
        </select>
      </label>

      <label style={styles.label}>
        Time control
        <select
          style={styles.input}
          value={timeControl}
          onChange={(e) => setTimeControl(e.target.value)}
        >
          <option value="unlimited">Unlimited</option>
          <option value="blitz">Blitz (fast)</option>
          <option value="rapid">Rapid</option>
        </select>
      </label>

      {!currentLobby && (
        <button style={styles.primaryButton} onClick={handleCreateLobby}>
          Create lobby
        </button>
      )}

      {currentLobby && (
        <div style={styles.lobbyInfo}>
          <div>Lobby: <strong>{currentLobby.name}</strong></div>
          <div>Code: <strong>{currentLobby.code}</strong></div>
          <div>Players: {playersCount}</div>
          {isHost && (
            <button
              style={{ ...styles.primaryButton, marginTop: 12 }}
              onClick={handleStartGame}
              disabled={playersCount < 2}
            >
              Start match ({playersCount}/2)
            </button>
          )}
          {!isHost && (
            <div style={{ marginTop: 8, fontSize: '0.85rem', opacity: 0.8 }}>
              Waiting for host to start the match...
            </div>
          )}
        </div>
      )}

      {status && <div style={styles.status}>{status}</div>}
    </div>
  );
}

function AIGameForm() {
  const [gameMode, setGameMode] = useState('Ascendant');
  const [difficulty, setDifficulty] = useState('Scholar');
  const [playerColor, setPlayerColor] = useState('white');
  const [status, setStatus] = useState('');

  const handleStartAI = () => {
    setStatus('Starting AI match...');
    socket.emit(
      'startAIGame',
      { gameMode, difficulty, playerColor },
      (res) => {
        if (!res || !res.ok) {
          setStatus(`Error: ${res?.error || 'Failed to start AI game'}`);
        } else {
          setStatus('Match starting...');
        }
      },
    );
  };

  return (
    <div style={styles.form}>
      <label style={styles.label}>
        Game mode
        <select
          style={styles.input}
          value={gameMode}
          onChange={(e) => setGameMode(e.target.value)}
        >
          <option value="Ascendant">Ascendant</option>
        </select>
      </label>

      <label style={styles.label}>
        AI difficulty
        <select
          style={styles.input}
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
        >
          <option value="Scholar">Scholar (easy)</option>
          <option value="Knight">Knight (medium)</option>
          <option value="Monarch">Monarch (hard)</option>
        </select>
      </label>

      <label style={styles.label}>
        Your color
        <select
          style={styles.input}
          value={playerColor}
          onChange={(e) => setPlayerColor(e.target.value)}
        >
          <option value="white">White (move first)</option>
          <option value="black">Black (AI moves first)</option>
        </select>
      </label>

      <button style={styles.primaryButton} onClick={handleStartAI}>
        Start AI match
      </button>

      {status && <div style={styles.status}>{status}</div>}
    </div>
  );
}

function JoinLobbyScreen({ onBack }) {
  const [lobbies, setLobbies] = useState([]);
  const [status, setStatus] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const refreshLobbies = () => {
    setStatus('Loading lobbies...');
    socket.emit('listLobbies', {}, (res) => {
      if (!res || !res.ok) {
        setStatus(`Error: ${res?.error || 'Failed to list lobbies'}`);
      } else {
        setLobbies(res.lobbies || []);
        setStatus('');
      }
    });
  };

  useEffect(() => {
    refreshLobbies();
  }, []);

  const handleJoinLobbyId = (lobbyId) => {
    setStatus('Joining lobby...');
    socket.emit('joinLobby', { lobbyId }, (res) => {
      if (!res || !res.ok) {
        setStatus(`Error: ${res?.error || 'Failed to join lobby'}`);
      } else {
        setStatus(`Joined lobby: ${res.lobby.name}. Waiting for host...`);
      }
    });
  };

  const handleJoinByCode = () => {
    if (!joinCode.trim()) return;
    setStatus('Joining by code...');
    socket.emit('joinLobby', { code: joinCode.trim() }, (res) => {
      if (!res || !res.ok) {
        setStatus(`Error: ${res?.error || 'Failed to join via code'}`);
      } else {
        setStatus(`Joined lobby: ${res.lobby.name}. Waiting for host...`);
      }
    });
  };

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <div style={styles.headerRow}>
          <h2 style={styles.heading}>Join game</h2>
          <button style={styles.backButton} onClick={onBack}>Back</button>
        </div>

        <div style={styles.joinLayout}>
          <div style={styles.joinColumn}>
            <h3 style={styles.sectionHeading}>Public lobbies</h3>
            <button style={styles.secondaryButton} onClick={refreshLobbies}>
              Refresh
            </button>
            <div style={styles.lobbyList}>
              {lobbies.length === 0 && (
                <div style={{ fontSize: '0.85rem', opacity: 0.8 }}>No public lobbies found.</div>
              )}
              {lobbies.map((lobby) => (
                <div key={lobby.id} style={styles.lobbyRow}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{lobby.name}</div>
                    <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>
                      Mode: {lobby.gameMode} · Players: {lobby.players.length}
                    </div>
                  </div>
                  <button
                    style={styles.smallButton}
                    onClick={() => handleJoinLobbyId(lobby.id)}
                  >
                    Join
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div style={styles.joinColumn}>
            <h3 style={styles.sectionHeading}>Join by code</h3>
            <label style={styles.label}>
              Lobby code
              <input
                style={styles.input}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ABC123"
              />
            </label>
            <button style={styles.primaryButton} onClick={handleJoinByCode}>
              Join via code
            </button>
          </div>
        </div>

        {status && <div style={styles.status}>{status}</div>}
      </div>
    </div>
  );
}

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at top, #1b2735, #090a0f)',
    color: '#e5e9f0',
    fontFamily: 'system-ui, sans-serif',
  },
  panel: {
    minWidth: 420,
    maxWidth: 860,
    padding: 24,
    borderRadius: 18,
    background: 'rgba(5, 6, 10, 0.95)',
    boxShadow: '0 22px 60px rgba(0,0,0,0.65)',
  },
  title: {
    fontSize: '2.6rem',
    margin: 0,
    marginBottom: 8,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  subtitle: {
    margin: 0,
    marginBottom: 24,
    opacity: 0.8,
    fontSize: '0.95rem',
  },
  buttonRow: {
    display: 'flex',
    gap: 12,
  },
  primaryButton: {
    padding: '10px 18px',
    borderRadius: 999,
    border: 'none',
    background: 'linear-gradient(135deg, #4c6fff, #8f94fb)',
    color: 'white',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
  secondaryRow: {
    marginTop: 20,
    display: 'flex',
    gap: 10,
  },
  secondaryButton: {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid #394867',
    background: 'transparent',
    color: '#d0d6ea',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  heading: {
    margin: 0,
    fontSize: '1.3rem',
  },
  backButton: {
    padding: '6px 12px',
    borderRadius: 999,
    border: '1px solid #394867',
    background: 'transparent',
    color: '#d0d6ea',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  tabRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    padding: '8px 10px',
    borderRadius: 999,
    border: '1px solid #394867',
    background: 'transparent',
    color: '#d0d6ea',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  tabButtonActive: {
    background: 'linear-gradient(135deg, #4c6fff, #8f94fb)',
    color: '#fdfdfd',
    borderColor: 'transparent',
  },
  form: {
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    fontSize: '0.85rem',
  },
  input: {
    padding: '6px 10px',
    borderRadius: 8,
    border: '1px solid #3b4252',
    background: 'rgba(8,10,20,0.9)',
    color: '#e5e9f0',
    fontSize: '0.9rem',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: '0.85rem',
  },
  lobbyInfo: {
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    background: 'rgba(11,16,32,0.9)',
    fontSize: '0.9rem',
  },
  status: {
    marginTop: 10,
    fontSize: '0.8rem',
    opacity: 0.85,
  },
  joinLayout: {
    display: 'flex',
    gap: 16,
  },
  joinColumn: {
    flex: 1,
  },
  sectionHeading: {
    margin: 0,
    marginBottom: 8,
    fontSize: '1rem',
  },
  lobbyList: {
    marginTop: 8,
    maxHeight: 220,
    overflowY: 'auto',
    paddingRight: 4,
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  lobbyRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 8,
    borderRadius: 8,
    background: 'rgba(11,16,32,0.9)',
  },
  smallButton: {
    padding: '6px 10px',
    borderRadius: 999,
    border: '1px solid #394867',
    background: 'transparent',
    color: '#d0d6ea',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
};
