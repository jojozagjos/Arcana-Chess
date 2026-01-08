import React, { useState, useEffect } from 'react';
import { MainMenu } from './components/MainMenu.jsx';
import { GameScene } from './components/GameScene.jsx';
import { Tutorial } from './components/Tutorial.jsx';
import { Settings } from './components/Settings.jsx';
import { ArcanaCompendium } from './components/ArcanaCompendium.jsx';
import { CardBalancingToolV2 } from './components/CardBalancingToolV2.jsx';
import { IntroScreen } from './components/IntroScreen.jsx';
import { socket } from './game/socket.js';
import { soundManager } from './game/soundManager.js';

export function App() {
  const SETTINGS_KEY = 'arcanaChess.settings';

  const [screen, setScreen] = useState('intro');
  const [audioReady, setAudioReady] = useState(false);
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
    const menuScreens = ['main-menu', 'host-game', 'join-game', 'settings', 'arcana', 'card-balancing'];
    const isMenu = menuScreens.includes(screen);
    if (isMenu && audioReady && !globalSettings.audio?.muted) {
      soundManager.playMusic('music:menu', { crossfadeMs: 600 });
    } else if (screen === 'game' || screen === 'tutorial' || screen === 'intro') {
      // Stop menu music when entering game/tutorial/intro - those screens manage their own music
      soundManager.stopMusic({ fadeMs: 200 });
    }
  }, [screen, audioReady, globalSettings.audio?.muted]);

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

  // Using external IntroScreen component (from ./components/IntroScreen.jsx)

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#05060a', color: 'white' }}>
      {screen === 'intro' && (
        <IntroScreen
          onContinue={() => {
            try { soundManager.setEnabled(true); } catch (e) {}
            setAudioReady(true);
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

// Intro styling and layout moved into the component file for the particle intro.
