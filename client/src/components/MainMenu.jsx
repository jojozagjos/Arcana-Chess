import React, { useState, useEffect } from 'react';
import { soundManager } from '../game/soundManager.js';
import { socket } from '../game/socket.js';
import './styles/MainMenu.css';
import MenuParticlesCanvas from './MenuParticles.jsx';

export function MainMenu({
  mode = 'root',
  onPlayOnlineHost,
  onPlayOnlineJoin,
  onTutorial,
  onViewArcana,
  onSettings,
  onCardBalancing,
  onBack,
  devMode = false,
  onToggleDevMode,
  onQuickMatch,
  quickMatchStatus,
  quickMatchLoading = false,
}) {
  // Music is handled globally in App; no per-mode control needed here  
  if (mode === 'root') {
    return (
      <div className="menu-container">
        <MenuParticlesCanvas />
        <div className="menu-vignette" />

        <div className="menu-ui">
          <h1 className="menu-title">Arcana Chess</h1>
          {/* <p className="menu-subtitle">Arcana-infused 3D chess with multiplayer and AI.</p> */}

          <div className="menu-buttons">
            <button className="menu-button" onClick={onPlayOnlineHost}>Host game</button>
            <button className="menu-button" onClick={onPlayOnlineJoin}>Join game</button>
            <button className="menu-button" onClick={onQuickMatch} disabled={quickMatchLoading}>{quickMatchStatus || 'Find Match'}</button>
          </div>

          <div className="menu-secondary-row">
            <button className="menu-secondary" onClick={onTutorial}>Tutorial (WIP)</button>
            <button className="menu-secondary" onClick={onViewArcana}>View Arcana</button>
            <button className="menu-secondary" onClick={onSettings}>Settings</button>
            {devMode && (
              <button className="menu-secondary" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }} onClick={onCardBalancing}>🛠️ Card Balancing Tool 📊</button>
            )}
          </div>

          {onToggleDevMode && (
            <div className="dev-mode">
              <button className="menu-secondary dev-btn" onClick={onToggleDevMode} title="Toggle developer mode">{devMode ? '🔧 Dev Mode: ON' : 'Dev Mode'}</button>
            </div>
          )}
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

function HostLobbyScreen({ onBack, initialLobby = null }) {
  const [tab, setTab] = useState('online'); // 'online' | 'ai'
  const [currentLobby, setCurrentLobby] = useState(initialLobby);

  return (
    <div style={styles.container}>
      <div style={styles.panel}>
        <div style={styles.headerRow}>
          <h2 style={styles.heading}>Host game</h2>
          <button
            style={{ ...styles.backButton, ...(currentLobby ? styles.disabledButton : {}) }}
            onClick={() => !currentLobby && onBack && onBack()}
            disabled={!!currentLobby}
          >
            Back
          </button>
        </div>

        <div style={styles.tabRow}>
          <button
            style={{
              ...styles.tabButton,
              ...(tab === 'online' ? styles.tabButtonActive : {}),
              ...(currentLobby ? styles.disabledButton : {}),
            }}
            onClick={() => !currentLobby && setTab('online')}
            disabled={!!currentLobby}
          >
            Online lobby
          </button>
          <button
            style={{
              ...styles.tabButton,
              ...(tab === 'ai' ? styles.tabButtonActive : {}),
              ...(currentLobby ? styles.disabledButton : {}),
            }}
            onClick={() => !currentLobby && setTab('ai')}
            disabled={!!currentLobby}
          >
            Versus AI (WIP)
          </button>
        </div>

        {tab === 'online' ? <OnlineHostForm initialLobby={initialLobby} onLobbyChange={setCurrentLobby} /> : <AIGameForm />}
      </div>
    </div>
  );
}

function OnlineHostForm({ initialLobby = null, onLobbyChange } = {}) {
  const [lobbyName, setLobbyName] = useState('My Lobby');
  const [isPrivate, setIsPrivate] = useState(false);
  const [gameMode, setGameMode] = useState('Ascendant');
  const [timeControl, setTimeControl] = useState('unlimited');
  const [status, setStatus] = useState('');
  const [currentLobby, setCurrentLobby] = useState(initialLobby || null);

  const updateLobby = (lobby) => {
    setCurrentLobby(lobby);
    if (onLobbyChange) onLobbyChange(lobby);
  };

  const handleSettingChange = (field, value) => {
    // Optimistically update local state
    const updated = { ...currentLobby, [field]: value };
    setCurrentLobby(updated);
    
    // Send update to server
    socket.emit('updateLobbySettings', { [field]: value }, (res) => {
      if (res && res.ok) {
        // Server confirmed, update will come via lobbyUpdated event
      } else {
        // Revert on error
        setStatus(`Error updating settings: ${res?.error || 'Unknown error'}`);
        setCurrentLobby(currentLobby);
      }
    });
  };

  const handleLeaveLobby = () => {
    socket.emit('leaveLobby', {}, () => {
      setCurrentLobby(null);
      if (onLobbyChange) onLobbyChange(null);
    });
  };

  const handleCreateLobby = () => {
    setStatus('Creating lobby...');
    socket.emit(
      'createLobby',
      { lobbyName, isPrivate, gameMode, timeControl },
      (res) => {
        if (!res || !res.ok) {
          setStatus(`Error: ${res?.error || 'Unknown error'}`);
        } else {
          updateLobby(res.lobby);
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
        updateLobby(lobby);
      }
    };
    
    const handleLobbyClosed = () => {
      // Lobby was closed (someone left), navigate back
      setStatus('Lobby closed');
      setCurrentLobby(null);
      if (onLobbyChange) onLobbyChange(null);
    };
    
    socket.on('lobbyUpdated', handleLobbyUpdated);
    socket.on('lobbyClosed', handleLobbyClosed);
    
    return () => {
      socket.off('lobbyUpdated', handleLobbyUpdated);
      socket.off('lobbyClosed', handleLobbyClosed);
    };
  }, [currentLobby]);

  const playersCount = currentLobby ? currentLobby.players.length : 0;
  const isHost = currentLobby && currentLobby.hostId === socket.id;

  // If in lobby, show lobby view (separate host/guest)
  if (currentLobby) {
    return (
      <div style={styles.lobbyView}>
        <div style={styles.lobbyHeader}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', marginBottom: 4 }}>{currentLobby.name}</h3>
            <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
              Lobby code: <strong style={{ fontSize: '1rem', opacity: 1 }}>{currentLobby.code}</strong>
              {currentLobby.isPrivate && <span style={{ marginLeft: 8 }}>🔒 Private</span>}
            </div>
          </div>
          <div style={{ fontSize: '0.9rem', opacity: 0.8 }}>
            Players: <strong>{playersCount}/2</strong>
          </div>
        </div>

        {/* Settings section - editable for host, read-only for guest */}
        <div style={styles.settingsSection}>
          <h4 style={{ margin: 0, marginBottom: 10, fontSize: '0.95rem', opacity: 0.8 }}>Lobby settings</h4>
          
          {isHost ? (
            // Host can edit settings
            <>
              <label style={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={currentLobby.isPrivate}
                  onChange={(e) => handleSettingChange('isPrivate', e.target.checked)}
                />
                <span>Private lobby (requires code to join)</span>
              </label>

              <label style={styles.label}>
                Game mode
                <select
                  style={styles.input}
                  value={currentLobby.gameMode}
                  onChange={(e) => handleSettingChange('gameMode', e.target.value)}
                >
                  <option value="Ascendant">Ascendant (Arcana unlock after capture)</option>
                  <option value="Classic">Classic Chess (no Arcana cards)</option>
                </select>
              </label>

              <label style={styles.label}>
                Time control
                <select
                  style={styles.input}
                  value={currentLobby.timeControl}
                  onChange={(e) => handleSettingChange('timeControl', e.target.value)}
                >
                  <option value="unlimited">Unlimited</option>
                  <option value="blitz">Blitz (fast)</option>
                  <option value="rapid">Rapid</option>
                </select>
              </label>
            </>
          ) : (
            // Guest sees read-only settings
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={styles.readOnlySetting}>
                <span style={{ opacity: 0.7 }}>Game mode:</span>
                <strong>{currentLobby.gameMode}</strong>
              </div>
              <div style={styles.readOnlySetting}>
                <span style={{ opacity: 0.7 }}>Time control:</span>
                <strong>{currentLobby.timeControl}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {isHost && (
            <button
              style={{ ...styles.primaryButton, width: '100%' }}
              onClick={handleStartGame}
              disabled={playersCount < 2}
            >
              {playersCount < 2 ? 'Waiting for player...' : 'Start match'}
            </button>
          )}
          {!isHost && (
            <div style={{ padding: 12, textAlign: 'center', background: 'rgba(136,192,208,0.1)', borderRadius: 8, fontSize: '0.9rem', color: '#88c0d0' }}>
              Waiting for host to start the match...
            </div>
          )}
          <button
            style={{ ...styles.secondaryButton, width: '100%' }}
            onClick={handleLeaveLobby}
          >
            Leave lobby
          </button>
        </div>

        {status && <div style={styles.status}>{status}</div>}
      </div>
    );
  }

  // Creation form (only shown when not in a lobby)
  return (
    <div style={styles.form}>
      <label style={styles.label}>
        Lobby name
        <input
          style={styles.input}
          value={lobbyName}
          onChange={(e) => setLobbyName(e.target.value)}
          placeholder="My Awesome Lobby"
        />
      </label>

      <label style={styles.checkboxRow}>
        <input
          type="checkbox"
          checked={isPrivate}
          onChange={(e) => setIsPrivate(e.target.checked)}
        />
        <span>Private lobby (requires code to join)</span>
      </label>

      <label style={styles.label}>
        Game mode
        <select
          style={styles.input}
          value={gameMode}
          onChange={(e) => setGameMode(e.target.value)}
        >
          <option value="Ascendant">Ascendant (Arcana enabled)</option>
          <option value="Classic">Classic Chess (no Arcana)</option>
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

      <button style={{ ...styles.primaryButton, marginTop: 8 }} onClick={handleCreateLobby}>
        Create lobby
      </button>

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
          <option value="Ascendant">Ascendant (Arcana enabled)</option>
          <option value="Classic">Classic Chess (no Arcana)</option>
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
  const [joinedLobby, setJoinedLobby] = useState(null);
  const [codePrompt, setCodePrompt] = useState(null); // { lobbyId, lobbyName }
  const [filter, setFilter] = useState('all'); // 'all' | 'public' | 'private'
  const [searchTerm, setSearchTerm] = useState('');

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

  const handleJoinLobbyId = (lobbyId, isPrivateLobby = false, lobbyName = '') => {
    if (isPrivateLobby) {
      setCodePrompt({ lobbyId, lobbyName });
      return;
    }
    setStatus('Joining lobby...');
    socket.emit('joinLobby', { lobbyId }, (res) => {
      if (!res || !res.ok) {
        setStatus(`Error: ${res?.error || 'Failed to join lobby'}`);
      } else {
        // Transition into the lobby UI with the joined lobby as the initial lobby
        setJoinedLobby(res.lobby);
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
        setJoinedLobby(res.lobby);
      }
    });
  };

  const handleJoinPrivateWithCode = () => {
    if (!codePrompt || !joinCode.trim()) return;
    setStatus('Joining private lobby...');
    socket.emit('joinLobby', { lobbyId: codePrompt.lobbyId, code: joinCode.trim() }, (res) => {
      if (!res || !res.ok) {
        setStatus(`Error: ${res?.error || 'Incorrect code or lobby unavailable'}`);
      } else {
        setJoinedLobby(res.lobby);
        setCodePrompt(null);
        setJoinCode('');
      }
    });
  };

  const handleCancelCodePrompt = () => {
    setCodePrompt(null);
    setJoinCode('');
    setStatus('');
  };

  // Filter and search lobbies
  const filteredLobbies = lobbies.filter(lobby => {
    if (filter === 'public' && lobby.isPrivate) return false;
    if (filter === 'private' && !lobby.isPrivate) return false;
    if (searchTerm.trim()) {
      const search = searchTerm.toLowerCase();
      return lobby.name.toLowerCase().includes(search) || 
             lobby.gameMode.toLowerCase().includes(search);
    }
    return true;
  });

  if (joinedLobby) {
    return <HostLobbyScreen onBack={onBack} initialLobby={joinedLobby} />;
  }

  if (codePrompt) {
    return (
      <div style={styles.container}>
        <div style={styles.panel}>
          <div style={styles.headerRow}>
            <h2 style={styles.heading}>Join private lobby</h2>
            <button style={styles.backButton} onClick={handleCancelCodePrompt}>Back</button>
          </div>
          <div style={styles.form}>
            <p style={{ marginBottom: 16, opacity: 0.9 }}>
              <strong>{codePrompt.lobbyName}</strong> is private. Enter the lobby code to join.
            </p>
            <label style={styles.label}>
              Lobby code
              <input
                style={styles.input}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                placeholder="ABC123"
                autoFocus
                onKeyPress={(e) => e.key === 'Enter' && handleJoinPrivateWithCode()}
              />
            </label>
            <button style={styles.primaryButton} onClick={handleJoinPrivateWithCode}>
              Join lobby
            </button>
            {status && <div style={styles.status}>{status}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={{ ...styles.panel, maxWidth: 640 }}>
        <div style={styles.headerRow}>
          <h2 style={styles.heading}>Join game</h2>
          <button style={styles.backButton} onClick={onBack}>Back</button>
        </div>

        {/* Search bar */}
        <input
          style={{ ...styles.input, marginBottom: 12, fontSize: '0.95rem' }}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="🔍 Search lobbies by name or mode..."
        />

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button
            style={{
              ...styles.filterButton,
              ...(filter === 'all' ? styles.filterButtonActive : {}),
            }}
            onClick={() => setFilter('all')}
          >
            All ({lobbies.length})
          </button>
          <button
            style={{
              ...styles.filterButton,
              ...(filter === 'public' ? styles.filterButtonActive : {}),
            }}
            onClick={() => setFilter('public')}
          >
            Public ({lobbies.filter(l => !l.isPrivate).length})
          </button>
          <button
            style={{
              ...styles.filterButton,
              ...(filter === 'private' ? styles.filterButtonActive : {}),
            }}
            onClick={() => setFilter('private')}
          >
            🔒 Private ({lobbies.filter(l => l.isPrivate).length})
          </button>
          <button
            style={{ ...styles.secondaryButton, marginLeft: 'auto' }}
            onClick={refreshLobbies}
          >
            Refresh
          </button>
        </div>

        {/* Lobby list */}
        <div style={styles.lobbyList}>
          {filteredLobbies.length === 0 && (
            <div style={{ padding: 20, textAlign: 'center', fontSize: '0.9rem', opacity: 0.7 }}>
              {searchTerm ? 'No lobbies match your search.' : 'No lobbies found.'}
            </div>
          )}
          {filteredLobbies.map((lobby) => (
            <div key={lobby.id} style={styles.lobbyCard}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: '1.05rem' }}>{lobby.name}</span>
                  {lobby.isPrivate && <span style={{ fontSize: '0.95rem', opacity: 0.7 }}>🔒</span>}
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.75, display: 'flex', gap: 12 }}>
                  <span>Mode: <strong>{lobby.gameMode}</strong></span>
                  <span>Players: <strong>{lobby.players.length}/2</strong></span>
                  <span>Time: <strong>{lobby.timeControl}</strong></span>
                </div>
              </div>
              <button
                style={styles.joinButton}
                onClick={() => handleJoinLobbyId(lobby.id, lobby.isPrivate, lobby.name)}
              >
                Join
              </button>
            </div>
          ))}
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
    position: 'relative',
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
  disabledButton: {
    opacity: 0.55,
    cursor: 'not-allowed',
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
    border: '1px solid transparent',
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
  filterButton: {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid #394867',
    background: 'transparent',
    color: '#d0d6ea',
    cursor: 'pointer',
    fontSize: '0.85rem',
    transition: 'all 0.2s',
  },
  filterButtonActive: {
    background: 'rgba(76, 111, 255, 0.2)',
    border: '1px solid #4c6fff',
    color: '#8f94fb',
  },
  lobbyCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 10,
    background: 'linear-gradient(135deg, rgba(11,16,32,0.95), rgba(8,12,25,0.9))',
    border: '1px solid rgba(59, 66, 82, 0.4)',
    transition: 'all 0.2s',
  },
  joinButton: {
    padding: '8px 20px',
    borderRadius: 999,
    border: 'none',
    background: 'linear-gradient(135deg, #4c6fff, #8f94fb)',
    color: 'white',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: 'all 0.2s',
  },
  lobbyView: {
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
  },
  lobbyHeader: {
    padding: 16,
    borderRadius: 10,
    background: 'linear-gradient(135deg, rgba(76,111,255,0.15), rgba(143,148,251,0.1))',
    border: '1px solid rgba(76, 111, 255, 0.3)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsSection: {
    padding: 14,
    borderRadius: 10,
    background: 'rgba(11,16,32,0.6)',
    border: '1px solid rgba(59, 66, 82, 0.4)',
  },
  readOnlySetting: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '0.9rem',
  },
  devModeToggle: {
    position: 'absolute',
    bottom: 20,
    right: 20,
  },
  devButton: {
    padding: '6px 12px',
    background: 'rgba(0,0,0,0.3)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    color: '#888',
    cursor: 'pointer',
    fontSize: 11,
    transition: 'all 0.2s',
  },
};
