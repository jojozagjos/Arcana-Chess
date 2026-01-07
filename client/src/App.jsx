import React, { useState, useEffect } from 'react';
import { MainMenu } from './components/MainMenu.jsx';
import { GameScene } from './components/GameScene.jsx';
import { Tutorial } from './components/Tutorial.jsx';
import { Settings } from './components/Settings.jsx';
import { ArcanaCompendium } from './components/ArcanaCompendium.jsx';
import { CardBalancingToolV2 } from './components/CardBalancingToolV2.jsx';
import { socket } from './game/socket.js';

export function App() {
  const SETTINGS_KEY = 'arcanaChess.settings';

  const [screen, setScreen] = useState('main-menu');
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
      audio: { master: 0.8, music: 0.5, sfx: 0.8 },
      graphics: { quality: 'medium', postProcessing: true, shadows: true },
      gameplay: { showLegalMoves: true, highlightLastMove: true },
    };
  });

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

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#05060a', color: 'white' }}>
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
