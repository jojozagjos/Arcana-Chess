import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { socket } from '../game/socket.js';
import { soundManager } from '../game/soundManager.js';
import { createDefaultActiveEffectsState } from '../game/activeEffectsState.js';
import { getArcanaDefinition, listSortedArcanaDefinitions } from '../game/arcanaCatalog.js';
import { getArcanaTargetLabel } from '../../../shared/arcana/arcanaContracts.js';
import { ArcanaCard } from './ArcanaCard.jsx';
import { ChessPiece } from './ChessPiece.jsx';
import { getArcanaEnhancedMoves } from '../game/arcanaMovesHelper.js';
import { simulateArcanaEffect, needsTargetSquare, validateArcanaTarget, getValidTargetSquares, canUseCard } from '../game/arcana/arcanaSimulation.js';
import { ArcanaVisualHost } from '../game/arcana/ArcanaVisualHost.jsx';
import { GhostPiece, CameraController, GrayscaleEffect, squareToPosition } from '../game/arcana/sharedHelpers.jsx';
import { getCutsceneCard } from '../game/arcana/cutsceneDefinitions.js';
import { ArcanaStudioRuntimeHost } from '../game/arcana/studio/ArcanaStudioRuntimeHost.jsx';
import { createArcanaStudioRuntimeSession, expandStudioRuntimePlaybackQueue } from '../game/arcana/studio/arcanaStudioRuntime.js';
import { scheduleArcanaStudioAudio, scheduleArcanaStudioEvents, normalizeArcanaStudioEventActions } from '../game/arcana/studio/arcanaStudioRuntime.js';
import { getArcanaEffectDuration } from '../game/arcana/arcanaTimings.js';
import { getRarityColor, getLogColor } from '../game/arcanaHelpers.js';
import { PieceSelectionDialog } from './PieceSelectionDialog.jsx';
import * as THREE from 'three';

// Helper to get adjacent squares (for poison touch)
function getAdjacentSquares(square) {
  const file = square.charCodeAt(0) - 97;
  const rank = parseInt(square[1]);
  const adjacent = [];
  
  for (let df = -1; df <= 1; df++) {
    for (let dr = -1; dr <= 1; dr++) {
      if (df === 0 && dr === 0) continue;
      const newFile = file + df;
      const newRank = rank + dr;
      if (newFile >= 0 && newFile < 8 && newRank >= 1 && newRank <= 8) {
        adjacent.push(`${String.fromCharCode(97 + newFile)}${newRank}`);
      }
    }
  }
  return adjacent;
}

// Parse FEN into piece descriptors used by the balancing tool renderer
function parseFenPieces(fenStr) {
  if (!fenStr) return [];
  const [placement] = fenStr.split(' ');
  const rows = placement.split('/');
  const pieces = [];
  for (let rank = 0; rank < 8; rank++) {
    let file = 0;
    for (const ch of rows[rank]) {
      if (/[1-8]/.test(ch)) {
        file += parseInt(ch, 10);
      } else {
        const isWhite = ch === ch.toUpperCase();
        const type = ch.toLowerCase();
        const x = file - 3.5;
        const z = rank - 3.5;
        const fileChar = 'abcdefgh'[file];
        const rankNum = 8 - rank;
        const square = `${fileChar}${rankNum}`;
        pieces.push({ type, isWhite, square, targetPosition: [x, 0.15, z], uid: `${square}-${type}` });
        file += 1;
      }
    }
  }
  return pieces;
}

const TEST_SCENARIOS = {
  default: { name: 'Starting Position', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  midgame: { name: 'Midgame', fen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQK2R w KQkq - 4 5' },
  endgame: { name: 'Endgame', fen: '4k3/8/8/8/8/8/4P3/4K2R w K - 0 1' },
  pawnPromotion: { name: 'Pawn Promotion Test', fen: '4k3/4P3/8/8/8/8/8/4K3 w - - 0 1' },
  checkScenario: { name: 'King in Check', fen: 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3' },
  crowdedBoard: { name: 'Crowded Center', fen: 'rnbqkbnr/pppppppp/8/8/3PP3/3NN3/PPP2PPP/R1BQKB1R b KQkq - 0 1' },
};

export function CardBalancingToolV2({ onBack }) {
  const [selectedCardId, setSelectedCardId] = useState(null);
  // Missing state initializations used throughout the tool
  const [fen, setFen] = useState(TEST_SCENARIOS.default.fen);
  const [chess, setChess] = useState(() => new Chess(TEST_SCENARIOS.default.fen));
  const [scenario, setScenario] = useState('default');
  const [playerColor, setPlayerColor] = useState('white');
  const [effectsModule, setEffectsModule] = useState(null);
  const [logMessages, setLogMessages] = useState([]);
  const [activeEffects, setActiveEffects] = useState(() => createDefaultActiveEffectsState());
  const [pawnShields, setPawnShields] = useState({ w: null, b: null });
  const [shieldTurnCounter, setShieldTurnCounter] = useState({ w: 0, b: 0 });
  const [lastMove, setLastMove] = useState(null);
  const [capturedByColor, setCapturedByColor] = useState({ w: [], b: [] });
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [targetSquare, setTargetSquare] = useState(null);
  const [targetingMode, setTargetingMode] = useState(false);
  const [customParams, setCustomParams] = useState({});
      
  const [visualEffects, setVisualEffects] = useState([]);
  const [cutsceneActive, setCutsceneActive] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [grayscaleIntensity, setGrayscaleIntensity] = useState(0);
  // Cutscene runtime refs
  const controlsRef = useRef();
  
  // Move history for testing
  const [moveHistory, setMoveHistory] = useState([]);
  const [legalTargets, setLegalTargets] = useState([]);
  const [validTargetSquares, setValidTargetSquares] = useState([]); // Squares that are valid targets for the current card
  
  // Multiplayer test
  const [multiplayerMode, setMultiplayerMode] = useState(false);
  const [player2Perspective, setPlayer2Perspective] = useState(false);
  
  // Card validation checklist
  const [validationChecklist, setValidationChecklist] = useState({
    logic: false,
    visuals: false,
    sound: false,
    cutscene: false,
    server: false,
  });
  
  // Server validation state
  const [serverTestActive, setServerTestActive] = useState(false);
  const [serverTestResult, setServerTestResult] = useState(null);
  
  // Active visual arcana (for rendering cutscenes/effects)
  const [activeVisualArcana, setActiveVisualArcana] = useState(null);
  const [studioRuntimeSession, setStudioRuntimeSession] = useState(null);
  const [studioPieceMotions, setStudioPieceMotions] = useState({});
  const studioRuntimeQueueRef = useRef([]);
  const studioCameraRuntimeActive = Boolean(
    studioRuntimeSession
    && (studioRuntimeSession.card?.tracks?.camera || []).some((track) => (track?.keys || []).length > 0)
  );
  
  // Highlighted squares for Line of Sight, Vision, Map Fragments, etc
  const [highlightedSquares, setHighlightedSquares] = useState([]);
  const [highlightedArcana, setHighlightedArcana] = useState(null);
  const [highlightColor, setHighlightColor] = useState('#88c0d0');
  const timeoutsRef = useRef([]);
  const firedRuntimeVfxRef = useRef(new Map());
  
  // Metamorphosis dialog state
  const [metamorphosisDialog, setMetamorphosisDialog] = useState(null);

  // Track piece state with stable UIDs so move animations can interpolate
  const uidCounterRef = useRef(0);
  const [piecesState, setPiecesState] = useState(() => {
    const initial = parseFenPieces(fen);
    return initial.map((p) => {
      uidCounterRef.current += 1;
      return { ...p, uid: `${p.square}-${p.type}-${uidCounterRef.current}` };
    });
  });

  // Show when a card/interaction ends the turn (Badge in UI)
  const [turnEndInfo, setTurnEndInfo] = useState(null);

  const trackTimeout = (callback, delayMs) => {
    const id = setTimeout(callback, delayMs);
    timeoutsRef.current.push(id);
    return id;
  };

  const clearManagedTimeouts = () => {
    timeoutsRef.current.forEach((id) => clearTimeout(id));
    timeoutsRef.current = [];
  };

  const clearPreviewState = () => {
    setStudioRuntimeSession(null);
    setCutsceneActive(false);
    setCameraTarget(null);
    setGrayscaleIntensity(0);
  };

  const cinematicMotionBySquare = useMemo(() => {
    if (!activeVisualArcana?.arcanaId) return new Map();
    const params = activeVisualArcana.params || {};
    const squares = new Map();
    const addSquare = (sq, profile, intensity = 0.16) => {
      if (!sq || typeof sq !== 'string') return;
      if (!squares.has(sq)) {
        squares.set(sq, {
          active: true,
          profile,
          intensity,
          phase: (sq.charCodeAt(0) * 11 + parseInt(sq[1] || '1', 10) * 19) % 31,
        });
      }
    };

    if (activeVisualArcana.arcanaId === 'edgerunner_overdrive') {
      addSquare(params.targetSquare || params.square, 'overdrive', 0.24);
      if (Array.isArray(params.dashPath)) {
        params.dashPath.forEach((sq, i) => addSquare(sq, 'overdrive', Math.max(0.12, 0.2 - i * 0.02)));
      }
    } else if (activeVisualArcana.arcanaId === 'breaking_point') {
      addSquare(params.targetSquare || params.square || params.shatteredSquare, 'fracture', 0.22);
      if (Array.isArray(params.displaced)) {
        params.displaced.forEach((d) => {
          addSquare(d?.from, 'fracture', 0.14);
          addSquare(d?.to, 'fracture', 0.16);
        });
      }
    }
    return squares;
  }, [activeVisualArcana]);

  const selectedCard = useMemo(() => {
    return getArcanaDefinition(selectedCardId);
  }, [selectedCardId]);

  const sortedCards = useMemo(() => listSortedArcanaDefinitions(), []);

  useEffect(() => {
    try {
      const c = new Chess(fen);
      setChess(c);
    } catch (err) {
      addLog(`Invalid FEN: ${err.message}`, 'error');
    }
  }, [fen]);

  // Load effects module (shared with GameScene)
  useEffect(() => {
    import('../game/arcana/arcanaVisuals.jsx')
      .then(m => setEffectsModule(m))
      .catch((err) => {
        console.warn('Failed to load arcanaVisuals.jsx in Balancing Tool, continuing without visuals', err);
        setEffectsModule({});
      });
  }, []);

  const addLog = (message, type = 'info') => {
    setLogMessages(prev => [...prev, { message, type, timestamp: Date.now() }].slice(-30));
  };

  const changeScenario = (scenarioKey) => {
    setScenario(scenarioKey);
    setFen(TEST_SCENARIOS[scenarioKey].fen);
    resetTest();
    addLog(`Loaded scenario: ${TEST_SCENARIOS[scenarioKey].name}`, 'info');
  };

  const resetTest = () => {
    clearManagedTimeouts();
    clearPreviewState();
    setSelectedSquare(null);
    setTargetSquare(null);
    setTargetingMode(false);
    setCustomParams({});
    setPawnShields({ w: null, b: null });
    setShieldTurnCounter({ w: 0, b: 0 });
    setActiveEffects(createDefaultActiveEffectsState());
    setVisualEffects([]);
    setMoveHistory([]);
    setLastMove(null);
    setCapturedByColor({ w: [], b: [] });
    setLegalTargets([]);
    setCutsceneActive(false);
    setGrayscaleIntensity(0);
    setActiveVisualArcana(null);
    setHighlightedSquares([]);
    setHighlightedArcana(null);
    setHighlightColor('#88c0d0');
    setValidTargetSquares([]);
    setValidationChecklist({ logic: false, visuals: false, sound: false, cutscene: false, server: false });
    setServerTestActive(false);
    setServerTestResult(null);
    addLog('Test reset', 'info');
  };

  useEffect(() => () => {
    clearManagedTimeouts();
    clearPreviewState();
  }, []);

  // Server validation: creates a test game, applies arcana, verifies behavior
  const SERVER_TEST_TIMEOUT_MS = 5000; // make configurable later via settings
  const testWithServer = async () => {
    if (!selectedCard) {
      addLog('Select a card first to test with server', 'warning');
      return;
    }

    setServerTestActive(true);
    addLog(`Testing ${selectedCard.name} with server...`, 'info');

    try {
      // Build request payload for REST test endpoint with complete game state
      const payload = {
        cardId: selectedCard.id,
        fen: chess.fen(),
        params: targetSquare ? { targetSquare } : (Object.keys(customParams).length ? customParams : {}),
        playerColor,
        activeEffects,
        pawnShields,
        lastMove,
        capturedByColor,
      };
      // Always include lastMove for cards that depend on it (temporal_echo, time_travel, berserker_rage, etc.)
      if (lastMove) payload.moveResult = lastMove;

      // POST to /api/test-card so the dev tool uses canonical server logic
      const resp = await fetch('/api/test-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      let json;
      try {
        json = await resp.json();
      } catch {
        json = { ok: false, error: `Invalid server response (HTTP ${resp.status})` };
      }
      setServerTestActive(false);

      if (json.ok) {
        addLog(`✓ Server validation passed: ${selectedCard.name}`, 'success');
        setServerTestResult({ success: true, data: json });
        // Apply returned afterState to local tool for accurate preview
        if (json.afterState) {
          if (json.afterState.activeEffects) setActiveEffects(json.afterState.activeEffects);
          if (json.afterState.pawnShields) setPawnShields(json.afterState.pawnShields);
          if (json.afterState.lastMove) setLastMove(json.afterState.lastMove);
          if (json.afterState.capturedByColor) setCapturedByColor(json.afterState.capturedByColor);
          if (json.afterState.fen) {
            const newChess = new Chess(json.afterState.fen);
            setChess(newChess);
            setFen(json.afterState.fen);
          }
        }
        setValidationChecklist(prev => ({ ...prev, server: true }));
      } else {
        addLog(`✗ Server validation failed: ${json.error || 'Unknown'}`, 'error');
        setServerTestResult({ success: false, error: json.error || 'Unknown' });
      }

    } catch (err) {
      setServerTestActive(false);
      addLog(`Server test error: ${err.message}`, 'error');
      setServerTestResult({ success: false, error: err.message });
    }
  };

  const testCard = async () => {
    if (!selectedCard) return;

    // Play card draw sound first (when you select/activate the card)
    try {
      soundManager.play('cardDraw');
    } catch (err) {
      addLog(`Sound error: ${err.message}`, 'warning');
    }

    // Play card sound if present (soundId)
    // Note: some cards (e.g. focus_fire) should not play on activation — only on capture
    const selectedCardSoundId = selectedCard.soundId;
    if (selectedCardSoundId && selectedCard.id !== 'focus_fire') {
      try {
        soundManager.play(selectedCardSoundId);
        setValidationChecklist(prev => ({ ...prev, sound: true }));
      } catch (err) {
        addLog(`Sound error: ${err.message}`, 'warning');
      }
    }

    // Check if card needs a target
    if (needsTargetSquare(selectedCard.id)) {
      const colorChar = playerColor === 'white' ? 'w' : 'b';
      const gameStateForTargeting = { 
        activeEffects: activeEffects || {},
        pawnShields
      };
      
      // Get valid target squares for this card
      const validSquares = getValidTargetSquares(chess, selectedCard.id, colorChar, gameStateForTargeting);
      setValidTargetSquares(validSquares);
      
      if (validSquares.length === 0) {
        addLog(`No valid targets for ${selectedCard.name}`, 'error');
        return;
      }
      
      setTargetingMode(true);
      setTargetSquare(null);
      
      const targetDescription = getArcanaTargetLabel(selectedCard.id) || 'target';
      
      addLog(`Select a ${targetDescription} for ${selectedCard.name} (${validSquares.length} valid targets highlighted)`, 'info');
    } else {
      // For cards that don't need targets, check if they can be used
      const colorChar = playerColor === 'white' ? 'w' : 'b';
      const gameStateForUsability = {
        activeEffects: activeEffects || {},
        pawnShields,
        capturedByColor
      };
      
      if (!canUseCard(selectedCard.id, gameStateForUsability, colorChar)) {
        let errorMsg = `Cannot use ${selectedCard.name}`;
        if (selectedCard.id === 'necromancy') {
          errorMsg = 'No captured pawns to revive';
        } else if (selectedCard.id === 'astral_rebirth') {
          errorMsg = 'No captured pieces to revive';
        }
        addLog(errorMsg, 'error');
        return;
      }
      
      await applyCardEffectWithServer(selectedCard, {}, colorChar);
    }
  };

  // Server-validated card application - ensures 1:1 game behavior with fallback to client simulation
  const applyCardEffectWithServer = async (card, params, colorChar) => {
    setServerTestActive(true);
    addLog(`Applying ${card.name} via server...`, 'info');

    let timeoutId = null;
    try {
      const payload = {
        cardId: card.id,
        fen: chess.fen(),
        params: params || {},
        playerColor: colorChar === 'w' ? 'white' : 'black',
        activeEffects,
        pawnShields,
        lastMove,
      };
      if (lastMove) payload.moveResult = lastMove;

      // Create abort controller for timeout
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), SERVER_TEST_TIMEOUT_MS);

      const resp = await fetch('/api/test-card', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      let json;
      try {
        json = await resp.json();
      } catch {
        json = { ok: false, error: `Invalid server response (HTTP ${resp.status})` };
      }

      if (json.ok) {
        addLog(`✓ ${card.name} applied successfully (server)`, 'success');

        // If server provided explicit applied params (e.g. legalMoves for line_of_sight),
        // prefer those for client-side highlights/visuals so the dev tool matches server.
        const appliedParams = (json.applied && json.applied[0] && json.applied[0].params) ? json.applied[0].params : params || {};
        const studioCard = getCutsceneCard(card.id);
        const hasStudioTimeline = Boolean(studioCard && (
          (studioCard.tracks?.camera || []).some((track) => (track?.keys || []).length > 0)
          || (studioCard.tracks?.objects || []).some((track) => (track?.keys || []).length > 0)
          || (studioCard.tracks?.events || []).some((track) => (track?.keys || []).length > 0)
          || (studioCard.tracks?.sounds || []).some((track) => (track?.keys || []).some((key) => typeof key?.soundId === 'string' && key.soundId.trim().length > 0))
        ));
        const shouldDelayServerState = Boolean(card.visual?.cutscene || hasStudioTimeline);
        const cutsceneDelayMs = shouldDelayServerState
          ? Math.max(
              getArcanaEffectDuration(card.id) || 0,
              createArcanaStudioRuntimeSession(studioCard, { ...appliedParams, fen: chess.fen() }).durationMs || 0,
            )
          : 0;

        const applyServerState = () => {
          if (json.afterState) {
            if (json.afterState.activeEffects) setActiveEffects(json.afterState.activeEffects);
            if (json.afterState.pawnShields) setPawnShields(json.afterState.pawnShields);
            if (json.afterState.lastMove) setLastMove(json.afterState.lastMove);
            if (json.afterState.capturedByColor) setCapturedByColor(json.afterState.capturedByColor);
            if (json.afterState.fen) {
              const newChess = new Chess(json.afterState.fen);
              setChess(newChess);
              setFen(json.afterState.fen);
            }
          }
          setValidationChecklist(prev => ({ ...prev, server: true, logic: true }));
        };

        // Reveal-style arcana should update highlighted squares in the balancing tool
        switch (card.id) {
          case 'line_of_sight': {
            const squares = appliedParams.legalMoves || [];
            setHighlightedSquares(Array.isArray(squares) ? squares : []);
            setHighlightedArcana('line_of_sight');
            setHighlightColor('#88c0d0');
            trackTimeout(() => { setHighlightedSquares([]); setHighlightedArcana(null); }, 6000);
            break;
          }
          case 'map_fragments': {
            const squares = appliedParams.predictedSquares || [];
            setHighlightedSquares(Array.isArray(squares) ? squares : []);
            setHighlightedArcana('map_fragments');
            setHighlightColor('#bf616a');
            trackTimeout(() => { setHighlightedSquares([]); setHighlightedArcana(null); }, 6000);
            break;
          }
          case 'threat_sight':
          case 'quiet_thought': {
            const squares = appliedParams.threats || [];
            setHighlightedSquares(Array.isArray(squares) ? squares : []);
            setHighlightedArcana('threat_sight');
            setHighlightColor('#ff4444');
            trackTimeout(() => { setHighlightedSquares([]); setHighlightedArcana(null); }, 6000);
            break;
          }
          case 'vision': {
            const squares = appliedParams.moves || [];
            if (Array.isArray(squares) && squares.length) {
              setHighlightedSquares(squares);
              setHighlightColor('#bf616a');
              trackTimeout(() => setHighlightedSquares([]), 6000);
            }
            break;
          }
          default:
            break;
        }

        // Trigger visuals/sounds using the resolved params
        triggerCardVisualsAndSounds(card, appliedParams, colorChar);

        if (json.afterState && shouldDelayServerState && cutsceneDelayMs > 0) {
          trackTimeout(applyServerState, cutsceneDelayMs);
        } else {
          applyServerState();
        }
      } else {
        addLog(`✗ Server validation failed: ${json.error || 'Unknown'}`, 'error');
        setServerTestResult({ success: false, error: json.error || 'Unknown' });
      }
    } catch (err) {
      setServerTestActive(false);
      // Server unavailable - fall back to client-side simulation
      addLog(`⚠ Server unavailable, using client simulation for ${card.name}`, 'warning');
      setValidationChecklist(prev => ({ ...prev, server: false }));
      
      // Fall back to client-side simulation
      applyCardEffect(card, params, colorChar);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      setServerTestActive(false);
    }
  };

  // Trigger visuals and sounds after server validation
  const triggerCardVisualsAndSounds = (card, params, colorChar) => {
    const visualParams = { ...(params || {}), actorColor: colorChar };
    const studioCard = getCutsceneCard(card.id);
    const hasStudioTimeline = Boolean(studioCard && (
      (studioCard.tracks?.camera || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.objects || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.events || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.sounds || []).some((track) => (track?.keys || []).some((key) => typeof key?.soundId === 'string' && key.soundId.trim().length > 0))
    ));
    const hasCutscenePlayback = hasStudioTimeline;
    const cutsceneDuration = hasCutscenePlayback
      ? Math.max(0, createArcanaStudioRuntimeSession(studioCard, { ...visualParams, fen: chess.fen() }).durationMs || 0)
      : 0;

    // Divine Intervention should NOT show visuals on activation - only when check occurs
    if (card.id === 'divine_intervention') {
      addLog(`${card.name} activated silently - visuals appear when check occurs`, 'info');
      return;
    }

    // Play sound effect if card has one (soundId)
    const cardSoundId = card.soundId;
    if (cardSoundId) {
      try {
        soundManager.play(cardSoundId);
        setValidationChecklist(prev => ({ ...prev, sound: true }));
      } catch (err) {
        addLog(`Sound error: ${err.message}`, 'warning');
      }
    }

    // Trigger visual effect if card has one
    // BUT skip particles for berserker_rage and double_strike on card application - they show on capture only
    const skipParticlesForPending = (card.id === 'berserker_rage' || card.id === 'double_strike');
    if ((card.visual?.particles || card.visual?.effect) && !skipParticlesForPending && !hasCutscenePlayback) {
      setValidationChecklist(prev => ({ ...prev, visuals: true }));

      const pascalCase = (id) => id.split(/[_-]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');

      const triggerVisual = (effectsMod) => {
        const compName = `${pascalCase(card.id)}Effect`;
        if (!effectsMod || !effectsMod[compName]) {
          addLog(`No visual component for ${card.id} (${compName})`, 'info');
          return;
        }

        setActiveVisualArcana({ arcanaId: card.id, params: visualParams });
        const duration = getArcanaEffectDuration(card.id);
        const clearMs = Math.max(duration || 3000, cutsceneDuration || 0);
        trackTimeout(() => setActiveVisualArcana(null), clearMs || 3000);
      };

      if (!effectsModule || Object.keys(effectsModule).length === 0) {
        import('../game/arcana/arcanaVisuals.jsx')
          .then((m) => {
            setEffectsModule(m);
            triggerVisual(m);
          })
          .catch((err) => {
            console.warn('Failed to load arcanaVisuals', err);
          });
      } else {
        triggerVisual(effectsModule);
      }
    }

    if (hasCutscenePlayback) {
      setValidationChecklist(prev => ({ ...prev, cutscene: true }));
      try {
        triggerCardCutscene(card.id, params?.targetSquare || params?.square, params);
      } catch (e) {
        addLog(`Cutscene trigger failed: ${e.message}`, 'warning');
      }
    }
  };

  const applyCardEffect = (card, params, colorChar) => {
    const testChess = new Chess(chess.fen());
    const testGameState = { 
      pawnShields, 
      shieldTurnCounter, 
      moveHistory,
      lastMove,
      capturedByColor,
      activeEffects: { ...activeEffects } || {}
    };

    // Use shared simulation logic
    const result = simulateArcanaEffect(testChess, card.id, params, colorChar, testGameState);

    // Update activeEffects from the simulation result
    if (testGameState.activeEffects) {
      setActiveEffects(testGameState.activeEffects);
    }

    // Play sound if specified (skip focus_fire here; it should play on capture)
    if (result.soundEffect && card.id !== 'focus_fire') {
      try {
        soundManager.play(result.soundEffect);
        setValidationChecklist(prev => ({ ...prev, sound: true }));
      } catch (err) {
        addLog(`Sound error: ${err.message}`, 'warning');
      }
    }

    // Handle highlighted squares for Line of Sight, Vision, Map Fragments, etc
    // Always update highlights - clear them if empty, set them if populated
    if (result.highlightSquares) {
      setHighlightedSquares(result.highlightSquares);
      setHighlightColor(result.highlightColor || '#88c0d0');
    } else {
      // Clear highlights if this card doesn't produce any
      setHighlightedSquares([]);
    }

    // Trigger visual effect via activeVisualArcana (same as in-game)
    // Skip visual for cards that show pending state (Berserker Rage, Double Strike show visual on capture, not on card use)
    const isPendingCard = testGameState.activeEffects.berserkerRage?.[colorChar]?.pending || 
                         testGameState.activeEffects.doubleStrike?.[colorChar]?.pending;
    const shouldShowVisual = result.visualEffect
      && !hasCutscenePlayback
      && !(isPendingCard && (card.id === 'berserker_rage' || card.id === 'double_strike'));
    const studioCard = getCutsceneCard(card.id);
    const hasStudioTimeline = Boolean(studioCard && (
      (studioCard.tracks?.camera || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.objects || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.events || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.sounds || []).some((track) => (track?.keys || []).some((key) => typeof key?.soundId === 'string' && key.soundId.trim().length > 0))
    ));
    const hasCutscenePlayback = hasStudioTimeline;
    const visualParams = { ...(params || {}) };
    const cutsceneDuration = hasCutscenePlayback
      ? Math.max(0, createArcanaStudioRuntimeSession(studioCard, { ...visualParams, fen: chess.fen() }).durationMs || 0)
      : 0;
    if (result.highlightSquares && result.highlightSquares.length > 0) {
      visualParams.square = result.highlightSquares[0];
    }
    if (!visualParams.square && visualParams.targetSquare) visualParams.square = visualParams.targetSquare;
    if (result.pieceType && !visualParams.pieceType) visualParams.pieceType = result.pieceType;
    if (result.pieceColor && !visualParams.pieceColor) visualParams.pieceColor = result.pieceColor;
    // include actor color for effects that use it
    visualParams.actorColor = colorChar;
    
    if (shouldShowVisual) {
      setValidationChecklist(prev => ({ ...prev, visuals: true }));

      const pascalCase = (id) => id.split(/[_-]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');

      const triggerVisual = (effectsMod) => {
        const compName = `${pascalCase(card.id)}Effect`;
        if (!effectsMod || !effectsMod[compName]) {
          addLog(`No visual component for ${card.id} (${compName}) — skipping visual.`, 'warning');
          return;
        }

        // set active visual arcana to trigger shared renderer
        setActiveVisualArcana({ arcanaId: card.id, params: visualParams });
        // Clear visual after animation duration (use shared timing)
        const duration = getArcanaEffectDuration(card.id);
        const cutsceneDuration = hasCutscenePlayback
          ? Math.max(0, createArcanaStudioRuntimeSession(studioCard, { ...visualParams, fen: chess.fen() }).durationMs || 0)
          : 0;
        const clearMs = Math.max(duration || 3000, cutsceneDuration || 0);
        trackTimeout(() => setActiveVisualArcana(null), clearMs || 3000);
      };

      // Ensure effects module is loaded before triggering visuals (Balancing tool may lazy-load)
      if (!effectsModule || Object.keys(effectsModule).length === 0) {
        import('../game/arcana/arcanaVisuals.jsx')
          .then((m) => {
            setEffectsModule(m);
            triggerVisual(m);
          })
          .catch((err) => {
            console.warn('Failed to load arcanaVisuals for visual trigger', err);
          });
      } else {
        triggerVisual(effectsModule);
      }

      // Handle shield (persistent effect)
      if (result.visualEffect === 'shield') {
        setPawnShields(prev => ({ ...prev, [colorChar]: { square: params.targetSquare } }));
        setShieldTurnCounter(prev => ({ ...prev, [colorChar]: 1 }));
      }

      // Delay board state update until visual effect completes so pieces are visible during animation
      // Cards with destructive visuals (execution, etc) need to keep pieces visible until the effect finishes
      const visualDuration = getArcanaEffectDuration(card.id);
      const boardUpdateDelay = Math.max(visualDuration || 2000, cutsceneDuration || 0);
      trackTimeout(() => {
        if (result.success) {
          setChess(testChess);
          setFen(testChess.fen());
          setValidationChecklist(prev => ({ ...prev, logic: true }));
        }
      }, boardUpdateDelay || 2000);
      
      return;
    }

    if (hasCutscenePlayback) {
      setValidationChecklist(prev => ({ ...prev, cutscene: true }));
      try {
        triggerCardCutscene(card.id, visualParams.square, visualParams);
      } catch (e) {
        addLog(`Cutscene trigger failed: ${e.message}`, 'warning');
      }
    }

    // Special handling for specific cards
    if (card.id === 'shield_pawn' && result.success) {
      setPawnShields(prev => ({ ...prev, [colorChar]: { square: params.targetSquare } }));
      setShieldTurnCounter(prev => ({ ...prev, [colorChar]: 1 }));
      addLog(`${result.message} - protected for 1 enemy turn`, 'success');
      setValidationChecklist(prev => ({ ...prev, logic: true }));
      setChess(testChess);
      setFen(testChess.fen());
      return;
    }

    if (card.id === 'temporal_echo') {
      if (moveHistory.length > 0) {
        const lastMove = moveHistory[moveHistory.length - 1];
        setCutsceneActive(true);
        setVisualEffects(prev => [...prev, {
          type: 'ghost',
          from: lastMove.from,
          to: lastMove.to,
          piece: lastMove.piece,
          isWhite: lastMove.color === 'w',
          id: Date.now(),
        }]);
        addLog(`Temporal Echo showing last move: ${lastMove.from} → ${lastMove.to}`, 'success');
        setValidationChecklist(prev => ({ ...prev, logic: true, visuals: true, cutscene: true }));
        trackTimeout(() => setCutsceneActive(false), getArcanaEffectDuration('temporal_echo'));
        return;
      }
    }

    if (card.id === 'time_travel') {
      setCameraTarget(new THREE.Vector3(0, 20, 0));
      setCutsceneActive(true);
      setGrayscaleIntensity(1);
      
      trackTimeout(() => {
        const newChess = new Chess(chess.fen());
        if (moveHistory.length >= 2) {
          const restoreFen = moveHistory[moveHistory.length - 3]?.fen || TEST_SCENARIOS[scenario].fen;
          newChess.load(restoreFen);
          setChess(newChess);
          setFen(restoreFen);
          addLog('Time Travel: Undid last 2 moves', 'success');
        }
        setGrayscaleIntensity(0);
        setCameraTarget(null);
        setCutsceneActive(false);
        setValidationChecklist(prev => ({ ...prev, logic: true, visuals: true, cutscene: true }));
      }, getArcanaEffectDuration('time_travel'));
      return;
    }

    // Update chess state immediately for cards without visual effects
    if (result.success) {
      setChess(testChess);
      setFen(testChess.fen());
      setValidationChecklist(prev => ({ ...prev, logic: true }));
    }
    
    addLog(result.message, result.success ? 'success' : 'error');
  };

  // Trigger Studio runtime playback for a card if a studio timeline exists
  const launchStudioCutscenePlayback = (arcanaId, targetSquare, eventParams = null, options = {}) => {
    clearManagedTimeouts();
    if (!options.preservePreviewState) {
      clearPreviewState();
    }
    const studioCard = getCutsceneCard(arcanaId);
    const hasStudioTimeline = Boolean(studioCard && (
      (studioCard.tracks?.camera || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.objects || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.events || []).some((track) => (track?.keys || []).length > 0)
      || (studioCard.tracks?.sounds || []).some((track) => (track?.keys || []).some((key) => typeof key?.soundId === 'string' && key.soundId.trim().length > 0))
    ));
    if (!hasStudioTimeline) {
      return null;
    }

    const runtimeParams = {
      ...(eventParams || {}),
      fen: chess.fen(),
      targetSquare,
      square: targetSquare,
      cameraAnchorSquare: targetSquare,
      cameraAnchorMode: eventParams?.cameraAnchorMode || (targetSquare ? 'piece' : 'board'),
    };
    const session = createArcanaStudioRuntimeSession(studioCard, runtimeParams);
    setStudioRuntimeSession(session);
    setCutsceneActive(true);

    scheduleArcanaStudioAudio(studioCard, {
      soundManager,
      registerTimeout: (timeoutId) => timeoutsRef.current.push(timeoutId),
    });

    scheduleArcanaStudioEvents(studioCard, {
      eventParams: {
        ...runtimeParams,
        cardId: arcanaId,
      },
      registerTimeout: (timeoutId) => timeoutsRef.current.push(timeoutId),
      onEvent: (eventKey) => {
        const actions = normalizeArcanaStudioEventActions(eventKey);
        actions.forEach((action) => {
          if (action.kind === 'sound' && action.soundId) {
            soundManager.play(action.soundId, {
              volume: action.volume,
              pitch: action.pitch,
              loop: action.loop,
            });
            return;
          }

          if (action.kind === 'highlight') {
            setHighlightedSquares(action.squares || []);
            setHighlightColor(action.color || '#88c0d0');
            if ((action.durationMs || 0) > 0) {
              trackTimeout(() => setHighlightedSquares([]), action.durationMs);
            }
            return;
          }

          if (action.kind === 'vfx' && action.arcanaId) {
            const now = Date.now();
            const dedupeKey = `${session?.id || 'session'}:${action.arcanaId}:${action.vfxKey || ''}:${action.params?.square || ''}`;
            const lastAt = firedRuntimeVfxRef.current.get(dedupeKey) || 0;
            if ((now - lastAt) < 280) return;
            firedRuntimeVfxRef.current.set(dedupeKey, now);
            setActiveVisualArcana({ arcanaId: action.arcanaId, params: action.params || {} });
            trackTimeout(() => {
              setActiveVisualArcana((current) => (current?.arcanaId === action.arcanaId ? null : current));
            }, Math.max(100, Number(action.durationMs || 1200)));
          }
        });
      },
    });

    return session;
  };

  const triggerCardCutscene = (arcanaId, targetSquare, eventParams = null) => {
    const playbackQueue = expandStudioRuntimePlaybackQueue(arcanaId, eventParams || {});
    studioRuntimeQueueRef.current = playbackQueue.slice(1).map((entry) => ({
      arcanaId,
      targetSquare: entry.eventParams?.targetSquare || targetSquare,
      eventParams: entry.eventParams,
    }));

    const firstTargetSquare = playbackQueue[0]?.eventParams?.targetSquare || targetSquare;
    const firstEventParams = playbackQueue[0]?.eventParams || eventParams;
    return launchStudioCutscenePlayback(arcanaId, firstTargetSquare, firstEventParams);
  };

  const handleSquareClick = (fileIndex, rankIndex) => {
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const square = `${fileChar}${rankNum}`;

    // If we're in targeting mode for a card test, validate and set target square
    if (targetingMode && selectedCard) {
      // Check if this is a valid target
      if (!validTargetSquares.includes(square)) {
        const targetDescription = getArcanaTargetLabel(selectedCard.id) || 'valid target';
        addLog(`Invalid target! Please select ${targetDescription}`, 'error');
        return;
      }
      
      setTargetSquare(square);
      setTargetingMode(false);
      setValidTargetSquares([]);
      addLog(`Targeting ${square} for ${selectedCard.name}`, 'info');
      
      // If metamorphosis, show dialog for piece type selection
      if (selectedCard.id === 'metamorphosis') {
        setMetamorphosisDialog({ square, cardId: selectedCard.id });
      } else {
        const colorChar = playerColor === 'white' ? 'w' : 'b';
        const params = { ...customParams, targetSquare: square };
        // Use server validation for 1:1 game behavior
        applyCardEffectWithServer(selectedCard, params, colorChar);
      }
      return;
    }

    // Otherwise, handle piece movement
    if (!selectedSquare) {
      const colorChar = playerColor === 'white' ? 'w' : 'b';
      const piece = chess.get(square);
      
      // Berserker Rage restriction: can ONLY move the piece that made the first kill
      const brActive = activeEffects?.berserkerRageActive;
      if (brActive?.color === colorChar) {
        if (square !== brActive.firstKillFrom) {
          addLog('Berserker Rage: MUST use the same piece for the second capture!', 'error');
          return;
        }
      }
      
      setSelectedSquare(square);
      if (piece) {
        // Get both standard and arcana-enhanced moves
        const standardMoves = chess.moves({ square, verbose: true });
        const arcanaMoves = getArcanaEnhancedMoves(chess, square, { activeEffects: activeEffects || {} }, playerColor);
        
        // Merge moves, avoiding duplicates
        let allMoveTargets = new Set(standardMoves.map(m => m.to));
        arcanaMoves.forEach(m => allMoveTargets.add(m.to));
        
        // Berserker Rage: only allow CAPTURE moves, and NOT adjacent to first kill
        if (brActive?.color === colorChar) {
          const captureOnlyMoves = standardMoves.filter(m => m.captured); // Only captures
          const adjacentSquares = getAdjacentSquares(brActive.firstKillSquare || '');
          const validCaptures = captureOnlyMoves.filter(m => !adjacentSquares.includes(m.to));
          allMoveTargets = new Set(validCaptures.map(m => m.to));
          
          if (validCaptures.length === 0) {
            addLog('Berserker Rage: no valid second captures available! Turn ending...', 'info');
            setSelectedSquare(null);
            setLegalTargets([]);
            return;
          }
        }
        
        setLegalTargets([...allMoveTargets]);
        addLog(`Selected square: ${square} (${allMoveTargets.size} legal moves)`, 'info');
      } else {
        addLog(`Selected square: ${square} (empty)`, 'info');
      }
    } else if (legalTargets.includes(square)) {
      // Make a move - try standard first, then arcana
      const colorChar = playerColor === 'white' ? 'w' : 'b';

      // Berserker Rage restriction: second capture cannot be adjacent to first kill
      const pendingBerserker = activeEffects?.berserkerRageActive;
      const targetPieceForValidation = chess.get(square);
      if (pendingBerserker?.color === colorChar && targetPieceForValidation) {
        const adjacentToFirstKill = getAdjacentSquares(pendingBerserker.firstKillSquare || '');
        if (adjacentToFirstKill.includes(square)) {
          addLog('Berserker Rage: second capture cannot be adjacent to the first kill!', 'error');
          setSelectedSquare(null);
          setLegalTargets([]);
          return;
        }
      }

      let move = null;
      let capturedPiece = null;
      
      try {
        move = chess.move({ from: selectedSquare, to: square });
        capturedPiece = move?.captured;
      } catch (standardErr) {
        // If standard move fails, try arcana-enhanced move
        const arcanaMoves = getArcanaEnhancedMoves(chess, selectedSquare, { activeEffects: activeEffects || {} }, playerColor);
        const arcanaMove = arcanaMoves.find(m => m.to === square);
        
        if (arcanaMove) {
          // Execute the arcana move manually
          const pieceAtFrom = chess.get(selectedSquare);
          const pieceAtTo = chess.get(square);
          capturedPiece = pieceAtTo?.type;
          
          chess.remove(selectedSquare);
          if (capturedPiece) chess.remove(square);
          chess.put({ type: pieceAtFrom.type, color: pieceAtFrom.color }, square);
          
          move = {
            from: selectedSquare,
            to: square,
            piece: pieceAtFrom.type,
            color: pieceAtFrom.color,
            captured: capturedPiece,
            san: `${pieceAtFrom.type.toUpperCase()}${capturedPiece ? 'x' : ''}${square}`,
            arcana: true
          };
          
          // Create new chess instance with updated position
          const newChess = new Chess(chess.fen());
          setChess(newChess);
        } else {
          addLog(`Invalid move: ${standardErr.message}`, 'error');
          setSelectedSquare(null);
          setLegalTargets([]);
          return;
        }
      }
      
      if (move) {
        // Check if trying to capture a shielded pawn
        const opponentColor = move.color === 'w' ? 'b' : 'w';
        const opponentShield = pawnShields[opponentColor];
        if (capturedPiece === 'p' && opponentShield?.square === square && shieldTurnCounter[opponentColor] > 0) {
          addLog(`Cannot capture shielded pawn at ${square}!`, 'error');
          if (!move.arcana) chess.undo();
          return;
        }

        // Squire Support: protected piece survives and attacker bounces back
        const protectedBySquire = capturedPiece
          ? (activeEffects?.squireSupport || []).find(s => s.square === move.to)
          : null;
        if (protectedBySquire) {
          const attackerPiece = { type: move.piece, color: move.color };
          const defendedPiece = { type: capturedPiece, color: opponentColor };

          // Mirror server behavior: attacker returns to source, defender restored to target
          chess.remove(move.to);
          chess.put(attackerPiece, move.from);
          chess.put(defendedPiece, move.to);

          move.squireBounce = { from: move.from, to: move.to };
          move.captured = null;
          capturedPiece = null;
          addLog(`Squire Support: capture bounced back at ${move.to}`, 'info');
        }
        
        soundManager.play(capturedPiece ? 'capture' : 'move');

        // Server-parity local effect resolution for post-move side effects
        const nextEffects = { ...(activeEffects || {}) };
        nextEffects.poisonedPieces = [...(nextEffects.poisonedPieces || [])].map(p => ({ ...p }));
        nextEffects.squireSupport = [...(nextEffects.squireSupport || [])].map(s => ({ ...s }));
        let activatedBerserkerThisMove = false;

        // Poison tracking follows moved poisoned pieces
        const movedPoison = nextEffects.poisonedPieces.find(p => p.square === move.from);
        if (movedPoison) movedPoison.square = move.to;

        // Squire Support tracking follows the protected piece if it moved
        const movedSquireSupport = nextEffects.squireSupport.find(s => s.square === move.from);
        if (movedSquireSupport) movedSquireSupport.square = move.to;

        // If a poisoned target was captured, remove that poison entry
        if (capturedPiece) {
          nextEffects.poisonedPieces = nextEffects.poisonedPieces.filter(p => p.square !== move.to);
        }

        // Poison Touch: on capture, poison one random adjacent enemy piece
        if (capturedPiece && nextEffects?.poisonTouch?.[move.color]) {
          const adjacentSquares = getAdjacentSquares(move.to);
          const validTargets = adjacentSquares.filter(sq => {
            const piece = chess.get(sq);
            return piece && piece.color === opponentColor;
          });

          if (validTargets.length > 0) {
            const randomTarget = validTargets[Math.floor(Math.random() * validTargets.length)];
            nextEffects.poisonedPieces.push({
              square: randomTarget,
              turnsLeft: 12,
              poisonedBy: move.color,
            });
            addLog(`Poison Touch: ${randomTarget} has been poisoned!`, 'success');
            try { soundManager.play('arcana:poison_touch'); } catch {}
          }
        }

        // Activate pending Double Strike on first capture
        const pendingDS = nextEffects.doubleStrike?.[move.color];
        if (capturedPiece && pendingDS?.pending) {
          // After capture, any piece can make the second capture (not restricted to same piece)
          nextEffects.doubleStrikeActive = {
            color: move.color,
            firstKillSquare: move.to,      // Where the first kill happened
          };
          nextEffects.doubleStrike = { ...(nextEffects.doubleStrike || { w: null, b: null }) };
          nextEffects.doubleStrike[move.color] = {
            active: true,
            firstKillSquare: move.to,      // Track where the first kill was
            usedSecondKill: false,
          };
          addLog('Double Strike activated: ANY piece can make the second capture (can capture adjacent)!', 'success');
          // Double Strike visual at capture square
          setActiveVisualArcana({ arcanaId: 'double_strike', params: { square: move.to, from: move.from, to: move.to } });
          const duration = getArcanaEffectDuration('double_strike') || 1500;
          trackTimeout(() => setActiveVisualArcana(null), duration);
        }

        // Activate pending Berserker Rage on first capture
        const pendingBR = nextEffects.berserkerRage?.[move.color];
        if (capturedPiece && pendingBR?.pending) {
          // After capture, ONLY the same piece can make another capture, and NOT adjacent targets
          nextEffects.berserkerRageActive = {
            color: move.color,
            firstKillSquare: move.to,      // Where the kill happened
            firstKillFrom: move.from,      // Piece started move from here - must use same piece
          };
          nextEffects.berserkerRage = { ...(nextEffects.berserkerRage || { w: null, b: null }) };
          nextEffects.berserkerRage[move.color] = {
            active: true,
            firstKillSquare: move.to,      // Track where the first kill was
            usedSecondKill: false,
          };
          activatedBerserkerThisMove = true;
          addLog('Berserker Rage activated: ONLY the killing piece can capture again (NOT adjacent targets)!', 'success');
          // Berserker visual at capture square
          setActiveVisualArcana({ arcanaId: 'berserker_rage', params: { square: move.to, from: move.from, to: move.to } });
          const duration = getArcanaEffectDuration('berserker_rage') || 1500;
          trackTimeout(() => setActiveVisualArcana(null), duration);
        }

        // Focus Fire: consume on capture (server parity)
        try {
          const moverColor = move.color;
          if (capturedPiece && nextEffects?.focusFire?.[moverColor]) {
            soundManager.play('arcana:focus_fire');
            setValidationChecklist(prev => ({ ...prev, sound: true }));
            nextEffects.focusFire = { ...(nextEffects.focusFire || {}) };
            nextEffects.focusFire[moverColor] = false;
          }
        } catch (e) {
          addLog(`Sound error: ${e.message}`, 'warning');
        }

        // Chain Lightning: on capture, destroy 1 adjacent enemy piece (not kings/queens)
        if (capturedPiece && nextEffects?.chainLightning?.[move.color]) {
          const adjacentSquares = getAdjacentSquares(move.to);
          const chainedSquares = [];

          for (const sq of adjacentSquares) {
            const piece = chess.get(sq);
            if (piece && piece.color === opponentColor && piece.type !== 'k' && piece.type !== 'q') {
              chess.remove(sq);
              chainedSquares.push(sq);
              break;
            }
          }

          if (chainedSquares.length > 0) {
            addLog(`Chain Lightning zapped ${chainedSquares[0]}!`, 'success');
            setActiveVisualArcana({
              arcanaId: 'chain_lightning',
              params: { origin: move.to, chained: chainedSquares, square: move.to }
            });
            const duration = getArcanaEffectDuration('chain_lightning') || 1400;
            trackTimeout(() => setActiveVisualArcana(null), duration);
          }

          nextEffects.chainLightning[move.color] = false;
        }

        // Decrement poisoned pieces and kill those at 0 turns (server parity)
        const survivors = [];
        for (const poisoned of nextEffects.poisonedPieces) {
          const updatedPoison = { ...poisoned, turnsLeft: poisoned.turnsLeft - 1 };
          if (updatedPoison.turnsLeft === 0) {
            const piece = chess.get(poisoned.square);
            if (piece && piece.type !== 'k') {
              chess.remove(poisoned.square);
              addLog(`${poisoned.square} died from poison!`, 'warning');
              try { soundManager.play('capture'); } catch {}
            }
          } else {
            survivors.push(updatedPoison);
            if (updatedPoison.turnsLeft <= 2) {
              const turnsRemaining = Math.ceil(updatedPoison.turnsLeft / 2);
              addLog(`${poisoned.square} has ${turnsRemaining} turn${turnsRemaining === 1 ? '' : 's'} left before dying!`, 'warning');
            }
          }
        }
        nextEffects.poisonedPieces = survivors;

        // Decrement squire support duration
        nextEffects.squireSupport = nextEffects.squireSupport.filter(s => {
          s.turnsLeft = (s.turnsLeft || 0) - 1;
          return s.turnsLeft > 0;
        });

        // Clear one-turn movement/offense effects after move (server parity end-turn behavior)
        nextEffects.poisonTouch = { w: false, b: false };
        nextEffects.spectralMarch = { w: false, b: false };
        nextEffects.phantomStep = { w: false, b: false };
        nextEffects.pawnRush = { w: false, b: false };
        nextEffects.sharpshooter = { w: false, b: false };
        nextEffects.enPassantMaster = { w: false, b: false };
        nextEffects.temporalEcho = null;
        nextEffects.doubleStrike = { w: null, b: null };
        nextEffects.knightOfStorms = { w: null, b: null };
        nextEffects.chainLightning = { w: false, b: false };

        // Consume active Berserker Rage after follow-up move (server parity behavior)
        if (!activatedBerserkerThisMove && nextEffects?.berserkerRageActive?.color === move.color && !move.promotion) {
          nextEffects.berserkerRageActive = null;
          nextEffects.berserkerRage = { ...(nextEffects.berserkerRage || { w: null, b: null }) };
          nextEffects.berserkerRage[move.color] = null;
        }

        setActiveEffects(nextEffects);
        const moveWithFen = { ...move, fen: chess.fen() };
        setMoveHistory(prev => [...prev, moveWithFen]);
        setLastMove(moveWithFen); // Track lastMove for cards like temporal_echo
        if (capturedPiece) {
          // `capturedPiece` from chess.js is the piece type string (e.g. 'p'),
          // not an object. The captured piece's color is the opponent's color.
          const capturedColor = opponentColor;
          setCapturedByColor(prev => ({
            ...prev,
            [capturedColor]: [...(prev[capturedColor] || []), { type: capturedPiece, square }]
          }));
        }
        if (!move.arcana) setChess(new Chess(chess.fen()));
        setFen(chess.fen());
        addLog(`Move: ${move.san}${move.arcana ? ' (Arcana)' : ''}`, 'success');
        
        // Check if shield should follow pawn when it moves
        const myColorChar = move.color;
        const myShield = pawnShields[myColorChar];
        if (myShield && myShield.square === selectedSquare && move.piece === 'p') {
          setPawnShields(prev => ({ ...prev, [myColorChar]: { square } }));
          addLog(`Shield followed pawn to ${square}`, 'info');
        }
        
        // Decrement shield turn counter for opponent after move
        if (shieldTurnCounter[opponentColor] > 0) {
          const newCounter = shieldTurnCounter[opponentColor] - 1;
          setShieldTurnCounter(prev => ({ ...prev, [opponentColor]: newCounter }));
          if (newCounter === 0) {
            setPawnShields(prev => ({ ...prev, [opponentColor]: null }));
            addLog(`${opponentColor === 'w' ? 'White' : 'Black'} shield expired`, 'info');
          }
        }
        
        // Sync board after all post-move effects (including poison deaths)
        setChess(new Chess(chess.fen()));
        setFen(chess.fen());
        
        // Check for extra moves BEFORE clearing selected square
        // Queen's Gambit: queen moved + counter available + not already used
        const hasQueensGambit = nextEffects.queensGambit?.[myColorChar] > 0 && 
                               !nextEffects.queensGambitUsed?.[myColorChar] &&
                               move.piece === 'q';
        
        // Double Strike: second attack available after first capture
        const hasDoubleStrike = nextEffects.doubleStrikeActive?.color === myColorChar && !move.promotion;
        
        // Berserker Rage: extra move available after first capture
        const hasBerserkerRage = nextEffects.berserkerRageActive?.color === myColorChar && !move.promotion;
        
        // If player has extra move, keep the turn and allow another move
        if (hasQueensGambit || hasDoubleStrike || hasBerserkerRage) {
          // Mark extra move as used (Queen's Gambit only)
          if (hasQueensGambit) {
            nextEffects.queensGambitUsed[myColorChar] = true;
            setActiveEffects({ ...nextEffects });
          }
          // Clear double strike after use
          if (hasDoubleStrike) {
            nextEffects.doubleStrikeActive = null;
            setActiveEffects({ ...nextEffects });
          }
          // Clear berserker rage after use
          if (hasBerserkerRage) {
            nextEffects.berserkerRageActive = null;
            setActiveEffects({ ...nextEffects });
          }
          
          addLog(`Extra move available (${hasQueensGambit ? 'Queen\'s Gambit' : (hasDoubleStrike ? 'Double Strike' : 'Berserker Rage')})`, 'success');
          // Keep selected square null so user must click a piece, but don't change turn
          setSelectedSquare(null);
          setLegalTargets([]);
          return;
        }
        
        setSelectedSquare(null);
        setLegalTargets([]);
      }
    } else {
      // Clicking a different square - select it instead
      setSelectedSquare(square);
      setLegalTargets([]);
      const piece = chess.get(square);
      if (piece) {
        // Get both standard and arcana-enhanced moves
        const colorChar = playerColor === 'white' ? 'w' : 'b';
        const standardMoves = chess.moves({ square, verbose: true });
        const arcanaMoves = getArcanaEnhancedMoves(chess, square, { activeEffects: activeEffects || {} }, playerColor);
        
        const allMoveTargets = new Set(standardMoves.map(m => m.to));
        arcanaMoves.forEach(m => allMoveTargets.add(m.to));
        
        setLegalTargets([...allMoveTargets]);
        addLog(`Selected square: ${square} (${allMoveTargets.size} legal moves)`, 'info');
      } else {
        addLog(`Selected square: ${square} (empty)`, 'info');
      }
    }
  };

  

  // Reconcile piecesState whenever fen changes to preserve uids for animations
  useEffect(() => {
    const newPieces = parseFenPieces(fen);
    if (!piecesState || piecesState.length === 0) {
      const withUids = newPieces.map((p) => {
        uidCounterRef.current += 1;
        return { ...p, uid: `${p.square}-${p.type}-${uidCounterRef.current}` };
      });
      setPiecesState(withUids);
      return;
    }

    // Map old pieces by type+color for best-effort matching
    const oldByKey = new Map();
    for (const op of piecesState) {
      const key = `${op.type}-${op.isWhite}`;
      if (!oldByKey.has(key)) oldByKey.set(key, []);
      oldByKey.get(key).push(op);
    }

    // Simple matching by same square first, then nearest by Euclidean distance
    const posFromSquare = (sq) => {
      const fileIndex = 'abcdefgh'.indexOf(sq[0]);
      const rankIndex = 8 - parseInt(sq[1], 10);
      return [fileIndex - 3.5, rankIndex - 3.5];
    };
    const dist2 = (aSq, bSq) => {
      const [ax, az] = posFromSquare(aSq);
      const [bx, bz] = posFromSquare(bSq);
      const dx = ax - bx;
      const dz = az - bz;
      return dx * dx + dz * dz;
    };

    // We'll perform a stable reconciliation:
    // 1) exact square+type+color matches keep UID
    // 2) for remaining, perform a global greedy minimal-distance matching (pairs sorted by distance)
    const result = [];
    const usedOld = new Set();
    const matchedNew = new Array(newPieces.length).fill(false);

    // Stage 1: exact matches by square
    for (let j = 0; j < newPieces.length; j++) {
      const np = newPieces[j];
      let matched = -1;
      for (let i = 0; i < piecesState.length; i++) {
        if (usedOld.has(i)) continue;
        const op = piecesState[i];
        if (op.square === np.square && op.type === np.type && op.isWhite === np.isWhite) {
          matched = i; break;
        }
      }
      if (matched !== -1) {
        usedOld.add(matched);
        matchedNew[j] = true;
        result[j] = { ...np, uid: piecesState[matched].uid };
      }
    }

    // Stage 2: build all candidate pairs (oldIdx, newIdx, dist) for same type/color
    const pairs = [];
    for (let j = 0; j < newPieces.length; j++) {
      if (matchedNew[j]) continue;
      const np = newPieces[j];
      for (let i = 0; i < piecesState.length; i++) {
        if (usedOld.has(i)) continue;
        const op = piecesState[i];
        if (op.type !== np.type || op.isWhite !== np.isWhite) continue;
        const d = dist2(op.square, np.square);
        pairs.push({ oldIdx: i, newIdx: j, d });
      }
    }

    // Sort pairs by distance ascending and greedily assign
    pairs.sort((a, b) => a.d - b.d);
    const newAssigned = new Set();
    for (const p of pairs) {
      if (usedOld.has(p.oldIdx)) continue;
      if (newAssigned.has(p.newIdx)) continue;
      // assign
      usedOld.add(p.oldIdx);
      newAssigned.add(p.newIdx);
      result[p.newIdx] = { ...newPieces[p.newIdx], uid: piecesState[p.oldIdx].uid };
      matchedNew[p.newIdx] = true;
    }

    // Stage 3: any remaining new pieces get fresh UIDs
    for (let j = 0; j < newPieces.length; j++) {
      if (result[j]) continue;
      uidCounterRef.current += 1;
      result[j] = { ...newPieces[j], uid: `${newPieces[j].square}-${newPieces[j].type}-${uidCounterRef.current}` };
    }

    setPiecesState(result);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen]);

  const pieces = piecesState;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backButton} onClick={onBack}>← Back</button>
        <div>
          <h2 style={styles.title}>Card Balancing & Testing Tool V2</h2>
          <div style={{
            fontSize: 11,
            color: validationChecklist.server ? '#00ff88' : '#ff8800',
            marginTop: 4,
            padding: '4px 8px',
            background: validationChecklist.server ? 'rgba(0,255,136,0.08)' : 'rgba(255,136,0,0.08)',
            borderRadius: 4,
            border: `1px solid ${validationChecklist.server ? 'rgba(0,255,136,0.2)' : 'rgba(255,136,0,0.2)'}`,
            textAlign: 'center'
          }}>
            {validationChecklist.server 
              ? '✓ Using server validation (100% accurate to in-game behavior)'
              : '⚠ Using client simulation (server not running - start server with "npm run dev" for accurate testing)'
            }
          </div>
        </div>
        <button
          style={{ ...styles.button, background: multiplayerMode ? '#4c6fff' : '#333' }}
          onClick={() => setMultiplayerMode(!multiplayerMode)}
        >
          {multiplayerMode ? 'Exit' : 'Enter'} Multiplayer Test
        </button>
      </div>

      <div style={styles.mainContent}>
        {/* Left: Card Browser */}
        <div style={styles.leftPanel}>
          <h3 style={styles.panelTitle}>Cards (Common → Legendary → ???)</h3>
          <div style={styles.cardList}>
            {sortedCards.map(card => (
              <div
                key={card.id}
                style={{
                  ...styles.cardListItem,
                  background: selectedCardId === card.id ? '#4c6fff' : '#2a2a2a',
                  borderLeft: `3px solid ${getRarityColor(card.rarity)}`,
                }}
                onClick={() => {
                  setSelectedCardId(card.id);
                  resetTest();
                  addLog(`Selected: ${card.name}`, 'info');
                }}
              >
                <div style={styles.cardListName}>{card.name}</div>
                <div style={{ ...styles.cardListRarity, color: getRarityColor(card.rarity) }}>
                  {card.rarity}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Center: 3D Board */}
        <div style={styles.centerPanel}>
          <div style={styles.scenarioBar}>
            <select style={styles.select} value={scenario} onChange={(e) => changeScenario(e.target.value)}>
              {Object.entries(TEST_SCENARIOS).map(([key, s]) => (
                <option key={key} value={key}>{s.name}</option>
              ))}
            </select>
            <select style={styles.select} value={playerColor} onChange={(e) => setPlayerColor(e.target.value)}>
              <option value="white">Play as White</option>
              <option value="black">Play as Black</option>
            </select>
            {multiplayerMode && (
              <button
                style={styles.button}
                onClick={() => setPlayer2Perspective(!player2Perspective)}
              >
                View: {player2Perspective ? 'Player 2' : 'Player 1'}
              </button>
            )}
          </div>

          <div style={styles.boardContainer}>
            <Canvas
              camera={{ position: playerColor === 'white' ? [8, 10, 8] : [-8, 10, -8], fov: 40 }}
              shadows
              gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false, powerPreference: 'high-performance' }}
              onCreated={({ gl }) => {
                const canvas = gl.domElement;
                const handleLost = (e) => { e.preventDefault(); console.warn('WebGL context lost in CardBalancingToolV2'); };
                const handleRestored = () => { console.log('WebGL context restored in CardBalancingToolV2'); try { gl.resetState(); } catch(_){} };
                canvas.addEventListener('webglcontextlost', handleLost, false);
                canvas.addEventListener('webglcontextrestored', handleRestored, false);
                try { gl.setPixelRatio && gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); } catch (_) {}
              }}
            >
              <color attach="background" args={["#0b1020"]} />
              <ambientLight intensity={0.4} />
              <directionalLight position={[10, 15, 5]} intensity={1.2} castShadow />
              <directionalLight position={[-5, 8, -5]} intensity={0.4} color="#88c0d0" />
              <pointLight position={[0, 5, 0]} intensity={0.6} color="#d8dee9" />
              <Environment preset="night" />
              {!studioCameraRuntimeActive && (
                <OrbitControls ref={controlsRef} enabled={!studioRuntimeSession} enablePan={false} minDistance={8} maxDistance={20} />
              )}

              {/* Board squares - matches GameScene styling */}
              <group>
                {Array.from({ length: 64 }).map((_, i) => {
                  const file = i % 8;
                  const rank = Math.floor(i / 8);
                  const isDark = (file + rank) % 2 === 1;
                  const x = file - 3.5;
                  const z = rank - 3.5;
                  const square = String.fromCharCode(97 + file) + (8 - rank);
                  const isSelected = selectedSquare === square;
                  const isTarget = targetSquare === square;
                  const isLegal = legalTargets.includes(square);
                  const isHighlighted = highlightedSquares.includes(square);
                  const isValidTarget = validTargetSquares.includes(square);
                  const isLastMove = moveHistory.length > 0 && 
                    (moveHistory[moveHistory.length - 1].from === square || 
                     moveHistory[moveHistory.length - 1].to === square);
                  const isShielded = pawnShields.w?.square === square || pawnShields.b?.square === square;

                  // Match GameScene board colors exactly: dark=#3b4252, light=#d8dee9
                  const baseColor = isDark ? '#3b4252' : '#d8dee9';
                  
                  // Determine square color based on state - matches GameScene logic
                  let squareColor = baseColor;
                  let squareOpacity = 1;
                  
                  if (targetingMode) {
                    if (isValidTarget) {
                      // Highlight valid targets during targeting mode
                      squareColor = '#00ff88';
                      squareOpacity = 1;
                    } else {
                      // Dim non-valid squares during targeting - match GameScene dims
                      squareColor = isDark ? '#2a2f3a' : '#9a9eab';
                      squareOpacity = 0.7;
                    }
                  } else {
                    if (isLastMove) squareColor = '#ffd27f';
                    if (isSelected) squareColor = '#4db8ff';
                    else if (isLegal) squareColor = '#4cd964';
                    else if (isTarget) squareColor = '#ff8800';
                    else if (isHighlighted) squareColor = highlightColor || '#88c0d0';
                    if (isShielded) squareColor = '#b48ead';
                  }

                  return (
                    <mesh
                      key={i}
                      position={[x, 0, z]}
                      receiveShadow
                      onClick={() => handleSquareClick(file, rank)}
                    >
                      <boxGeometry args={[1, 0.1, 1]} />
                      <meshStandardMaterial
                        color={squareColor}
                        opacity={squareOpacity}
                        transparent
                      />
                    </mesh>
                  );
                })}
              </group>

              {/* Pieces */}
              {pieces.map(p => (
                <ChessPiece
                  key={p.uid}
                  type={p.type}
                  isWhite={p.isWhite}
                  targetPosition={p.targetPosition}
                  square={p.square}
                  cutsceneMotion={studioPieceMotions[p.square] || cinematicMotionBySquare.get(p.square) || null}
                  onClickSquare={(sq) => {
                    const file = 'abcdefgh'.indexOf(sq[0]);
                    const rank = 8 - parseInt(sq[1], 10);
                    handleSquareClick(file, rank);
                  }}
                />
              ))}

              {/* Arcana Visual Effects - Shared component (same as GameScene) */}
              <ArcanaVisualHost 
                effectsModule={effectsModule}
                activeVisualArcana={activeVisualArcana}
                gameState={{ activeEffects, pawnShields }}
                pawnShields={pawnShields}
              />

              <ArcanaStudioRuntimeHost
                session={studioRuntimeSession}
                controlsRef={controlsRef}
                myColor={playerColor}
                runtimePieces={pieces}
                onPieceMotionsChange={setStudioPieceMotions}
                onComplete={() => {
                  const nextQueued = studioRuntimeQueueRef.current.shift();
                  if (nextQueued) {
                    launchStudioCutscenePlayback(
                      nextQueued.arcanaId,
                      nextQueued.targetSquare,
                      nextQueued.eventParams,
                      { preservePreviewState: true },
                    );
                    return;
                  }
                  setStudioRuntimeSession(null);
                  setStudioPieceMotions({});
                }}
              />

              {/* Legacy Visual Effects (kept for backward compatibility) */}
              {visualEffects.map(effect => {
                if (effect.type === 'ghost') {
                  return (
                    <GhostPiece
                      key={effect.id}
                      type={effect.piece}
                      isWhite={effect.isWhite}
                      fromSquare={effect.from}
                      toSquare={effect.to}
                    />
                  );
                }
                return null;
              })}

              {/* Camera controller for cutscenes */}
              {cameraTarget && (
                <CameraController
                  targetPosition={cameraTarget}
                  active={cutsceneActive}
                  onComplete={() => setCameraTarget(null)}
                />
              )}

              {/* Grayscale effect */}
              {grayscaleIntensity > 0 && <GrayscaleEffect intensity={grayscaleIntensity} />}
            </Canvas>
          </div>

          <div style={styles.testControls}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                style={{ ...styles.button, background: selectedCard ? '#4c6fff' : '#555' }}
                onClick={testCard}
                disabled={!selectedCard || targetingMode}
              >
                {targetingMode ? 'Targeting...' : 'Test Card'}
              </button>
              <span style={{ 
                fontSize: 10, 
                color: validationChecklist.server ? '#00ff88' : '#ff8800', 
                fontWeight: 'bold', 
                background: validationChecklist.server ? 'rgba(0,255,136,0.1)' : 'rgba(255,136,0,0.1)', 
                padding: '2px 6px', 
                borderRadius: 4,
                border: validationChecklist.server ? '1px solid rgba(0,255,136,0.3)' : '1px solid rgba(255,136,0,0.3)'
              }}>
                {validationChecklist.server ? '✓ SERVER VALIDATED' : '⚠ CLIENT SIMULATION'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <label style={{ color: '#ddd', fontSize: 12 }}>Player:</label>
              <select value={playerColor} onChange={(e) => setPlayerColor(e.target.value)} style={styles.selectSmall}>
                <option value="white">White</option>
                <option value="black">Black</option>
              </select>
              <button
                style={{ ...styles.button, background: serverTestActive ? '#ff8800' : '#2a7a2a' }}
                onClick={testWithServer}
                disabled={!selectedCard || serverTestActive}
              >
                {serverTestActive ? 'Testing...' : 'Re-test Server'}
              </button>
            </div>
            <button style={styles.button} onClick={resetTest}>Reset</button>
            {targetingMode && <span style={{ ...styles.infoText, color: '#00ddff', fontWeight: 'bold' }}>Click on a piece to target</span>}
            {!targetingMode && selectedSquare && <span style={styles.infoText}>Selected: {selectedSquare}</span>}
            {!targetingMode && targetSquare && <span style={styles.infoText}>Target: {targetSquare}</span>}
            
            {/* Server test result */}
            {serverTestResult && (
              <span style={{ ...styles.infoText, color: serverTestResult.success ? '#00ff00' : '#ff0000', fontWeight: 'bold' }}>
                {serverTestResult.success ? '✓ Server OK' : `✗ ${serverTestResult.error}`}
              </span>
            )}
            {serverTestResult && serverTestResult.success && serverTestResult.data && (
              <details style={{ marginTop: 8, color: '#ddd', fontSize: 11, cursor: 'pointer' }}>
                <summary style={{ fontWeight: 'bold', color: '#4ade80', userSelect: 'none' }}>View Server Response</summary>
                <div style={{ marginTop: 6 }}>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>Applied:</div>
                  <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto', background: '#0a0a0a', padding: 6, borderRadius: 4, fontSize: 10, lineHeight: 1.3 }}>
                    {JSON.stringify(serverTestResult.data.applied || [], null, 2)}
                  </pre>
                  {serverTestResult.data.afterState && (
                    <>
                      <div style={{ marginTop: 4, fontSize: 10, opacity: 0.7 }}>Active Effects:</div>
                      <pre style={{ whiteSpace: 'pre-wrap', maxHeight: 100, overflow: 'auto', background: '#0a0a0a', padding: 6, borderRadius: 4, fontSize: 10, lineHeight: 1.3 }}>
                        {JSON.stringify(serverTestResult.data.afterState.activeEffects || {}, null, 2)}
                      </pre>
                    </>
                  )}
                </div>
              </details>
            )}
            
            {/* Active Shield Status */}
            {(pawnShields.w?.square || pawnShields.b?.square) && (
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 12 }}>
                {pawnShields.w?.square && (
                  <span style={{ color: '#60a5fa', fontWeight: 'bold' }}>
                    ⚔ White Shield: {pawnShields.w.square} ({shieldTurnCounter.w} turn{shieldTurnCounter.w !== 1 ? 's' : ''})
                  </span>
                )}
                {pawnShields.b?.square && (
                  <span style={{ color: '#c084fc', fontWeight: 'bold' }}>
                    ⚔ Black Shield: {pawnShields.b.square} ({shieldTurnCounter.b} turn{shieldTurnCounter.b !== 1 ? 's' : ''})
                  </span>
                )}
              </div>
            )}
            {/* Turn end indicator moved to right panel */}
          </div>
        </div>

        {/* Right: Details & Checklist */}
        <div style={styles.rightPanel}>
          {selectedCard ? (
            <>
              <div style={styles.cardPreview}>
                <ArcanaCard arcana={selectedCard} size="medium" disableTooltip />
              </div>

              {/* Card Description */}
              <div style={styles.descriptionSection}>
                <h4 style={styles.sectionTitle}>Description</h4>
                <p style={styles.descriptionText}>{selectedCard.description}</p>
              </div>

              {/* Validation Checklist */}
              <div style={styles.checklistSection}>
                <h4 style={styles.sectionTitle}>Card Status</h4>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
                  All tests use server validation for 1:1 game behavior ✓
                </div>
                <div style={styles.checklistItem}>
                  <span style={validationChecklist.logic ? styles.checkTrue : styles.checkFalse}>
                    {validationChecklist.logic ? '✓' : '✗'}
                  </span>
                  <span>Logic Working</span>
                </div>
                <div style={styles.checklistItem}>
                  <span style={validationChecklist.visuals ? styles.checkTrue : styles.checkFalse}>
                    {validationChecklist.visuals ? '✓' : '✗'}
                  </span>
                  <span>Visuals Working</span>
                </div>
                <div style={styles.checklistItem}>
                  <span style={validationChecklist.sound ? styles.checkTrue : styles.checkFalse}>
                    {validationChecklist.sound ? '✓' : (selectedCard?.soundId ? '✗' : '—')}
                  </span>
                  <span>Sound {selectedCard?.soundId ? 'Working' : 'None'}</span>
                </div>
                {selectedCard?.visual?.cutscene && (
                  <div style={styles.checklistItem}>
                    <span style={validationChecklist.cutscene ? styles.checkTrue : styles.checkFalse}>
                      {validationChecklist.cutscene ? '✓' : '✗'}
                    </span>
                    <span>Cutscene Working</span>
                  </div>
                )}
                <div style={styles.checklistItem}>
                  <span style={validationChecklist.server ? styles.checkTrue : styles.checkFalse}>
                    {validationChecklist.server ? '✓' : '✗'}
                  </span>
                  <span>Server Validated (1:1)</span>
                </div>
                <div style={styles.checklistItem}>
                  <span style={selectedCard?.endsTurn ? styles.checkTrue : styles.checkFalse}>
                    {selectedCard?.endsTurn ? '✓' : '✗'}
                  </span>
                  <span>Ends Turn</span>
                </div>
                <div style={styles.checklistItem}>
                  <span style={selectedCard?.visual?.cutscene ? styles.checkTrue : styles.checkFalse}>
                    {selectedCard?.visual?.cutscene ? '✓' : '✗'}
                  </span>
                  <span>Has Cutscene</span>
                </div>
                <div style={styles.checklistItem}>
                  <span style={selectedCard?.visual?.particles ? styles.checkTrue : styles.checkFalse}>
                    {selectedCard?.visual?.particles ? '✓' : '✗'}
                  </span>
                  <span>Has Particles</span>
                </div>
              </div>

              {/* Turn-end indicator removed per user request */}

              {/* Parameters */}
              {needsTargetSquare(selectedCard.id) && (
                <div style={styles.paramSection}>
                  <h4 style={styles.sectionTitle}>Parameters</h4>
                  <div style={styles.paramRow}>
                    <label>Target: {targetSquare || 'Click board'}</label>
                  </div>
                </div>
              )}
              {needsNewType(selectedCard.id) && (
                <div style={styles.paramRow}>
                  <label>Transform to:</label>
                  <select
                    style={styles.select}
                    value={customParams.newType || 'q'}
                    onChange={(e) => setCustomParams({ ...customParams, newType: e.target.value })}
                  >
                    <option value="q">Queen</option>
                    <option value="r">Rook</option>
                    <option value="b">Bishop</option>
                    <option value="n">Knight</option>
                  </select>
                </div>
              )}

              {/* Event Log */}
              <div style={styles.logSection}>
                <h4 style={styles.sectionTitle}>Event Log</h4>
                <div style={styles.logContainer}>
                  {logMessages.slice().reverse().map((log, idx) => (
                    <div key={idx} style={{ ...styles.logItem, color: getLogColor(log.type) }}>
                      <span style={styles.logTime}>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      <span>{log.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={styles.placeholder}>
              <p>Select a card to begin testing</p>
              <p style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
                Cards are sorted: Common → Legendary → ???
              </p>
            </div>
          )}
        </div>
      </div>

      {metamorphosisDialog && (
        <PieceSelectionDialog
          title="Transform Piece To:"
          pieces={['r', 'b', 'n', 'p']}
          onSelect={(pieceType) => {
            const colorChar = playerColor === 'white' ? 'w' : 'b';
            const params = { targetSquare: metamorphosisDialog.square, newType: pieceType };
            // Use server validation for 1:1 game behavior
            applyCardEffectWithServer(selectedCard, params, colorChar);
            setMetamorphosisDialog(null);
          }}
          onCancel={() => setMetamorphosisDialog(null)}
          showCancel={true}
        />
      )}

    </div>
  );
}

// Helper functions (needsTargetSquare is now imported from arcanaSimulation.js)
function needsNewType(cardId) {
  return cardId === 'metamorphosis';
}

const styles = {
  container: {
    width: '100vw',
    height: '100vh',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 20px',
    background: 'rgba(0,0,0,0.3)',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  backButton: {
    padding: '8px 16px',
    background: '#333',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
  },
  title: {
    margin: 0,
    fontSize: 20,
    fontWeight: 'bold',
  },
  button: {
    padding: '8px 16px',
    background: '#4c6fff',
    border: 'none',
    borderRadius: 4,
    color: '#fff',
    cursor: 'pointer',
    fontSize: 14,
  },
  mainContent: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
    gap: 12,
    padding: 12,
  },
  leftPanel: {
    width: 280,
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 12,
    overflowY: 'auto',
  },
  panelTitle: {
    margin: '0 0 12px 0',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  cardListItem: {
    padding: '8px 12px',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'all 0.2s',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardListName: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  cardListRarity: {
    fontSize: 11,
    textTransform: 'capitalize',
  },
  centerPanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  scenarioBar: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    background: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 8,
  },
  select: {
    padding: '6px 12px',
    background: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: 4,
    color: '#fff',
    fontSize: 14,
  },
  boardContainer: {
    flex: 1,
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    overflow: 'hidden',
  },
  testControls: {
    display: 'flex',
    gap: 12,
    alignItems: 'center',
    background: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#4ade80',
  },
  rightPanel: {
    width: 320,
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    padding: 12,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  cardPreview: {
    display: 'flex',
    justifyContent: 'center',
  },
  descriptionSection: {
    background: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 6,
  },
  descriptionText: {
    margin: 0,
    fontSize: 13,
    lineHeight: '1.5',
    color: '#aaa',
  },
  checklistSection: {
    background: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 6,
  },
  sectionTitle: {
    margin: '0 0 8px 0',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checklistItem: {
    display: 'flex',
    gap: 8,
    alignItems: 'center',
    padding: '4px 0',
    fontSize: 13,
  },
  checkTrue: {
    color: '#22c55e',
    fontWeight: 'bold',
    fontSize: 16,
  },
  checkFalse: {
    color: '#666',
    fontWeight: 'bold',
    fontSize: 16,
  },
  paramSection: {
    background: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 6,
  },
  paramRow: {
    marginBottom: 8,
    fontSize: 13,
  },
  logSection: {
    background: 'rgba(0,0,0,0.3)',
    padding: 12,
    borderRadius: 6,
    flex: 1,
  },
  logContainer: {
    maxHeight: 200,
    overflowY: 'auto',
    fontSize: 12,
  },
  logItem: {
    padding: '4px 0',
    display: 'flex',
    gap: 8,
  },
  logTime: {
    opacity: 0.5,
    fontSize: 11,
  },
  placeholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#666',
  },
};