import React, { useState, useEffect } from 'react';
import { MainMenu } from './components/MainMenu.jsx';
import { GameScene } from './components/GameScene.jsx';
import { Tutorial } from './components/Tutorial.jsx';
import { Settings } from './components/Settings.jsx';
import { ArcanaCompendium } from './components/ArcanaCompendium.jsx';
import { CardBalancingToolV2 } from './components/CardBalancingToolV2.jsx';
import { socket } from './game/socket.js';
import { soundManager } from './game/soundManager.js';

export function App() {
  const SETTINGS_KEY = 'arcanaChess.settings';

  const [screen, setScreen] = useState('intro');
  const [gameState, setGameState] = useState(null);
  const [ascendedInfo, setAscendedInfo] = useState(null);
  const [lastArcanaEvent, setLastArcanaEvent] = useState(null);
  const [gameEndOutcome, setGameEndOutcome] = useState(null);
  const [devMode, setDevMode] = useState(false);
  const [globalSettings, setGlobalSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {
      // ignore parse errors and fall back to defaults
    }
    return {
      audio: { master: 0.8, music: 0.5, sfx: 0.8, muted: false },
      graphics: { quality: 'medium', postProcessing: true, shadows: true },
      gameplay: { showLegalMoves: true, highlightLastMove: true },
    };
  });

  // Ensure audio defaults include mute flag if loaded settings are missing it
  useEffect(() => {
    setGlobalSettings((prev) => ({
      ...prev,
      audio: {
        master: prev.audio?.master ?? 0.8,
        music: prev.audio?.music ?? 0.5,
        sfx: prev.audio?.sfx ?? 0.8,
        muted: prev.audio?.muted ?? false,
      },
      graphics: {
        quality: prev.graphics?.quality ?? 'medium',
        postProcessing: prev.graphics?.postProcessing ?? true,
        shadows: prev.graphics?.shadows ?? true,
      },
      gameplay: {
        showLegalMoves: prev.gameplay?.showLegalMoves ?? true,
        highlightLastMove: prev.gameplay?.highlightLastMove ?? true,
      },
    }));
  }, []);

  useEffect(() => {
    const handleGameStarted = (state) => {
      setGameState(state);
      setAscendedInfo(state.ascended ? { gameId: state.id, reason: state.ascensionTrigger } : null);
      setScreen('game');
    };

    const handleGameUpdated = (state) => {
      setGameState(state);
      if (state.ascended && !ascendedInfo) {
        setAscendedInfo({ gameId: state.id, reason: state.ascensionTrigger });
      }
    };

    const handleGameEnded = (outcome) => {
      console.log('Game ended:', outcome);
      setGameEndOutcome(outcome);
      // Show outcome overlay, then return to menu after delay
      setTimeout(() => {
        setGameEndOutcome(null);
        handleBackToMenu();
      }, 5000);
    };

    const handleAscended = (payload) => {
      setAscendedInfo(payload);
    };

    const handleArcanaTriggered = (payload) => {
      setLastArcanaEvent({ ...payload, at: Date.now() });
    };

    socket.on('gameStarted', handleGameStarted);
    socket.on('gameUpdated', handleGameUpdated);
    socket.on('gameEnded', handleGameEnded);
    socket.on('ascended', handleAscended);
    socket.on('arcanaTriggered', handleArcanaTriggered);

    return () => {
      socket.off('gameStarted', handleGameStarted);
      socket.off('gameUpdated', handleGameUpdated);
      socket.off('gameEnded', handleGameEnded);
      socket.off('ascended', handleAscended);
      socket.off('arcanaTriggered', handleArcanaTriggered);
    };
  }, [ascendedInfo]);

  // Global music routing: play menu music on any menu-like screen; stop when entering gameplay/tutorial
  useEffect(() => {
    const menuScreens = ['intro', 'main-menu', 'host-game', 'join-game', 'settings', 'arcana', 'card-balancing'];
    const isMenu = menuScreens.includes(screen);
    if (isMenu) {
      soundManager.playMusic('music:menu', { crossfadeMs: 600 });
    } else {
      soundManager.stopMusic({ fadeMs: 400 });
    }
  }, [screen]);

  const handleSettingsChange = (patch) => {
    setGlobalSettings((prev) => {
      const next = {
        ...prev,
        ...patch,
      };
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      } catch (e) {
        // ignore storage errors (e.g., private mode)
      }
      return next;
    });
  };

  const handleBackToMenu = () => {
    // If there's an active game, forfeit it
    if (gameState && gameState.status === 'ongoing') {
      socket.emit('forfeitGame', {}, (res) => {
        // Game forfeited, clean up state
        setGameState(null);
        setGameEndOutcome(null);
        setAscendedInfo(null);
        setLastArcanaEvent(null);
        setScreen('main-menu');
      });
    } else {
      // No active game, just return to menu
      setGameState(null);
      setGameEndOutcome(null);
      setAscendedInfo(null);
      setLastArcanaEvent(null);
      setScreen('main-menu');
    }
  };

  const IntroScreen = ({ onContinue }) => {
    return (
      <div style={introStyles.container}>
        <div style={introStyles.backdrop} />
        <div style={introStyles.card}>
          <div style={introStyles.logo}>Arcana Chess</div>
          <div style={introStyles.tagline}>Ascend. Command. Checkmate.</div>
          <div style={introStyles.meta}>Immersive 3D chess with magical Arcana.</div>
          <button style={introStyles.cta} onClick={onContinue}>
            Click to continue ▸
          </button>
          <div style={introStyles.hint}>Audio will start after you continue.</div>
        </div>
        <div style={introStyles.glow1} />
        <div style={introStyles.glow2} />
      </div>
    );
  };

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#05060a', color: 'white' }}>
      {screen === 'intro' && (
        <IntroScreen
          onContinue={() => {
            try { soundManager.setEnabled(true); } catch (e) {}
            setScreen('main-menu');
          }}
        />
      )}
      {screen === 'main-menu' && (
        <MainMenu
          mode="root"
          onPlayOnlineHost={() => setScreen('host-game')}
          onPlayOnlineJoin={() => setScreen('join-game')}
          onTutorial={() => setScreen('tutorial')}
          onViewArcana={() => setScreen('arcana')}
          onSettings={() => setScreen('settings')}
          onCardBalancing={() => setScreen('card-balancing')}
          devMode={devMode}
          onToggleDevMode={() => setDevMode(!devMode)}
        />
      )}
      {screen === 'host-game' && (
        <MainMenu
          mode="host"
          onBack={() => setScreen('main-menu')}
        />
      )}
      {screen === 'join-game' && (
        <MainMenu
          mode="join"
          onBack={() => setScreen('main-menu')}
        />
      )}
      {screen === 'tutorial' && (
        <Tutorial onBack={() => setScreen('main-menu')} />
      )}
      {screen === 'settings' && (
        <Settings
          settings={globalSettings}
          onChange={handleSettingsChange}
          onBack={() => setScreen('main-menu')}
        />
      )}
      {screen === 'arcana' && (
        <ArcanaCompendium onBack={() => setScreen('main-menu')} />
      )}
      {screen === 'card-balancing' && (
        <CardBalancingToolV2 onBack={() => setScreen('main-menu')} />
      )}
      {screen === 'game' && (
        <GameScene
          gameState={gameState}
          settings={globalSettings}
          ascendedInfo={ascendedInfo}
          lastArcanaEvent={lastArcanaEvent}
          gameEndOutcome={gameEndOutcome}
          onBackToMenu={handleBackToMenu}
          onSettingsChange={handleSettingsChange}
        />
      )}
    </div>
  );
}

const introStyles = {
  container: {
    position: 'relative',
    width: '100vw',
    height: '100vh',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'radial-gradient(circle at 20% 20%, #182033, #080a12)',
    color: '#e5e9f0',
    fontFamily: 'system-ui, sans-serif',
  },
  backdrop: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(135deg, rgba(76,111,255,0.08), rgba(143,148,251,0.04))',
    mixBlendMode: 'screen',
  },
  card: {
    position: 'relative',
    padding: '32px 38px',
    borderRadius: 18,
    background: 'rgba(5, 6, 10, 0.82)',
    border: '1px solid rgba(255,255,255,0.06)',
    boxShadow: '0 30px 80px rgba(0,0,0,0.65)',
    textAlign: 'center',
    zIndex: 2,
  },
  logo: {
    fontSize: '2.6rem',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  tagline: {
    fontSize: '1.2rem',
    color: '#c7d2fe',
    marginBottom: 8,
  },
  meta: {
    fontSize: '0.95rem',
    color: 'rgba(229,233,240,0.75)',
    marginBottom: 24,
  },
  cta: {
    padding: '12px 22px',
    borderRadius: 999,
    border: 'none',
    background: 'linear-gradient(135deg, #4c6fff, #8f94fb)',
    color: '#fdfdfd',
    fontWeight: 700,
    letterSpacing: '0.04em',
    cursor: 'pointer',
    fontSize: '1rem',
    boxShadow: '0 12px 30px rgba(76,111,255,0.35)',
  },
  hint: {
    marginTop: 10,
    fontSize: '0.85rem',
    color: 'rgba(229,233,240,0.65)',
  },
  glow1: {
    position: 'absolute',
    width: 320,
    height: 320,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(76,111,255,0.35), rgba(76,111,255,0))',
    top: '12%',
    left: '14%',
    filter: 'blur(40px)',
    zIndex: 1,
  },
  glow2: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(143,148,251,0.3), rgba(143,148,251,0))',
    bottom: '10%',
    right: '12%',
    filter: 'blur(45px)',
    zIndex: 1,
  },
};
