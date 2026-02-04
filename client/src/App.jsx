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

  const menuScreens = ['main-menu', 'host-game', 'join-game', 'settings', 'arcana', 'card-balancing'];

  const [screen, setScreen] = useState('intro');
  const [audioReady, setAudioReady] = useState(false);
  const [gameState, setGameState] = useState(null);
  const [ascendedInfo, setAscendedInfo] = useState(null);
  const [lastArcanaEvent, setLastArcanaEvent] = useState(null);
  const [gameEndOutcome, setGameEndOutcome] = useState(null);
  const [devMode, setDevMode] = useState(false);
  const [quickMatchStatus, setQuickMatchStatus] = useState('');
  const [quickMatchLoading, setQuickMatchLoading] = useState(false);
  const [quickJoinedLobby, setQuickJoinedLobby] = useState(null);
  const [menuFadeIn, setMenuFadeIn] = useState(false);
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
      display: { fullscreen: false },
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
      display: {
        fullscreen: prev.display?.fullscreen ?? false,
      },
    }));
  }, []);

  // Fullscreen state synchronization
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFullscreen = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      
      setGlobalSettings((prev) => {
        if (prev.display?.fullscreen !== isFullscreen) {
          const updated = {
            ...prev,
            display: { ...prev.display, fullscreen: isFullscreen },
          };
          localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, [SETTINGS_KEY]);

  useEffect(() => {
    const handleGameStarted = (state) => {
      // New game starting: clear any previous end-outcome and show game
      setGameEndOutcome(null);
      setGameState(state);
      setAscendedInfo(state.ascended ? { gameId: state.id, reason: state.ascensionTrigger } : null);
      setScreen('game');
    };

    const handleGameUpdated = (state) => {
      // console.log('[CLIENT] Received gameUpdated event:', state);
      setGameState(state);
      if (state.ascended && !ascendedInfo) {
        setAscendedInfo({ gameId: state.id, reason: state.ascensionTrigger });
      }
    };

    const handleGameEnded = (outcome) => {
      console.log('Game ended:', outcome);
      // Show outcome overlay and let the player decide when to return to menu.
      // No automatic return to menu — user must click the Return button.
      setGameEndOutcome(outcome);
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

      // Handle fullscreen changes
      if (patch.display?.fullscreen !== undefined && patch.display.fullscreen !== prev.display?.fullscreen) {
        toggleFullscreen(patch.display.fullscreen);
      }

      // Apply audio changes immediately
      if (patch.audio) {
        soundManager.setEnabled(!next.audio.muted);
        soundManager.setMasterVolume(next.audio.master ?? 1.0);
        soundManager.setMusicVolume(next.audio.music ?? 1.0);
        soundManager.setSfxVolume(next.audio.sfx ?? 1.0);
      }

      return next;
    });
  };

  const toggleFullscreen = async (enable) => {
    try {
      if (enable) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
        } else if (elem.mozRequestFullScreen) {
          await elem.mozRequestFullScreen();
        } else if (elem.msRequestFullscreen) {
          await elem.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Fullscreen toggle error:', err);
    }
  };

  // Fade-in main menu when becoming active (safe, non-blocking)
  useEffect(() => {
    if (screen === 'main-menu') {
      setMenuFadeIn(false);
      // trigger fade in on next frame
      requestAnimationFrame(() => setTimeout(() => setMenuFadeIn(true), 20));
    } else {
      setMenuFadeIn(false);
    }
  }, [screen]);

  const handleBackToMenu = () => {
    // If there's an active game, forfeit it
    if (gameState && gameState.status === 'ongoing') {
      socket.emit('forfeitGame', {}, (res) => {
        // Game forfeited, clean up state
        setGameState(null);
        setGameEndOutcome(null);
        setAscendedInfo(null);
        setLastArcanaEvent(null);
        setQuickMatchStatus('');
        setQuickMatchLoading(false);
        setScreen('main-menu');
      });
      return;
    }

    // If player is on the post-match screen, notify server so rematch can be
    // cancelled for the other player instead of leaving them waiting.
    if (gameState && gameState.status === 'finished') {
      socket.emit('leavePostMatch', {}, (res) => {
        // Ignore server errors here; proceed to clear client state
        setGameState(null);
        setGameEndOutcome(null);
        setAscendedInfo(null);
        setLastArcanaEvent(null);
        setQuickMatchStatus('');
        setQuickMatchLoading(false);
        setScreen('main-menu');
      });
      return;
    }

    // Default fallback: just return to menu
    setGameState(null);
    setGameEndOutcome(null);
    setAscendedInfo(null);
    setLastArcanaEvent(null);
    setQuickMatchStatus('');
    setQuickMatchLoading(false);
    setScreen('main-menu');
  };

  // Using external IntroScreen component (from ./components/IntroScreen.jsx)

  return (
    <div style={{ width: '100vw', height: '100vh', backgroundColor: '#05060a', color: 'white' }}>
      {screen === 'intro' && (
        <IntroScreen
          onContinue={() => {
            try { soundManager.setEnabled(!globalSettings.audio?.muted); } catch (e) {}
            setAudioReady(true);
            setScreen('main-menu');
          }}
        />
      )}
      {screen === 'main-menu' && (
        <div style={{ width: '100%', height: '100%', opacity: menuFadeIn ? 1 : 0, transition: 'opacity 600ms ease', display: 'flex' }}>
          <MainMenu
            mode="root"
            onPlayOnlineHost={() => setScreen('host-game')}
            onPlayOnlineJoin={() => setScreen('join-game')}
            onQuickMatch={async () => {
              try {
                if (quickMatchLoading) return; // prevent spamming
                setQuickMatchLoading(true);
                const MIN_SEARCH_MS = 1500; // ensure searching text stays visible briefly
                setQuickMatchStatus('Searching for open public games...');
                const start = Date.now();
                socket.emit('listLobbies', {}, (res) => {
                  const elapsed = Date.now() - start;
                  const finishAndClear = (statusMsg, clearAfterMs = 3000) => {
                    setQuickMatchStatus(statusMsg);
                    setTimeout(() => {
                      setQuickMatchStatus('');
                      setQuickMatchLoading(false);
                    }, clearAfterMs);
                  };

                  const run = () => {
                    if (res && res.ok && res.lobbies && res.lobbies.length > 0) {
                      const availableLobby = res.lobbies.find(
                        (lobby) => !lobby.isPrivate && lobby.status === 'waiting' && lobby.playerCount < 2
                      );
                      if (availableLobby) {
                        setQuickMatchStatus('Found open game — joining...');
                        socket.emit('joinLobby', { lobbyId: availableLobby.id }, (joinRes) => {
                          if (joinRes && joinRes.ok) {
                            setQuickMatchStatus('');
                            // store joined lobby and navigate to join screen so the lobby UI is shown
                            setQuickJoinedLobby(joinRes.lobby);
                            setScreen('join-game');
                          } else {
                            console.error('Failed to join lobby:', joinRes?.error);
                            finishAndClear('Failed to join the found game.');
                          }
                        });
                      } else {
                        finishAndClear('No open public games found.');
                      }
                    } else {
                      finishAndClear('No open public games found.');
                    }
                  };
                  const delay = Math.max(0, MIN_SEARCH_MS - elapsed);
                  if (delay > 0) setTimeout(run, delay); else run();
                });
              } catch (err) {
                console.error('Quick match error:', err);
                setQuickMatchStatus('Error searching for games.');
                setTimeout(() => {
                  setQuickMatchStatus('');
                  setQuickMatchLoading(false);
                }, 3000);
              }
            }}
            quickMatchStatus={quickMatchStatus}
            quickMatchLoading={quickMatchLoading}
            onTutorial={() => setScreen('tutorial')}
            onViewArcana={() => setScreen('arcana')}
            onSettings={() => setScreen('settings')}
            onCardBalancing={() => setScreen('card-balancing')}
            devMode={devMode}
            onToggleDevMode={() => setDevMode(!devMode)}
          />
        </div>
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
          initialLobby={quickJoinedLobby}
          onBack={() => { setQuickJoinedLobby(null); setScreen('main-menu'); }}
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
