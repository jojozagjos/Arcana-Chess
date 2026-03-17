import React, { useState, useEffect } from 'react';
import { soundManager } from '../game/soundManager.js';
import { socket } from '../game/socket.js';
import './styles/MainMenu.css';
import MenuParticlesCanvas from './MenuParticles.jsx';

const TIME_CONTROL_LABELS = {
  unlimited: 'Unlimited',
  blitz: 'Blitz (10 min each)',
  rapid: 'Rapid (30 min each)',
  classical: 'Classical (60 min each)',
};

const getTimeControlLabel = (value) => TIME_CONTROL_LABELS[value] || String(value || 'Unlimited');

export function MainMenu({
  mode = 'root',
  initialLobby = null,
  rematchAISettings = null,
  rematchLobbyInfo = null,
  onOpenReplay,
  onPlayOnlineHost,
  onPlayOnlineJoin,
  onTutorial,
  onViewArcana,
  onSettings,
  onCardBalancing,
  onArcanaStudio,
  onBack,
  devMode = false,
  onToggleDevMode,
  onQuickMatch,
  quickMatchStatus,
  quickMatchLoading = false,
}) {
  const [showUpdateLog, setShowUpdateLog] = useState(false);
  // Music is handled globally in App; no per-mode control needed here  
  if (mode === 'root') {
    return (
      <div className="menu-container">
        <MenuParticlesCanvas devMode={devMode} />
        <div className="menu-vignette" />

          <div className="menu-ui">
          <h1 className="menu-title">Arcana Chess</h1>
          {/* <p className="menu-subtitle">Arcana-infused 3D chess with multiplayer and AI.</p> */}

          <div className="menu-buttons">
            <button className="menu-button" onClick={onPlayOnlineHost}>Host game</button>
            <button className="menu-button" onClick={onPlayOnlineJoin}>Join game</button>
            <button className="menu-button" onClick={onQuickMatch} disabled={quickMatchLoading}>{quickMatchStatus || 'Find Match'}</button>
          </div>

          {showUpdateLog ? (
            <div className="update-log">
              <div className="update-log-header">
                <div>
                  <h2 className="update-log-title">Update Log</h2>
                  <div className="update-log-subtitle">Recent fixes, polish, and multiplayer quality-of-life changes.</div>
                </div>
                <button className="dismiss-btn" title="Collapse" onClick={() => setShowUpdateLog(false)}>✕</button>
              </div>

              <div className="update-log-section">
                <div className="update-log-version">
                  <span>v1.3.1  Lobby UX + Menu Polish</span>
                  <span className="update-log-date">Mar 11, 2026</span>
                </div>
                <ul className="update-log-list">
                  <li>Updated the menu update log to a latest-version format with no older release entries.</li>
                  <li>Made secondary menu buttons fully rounded for a cleaner pill-button look.</li>
                  <li>Improved in-lobby information layout so privacy, mode, clock, and player count are grouped in one place.</li>
                  <li>Restored full host time-control choices, including Classical.</li>
                </ul>
              </div>

              <div className="update-log-footer">Click ✕ to collapse into a pill.</div>
            </div>
          ) : (
            <button className="update-log-pill" onClick={() => setShowUpdateLog(true)}>
              <span className="update-log-pill-dot" />
              <span>v1.3.1</span>
              <span className="update-log-pill-label">What's new</span>
            </button>
          )}

          <div className="menu-secondary-row">
            <button className="menu-secondary" onClick={onTutorial}>Tutorial (WIP)</button>
            <button className="menu-secondary" onClick={onViewArcana}>View Arcana</button>
            <button className="menu-secondary" onClick={onSettings}>Settings</button>
            {devMode && (
              <>
                <button className="menu-secondary" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }} onClick={onCardBalancing}>Card Balancing Tool</button>
                <button className="menu-secondary" style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }} onClick={onArcanaStudio}>Arcana Studio</button>
              </>
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
    return <HostLobbyScreen onBack={onBack} onOpenReplay={onOpenReplay} rematchAISettings={rematchAISettings} rematchLobbyInfo={rematchLobbyInfo} />;
  }

  if (mode === 'join') {
    return <JoinLobbyScreen onBack={onBack} initialLobby={initialLobby} />;
  }

  return null;
}

function HostLobbyScreen({ onBack, initialLobby = null, onOpenReplay, rematchAISettings = null, rematchLobbyInfo = null }) {
  const [tab, setTab] = useState(() => {
    // Auto-select tab based on rematch context
    if (rematchAISettings) return 'ai';
    return 'online';
  });
  const [currentLobby, setCurrentLobby] = useState(initialLobby);

  // Handle rematch lobby info: fetch and join the lobby
  useEffect(() => {
    if (rematchLobbyInfo && rematchLobbyInfo.lobbyId && !currentLobby) {
      // Fetch the rematch lobby from the server
      socket.emit('getLobbyInfo', { lobbyId: rematchLobbyInfo.lobbyId }, (res) => {
        if (res && res.ok && res.lobby) {
          setCurrentLobby(res.lobby);
        }
      });
    }
  }, [rematchLobbyInfo, currentLobby]);

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
          <button
            style={{
              ...styles.tabButton,
              ...(tab === 'replay' ? styles.tabButtonActive : {}),
              ...(currentLobby ? styles.disabledButton : {}),
            }}
            onClick={() => !currentLobby && setTab('replay')}
            disabled={!!currentLobby}
          >
            Replay Viewer
          </button>
        </div>

        {tab === 'online' && <OnlineHostForm initialLobby={initialLobby} onLobbyChange={setCurrentLobby} />}
        {tab === 'ai' && <AIGameForm rematchSettings={rematchAISettings} />}
        {tab === 'replay' && <ReplayImportForm onOpenReplay={onOpenReplay} />}
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
          setStatus('');
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
            <div style={{ marginTop: 6, fontSize: '0.85rem', opacity: 0.8 }}>
              Players: <strong>{playersCount}/2</strong>
            </div>
          </div>
        </div>

        {/* Settings section - editable for host, read-only for guest */}
        <div style={styles.settingsSection}>
          <h4 style={{ margin: 0, marginBottom: 10, fontSize: '0.95rem', opacity: 0.8 }}>Lobby settings</h4>
          <div style={styles.lobbyMetaGrid}>
            <div style={styles.lobbyMetaCard}>
              <div style={styles.lobbyMetaLabel}>Privacy</div>
              <div style={styles.lobbyMetaValue}>{currentLobby.isPrivate ? 'Private' : 'Public'}</div>
            </div>
            <div style={styles.lobbyMetaCard}>
              <div style={styles.lobbyMetaLabel}>Game mode</div>
              <div style={styles.lobbyMetaValue}>{currentLobby.gameMode}</div>
            </div>
            <div style={styles.lobbyMetaCard}>
              <div style={styles.lobbyMetaLabel}>Time control</div>
              <div style={styles.lobbyMetaValue}>{getTimeControlLabel(currentLobby.timeControl)}</div>
            </div>
            <div style={styles.lobbyMetaCard}>
              <div style={styles.lobbyMetaLabel}>Lobby status</div>
              <div style={styles.lobbyMetaValue}>Locked</div>
            </div>
          </div>
          <div style={styles.lockedNote}>Settings are locked while in lobby.</div>
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
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
      <div style={styles.setupGrid}>
        <div style={styles.formSectionCard}>
          <div style={styles.sectionEyebrow}>Online Match Setup</div>
          <h3 style={styles.sectionTitle}>Create a lobby</h3>
          <div style={styles.helperText}>Set the match rules once, share the code, and wait for one opponent to join.</div>

          <label style={styles.label}>
            Lobby name
            <input
              style={styles.input}
              value={lobbyName}
              onChange={(e) => setLobbyName(e.target.value)}
              placeholder="My Awesome Lobby"
            />
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
              <option value="unlimited">{TIME_CONTROL_LABELS.unlimited}</option>
              <option value="blitz">{TIME_CONTROL_LABELS.blitz}</option>
              <option value="rapid">{TIME_CONTROL_LABELS.rapid}</option>
              <option value="classical">{TIME_CONTROL_LABELS.classical}</option>
            </select>
          </label>

          <label style={styles.checkboxTile}>
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
            />
            <div>
              <div style={styles.checkboxTitle}>Private lobby</div>
              <div style={styles.checkboxText}>Requires a share code for entry.</div>
            </div>
          </label>
        </div>

        <div style={styles.previewCard}>
          <div style={styles.sectionEyebrow}>Match Preview</div>
          <h3 style={styles.sectionTitle}>{lobbyName || 'Untitled Lobby'}</h3>
          <div style={styles.previewList}>
            <div style={styles.previewRow}><span>Mode</span><strong>{gameMode}</strong></div>
            <div style={styles.previewRow}><span>Privacy</span><strong>{isPrivate ? 'Private' : 'Public'}</strong></div>
            <div style={styles.previewRow}><span>Clock</span><strong>{getTimeControlLabel(timeControl)}</strong></div>
            <div style={styles.previewRow}><span>Seats</span><strong>2 players</strong></div>
          </div>

          <div style={styles.calloutBox}>
            Once created, lobby settings are locked until the lobby is closed.
          </div>

          <div style={styles.actionStack}>
            <button style={{ ...styles.primaryButton, width: '100%' }} onClick={handleCreateLobby}>
              Create lobby
            </button>
            {status && <div style={styles.statusCard}>{status}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function AIGameForm({ rematchSettings = null }) {
  // Initialize form with rematch settings if available (when coming from a rematch)
  const [gameMode, setGameMode] = useState(rematchSettings?.gameMode || 'Ascendant');
  const [difficulty, setDifficulty] = useState(() => {
    if (rematchSettings?.difficulty) {
      return rematchSettings.difficulty;
    }
    return 'Scholar';
  });
  const [playerColor, setPlayerColor] = useState(() => {
    if (rematchSettings?.playerColor) {
      return rematchSettings.playerColor;
    }
    return 'white';
  });
  const [timeControl, setTimeControl] = useState(() => {
    if (rematchSettings?.timeControl) {
      return rematchSettings.timeControl === null ? 'unlimited' : String(rematchSettings.timeControl);
    }
    return 'unlimited';
  });
  const [status, setStatus] = useState('');

  const handleStartAI = () => {
    setStatus('Starting AI match...');
    socket.emit(
      'startAIGame',
      { gameMode, difficulty, playerColor, timeControl: timeControl === 'unlimited' ? null : parseInt(timeControl) },
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
      <div style={styles.setupGrid}>
        <div style={styles.formSectionCard}>
          <div style={styles.sectionEyebrow}>Solo Match Setup</div>
          <h3 style={styles.sectionTitle}>Create an AI game</h3>
          <div style={styles.helperText}>Choose the board rules, bot difficulty, and side before the match starts.</div>

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

          <label style={styles.label}>
            Time control
            <select
              style={styles.input}
              value={timeControl}
              onChange={(e) => setTimeControl(e.target.value)}
            >
              <option value="unlimited">Unlimited</option>
              <option value="5">Bullet (5 min)</option>
              <option value="10">Blitz (10 min)</option>
              <option value="30">Rapid (30 min)</option>
              <option value="60">Classical (60 min)</option>
            </select>
          </label>
        </div>

        <div style={styles.previewCard}>
          <div style={styles.sectionEyebrow}>Match Preview</div>
          <h3 style={styles.sectionTitle}>Versus AI</h3>
          <div style={styles.previewList}>
            <div style={styles.previewRow}><span>Mode</span><strong>{gameMode}</strong></div>
            <div style={styles.previewRow}><span>Difficulty</span><strong>{difficulty}</strong></div>
            <div style={styles.previewRow}><span>Your side</span><strong>{playerColor === 'white' ? 'White' : 'Black'}</strong></div>
            <div style={styles.previewRow}><span>Clock</span><strong>{timeControl === 'unlimited' ? 'Unlimited' : `${timeControl} min`}</strong></div>
          </div>

          <div style={styles.calloutBox}>
            AI matches start immediately after the server finishes setup.
          </div>

          <div style={styles.actionStack}>
            <button style={{ ...styles.primaryButton, width: '100%' }} onClick={handleStartAI}>
              Create AI game
            </button>
            {status && <div style={styles.statusCard}>{status}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReplayImportForm({ onOpenReplay }) {
  const [status, setStatus] = useState('');

  const handleFileChosen = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const replay = JSON.parse(text);
      if (typeof onOpenReplay === 'function') {
        onOpenReplay(replay);
      }
      setStatus('Opening replay viewer...');
    } catch (err) {
      setStatus('Invalid replay JSON file.');
    } finally {
      event.target.value = '';
    }
  };

  return (
    <div style={styles.form}>
      <div style={styles.setupGrid}>
        <div style={styles.formSectionCard}>
          <div style={styles.sectionEyebrow}>Replay Tools</div>
          <h3 style={styles.sectionTitle}>Import a replay</h3>
          <div style={styles.helperText}>Load an exported replay JSON and open the board replay viewer.</div>

          <label style={styles.label}>
            Replay file
            <input
              style={styles.input}
              type="file"
              accept="application/json,.json"
              onChange={handleFileChosen}
            />
          </label>
        </div>

        <div style={styles.previewCard}>
          <div style={styles.sectionEyebrow}>Supported formats</div>
          <h3 style={styles.sectionTitle}>Replay data</h3>
          <div style={styles.previewList}>
            <div style={styles.previewRow}><span>Preferred</span><strong>timeline.frames</strong></div>
            <div style={styles.previewRow}><span>Fallback</span><strong>fenHistory</strong></div>
            <div style={styles.previewRow}><span>Legacy</span><strong>finalState.fen</strong></div>
          </div>

          <div style={styles.calloutBox}>
            Replays open in read-only viewer mode.
          </div>

          {status && <div style={styles.statusCard}>{status}</div>}
        </div>
      </div>
    </div>
  );
}

function JoinLobbyScreen({ onBack, initialLobby = null }) {
  const [lobbies, setLobbies] = useState([]);
  const [status, setStatus] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [joinedLobby, setJoinedLobby] = useState(initialLobby || null);
  const [codePrompt, setCodePrompt] = useState(null); // { lobbyId, lobbyName }
  const [filter, setFilter] = useState('all'); // 'all' | 'public' | 'private'
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (initialLobby) setJoinedLobby(initialLobby);
  }, [initialLobby]);

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
                onKeyDown={(e) => e.key === 'Enter' && handleJoinPrivateWithCode()}
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
      <div style={{ ...styles.panel, width: '94vw', maxWidth: 'none', height: '86vh', maxHeight: '86vh', display: 'flex', flexDirection: 'column' }}>
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
    background: 'radial-gradient(circle at 18% 14%, rgba(145, 92, 255, 0.28) 0%, rgba(145, 92, 255, 0.08) 22%, transparent 42%), linear-gradient(180deg, #221133 0%, #12091d 52%, #07040d 100%)',
    color: '#efe7ff',
    fontFamily: 'Segoe UI, Tahoma, sans-serif',
  },
  panel: {
    width: 'min(96vw, 1180px)',
    minWidth: 420,
    maxWidth: 1180,
    minHeight: '78vh',
    padding: 30,
    borderRadius: 24,
    border: '1px solid rgba(191, 161, 255, 0.18)',
    background: 'linear-gradient(180deg, rgba(18, 10, 31, 0.96), rgba(9, 6, 17, 0.97))',
    boxShadow: '0 22px 60px rgba(0,0,0,0.65), 0 0 60px rgba(95, 54, 184, 0.12)',
    display: 'flex',
    flexDirection: 'column',
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
    padding: '12px 18px',
    borderRadius: 999,
    border: '1px solid rgba(214, 194, 255, 0.18)',
    background: 'linear-gradient(135deg, #5c33bb, #8a5cff 58%, #b687ff 100%)',
    color: 'white',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '0.95rem',
    boxShadow: '0 10px 24px rgba(85, 44, 171, 0.26)',
  },
  secondaryRow: {
    marginTop: 20,
    display: 'flex',
    gap: 10,
  },
  secondaryButton: {
    padding: '10px 14px',
    borderRadius: 999,
    border: '1px solid rgba(191, 161, 255, 0.18)',
    background: 'rgba(28, 14, 44, 0.48)',
    color: '#ddd1fb',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  heading: {
    margin: 0,
    fontSize: '1.55rem',
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  backButton: {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid rgba(191, 161, 255, 0.22)',
    background: 'rgba(38, 19, 64, 0.65)',
    color: '#e3d8ff',
    cursor: 'pointer',
    fontSize: '0.82rem',
  },
  disabledButton: {
    opacity: 0.55,
    cursor: 'not-allowed',
  },
  tabRow: {
    display: 'flex',
    gap: 10,
    marginBottom: 20,
  },
  tabButton: {
    flex: 1,
    padding: '12px 14px',
    borderRadius: 999,
    border: '1px solid rgba(191, 161, 255, 0.16)',
    background: 'rgba(29, 15, 47, 0.74)',
    color: '#d7caf5',
    cursor: 'pointer',
    fontSize: '0.95rem',
  },
  tabButtonActive: {
    background: 'linear-gradient(135deg, #5c33bb, #8a5cff 58%, #b687ff 100%)',
    color: '#fdfdfd',
    border: '1px solid transparent',
  },
  form: {
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  setupGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
    gap: 20,
    alignItems: 'stretch',
    minHeight: '58vh',
  },
  formSectionCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
    padding: 22,
    borderRadius: 20,
    border: '1px solid rgba(191, 161, 255, 0.14)',
    background: 'linear-gradient(180deg, rgba(31, 16, 49, 0.72), rgba(18, 10, 29, 0.84))',
  },
  previewCard: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    padding: 22,
    borderRadius: 20,
    border: '1px solid rgba(191, 161, 255, 0.18)',
    background: 'linear-gradient(180deg, rgba(54, 27, 92, 0.42), rgba(18, 10, 29, 0.88))',
  },
  sectionEyebrow: {
    fontSize: '0.75rem',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: '#b89ff0',
  },
  sectionTitle: {
    margin: 0,
    fontSize: '1.5rem',
    color: '#f4eeff',
  },
  helperText: {
    fontSize: '0.92rem',
    lineHeight: 1.5,
    color: '#cbbceb',
    marginBottom: 4,
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    fontSize: '0.88rem',
    color: '#e7deff',
  },
  input: {
    padding: '11px 13px',
    borderRadius: 12,
    border: '1px solid rgba(191, 161, 255, 0.18)',
    background: 'rgba(10, 7, 19, 0.82)',
    color: '#f3edff',
    fontSize: '0.95rem',
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: '0.85rem',
  },
  checkboxTile: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    border: '1px solid rgba(191, 161, 255, 0.14)',
    background: 'rgba(28, 14, 44, 0.56)',
    fontSize: '0.9rem',
  },
  checkboxTitle: {
    fontWeight: 600,
    color: '#f0e9ff',
    marginBottom: 4,
  },
  checkboxText: {
    fontSize: '0.82rem',
    color: '#c2b3e5',
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
    fontSize: '0.82rem',
    opacity: 0.88,
    color: '#d6c8f6',
  },
  statusCard: {
    padding: '12px 14px',
    borderRadius: 12,
    background: 'rgba(22, 11, 38, 0.86)',
    border: '1px solid rgba(191, 161, 255, 0.14)',
    fontSize: '0.86rem',
    color: '#d8c9f5',
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
    border: '1px solid rgba(191, 161, 255, 0.18)',
    background: 'rgba(28, 14, 44, 0.48)',
    color: '#d0d6ea',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  filterButton: {
    padding: '8px 14px',
    borderRadius: 999,
    border: '1px solid rgba(191, 161, 255, 0.18)',
    background: 'rgba(28, 14, 44, 0.48)',
    color: '#d0d6ea',
    cursor: 'pointer',
    fontSize: '0.85rem',
    transition: 'all 0.2s',
  },
  filterButtonActive: {
    background: 'rgba(138, 92, 255, 0.18)',
    border: '1px solid #8a5cff',
    color: '#cdb6ff',
  },
  lobbyCard: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(33, 17, 52, 0.95), rgba(14, 8, 23, 0.9))',
    border: '1px solid rgba(191, 161, 255, 0.14)',
    transition: 'all 0.2s',
  },
  joinButton: {
    padding: '10px 20px',
    borderRadius: 999,
    border: '1px solid rgba(214, 194, 255, 0.18)',
    background: 'linear-gradient(135deg, #5c33bb, #8a5cff 58%, #b687ff 100%)',
    color: 'white',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: '0.9rem',
    transition: 'all 0.2s',
  },
  lobbyView: {
    marginTop: 8,
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    flex: 1,
    minHeight: 0,
  },
  lobbyHeader: {
    padding: 16,
    borderRadius: 12,
    background: 'linear-gradient(135deg, rgba(92, 51, 187, 0.22), rgba(182, 135, 255, 0.12))',
    border: '1px solid rgba(191, 161, 255, 0.24)',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingsSection: {
    padding: 16,
    borderRadius: 12,
    background: 'rgba(20, 10, 33, 0.68)',
    border: '1px solid rgba(191, 161, 255, 0.14)',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    flex: 1,
  },
  readOnlySetting: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    fontSize: '0.9rem',
  },
  lobbyMetaGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: 10,
  },
  lobbyMetaCard: {
    padding: '10px 12px',
    borderRadius: 10,
    border: '1px solid rgba(191, 161, 255, 0.16)',
    background: 'rgba(33, 17, 52, 0.75)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  lobbyMetaLabel: {
    fontSize: '0.78rem',
    color: '#b9a6df',
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  lobbyMetaValue: {
    fontSize: '0.95rem',
    color: '#f0e8ff',
    fontWeight: 700,
  },
  lockedNote: {
    fontSize: '0.82rem',
    color: '#cdbbe9',
    opacity: 0.88,
  },
  previewList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  previewRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: 14,
    padding: '10px 0',
    borderBottom: '1px solid rgba(191, 161, 255, 0.1)',
    color: '#d7caf5',
  },
  calloutBox: {
    padding: '14px 16px',
    borderRadius: 14,
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(191, 161, 255, 0.12)',
    color: '#c8b8eb',
    fontSize: '0.88rem',
    lineHeight: 1.45,
  },
  actionStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    marginTop: 'auto',
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
