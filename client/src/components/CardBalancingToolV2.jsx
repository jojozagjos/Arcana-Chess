import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Chess } from 'chess.js';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { socket } from '../game/socket.js';
import { soundManager } from '../game/soundManager.js';
import { ARCANA_DEFINITIONS } from '../game/arcanaDefinitions.js';
import { ArcanaCard } from './ArcanaCard.jsx';
import { ChessPiece } from './ChessPiece.jsx';
import { getArcanaEnhancedMoves } from '../game/arcanaMovesHelper.js';
import { simulateArcanaEffect, needsTargetSquare, validateArcanaTarget, getValidTargetSquares, getTargetTypeForArcana } from '../game/arcana/arcanaSimulation.js';
import { ArcanaVisualHost } from '../game/arcana/ArcanaVisualHost.jsx';
import { GhostPiece, CameraController, GrayscaleEffect, squareToPosition } from '../game/arcana/sharedHelpers.jsx';
import { getArcanaEffectDuration } from '../game/arcana/arcanaTimings.js';
import { getRarityColor, getLogColor } from '../game/arcanaHelpers.js';
import * as THREE from 'three';

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
  const [scenario, setScenario] = useState('default');
  const [fen, setFen] = useState(TEST_SCENARIOS.default.fen);
  const [chess, setChess] = useState(new Chess());
  const [playerColor, setPlayerColor] = useState('white');
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [targetSquare, setTargetSquare] = useState(null);
  const [targetingMode, setTargetingMode] = useState(false);
  const [customParams, setCustomParams] = useState({});
  const [logMessages, setLogMessages] = useState([]);
  const [effectsModule, setEffectsModule] = useState(null);
  
  // Card state tracking
  const [pawnShields, setPawnShields] = useState({ w: null, b: null });
  const [shieldTurnCounter, setShieldTurnCounter] = useState({ w: 0, b: 0 }); // Tracks turns for shield expiration
  const [activeEffects, setActiveEffects] = useState({});
  const [visualEffects, setVisualEffects] = useState([]);
  const [cutsceneActive, setCutsceneActive] = useState(false);
  const [cameraTarget, setCameraTarget] = useState(null);
  const [grayscaleIntensity, setGrayscaleIntensity] = useState(0);
  
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
  
  // Highlighted squares for Line of Sight, Vision, Map Fragments, etc
  const [highlightedSquares, setHighlightedSquares] = useState([]);
  const [highlightColor, setHighlightColor] = useState('#88c0d0');

  const selectedCard = useMemo(() => {
    return ARCANA_DEFINITIONS.find(c => c.id === selectedCardId);
  }, [selectedCardId]);

  // Sort cards by rarity (Common -> Legendary)
  const sortedCards = useMemo(() => {
    const rarityOrder = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
    return [...ARCANA_DEFINITIONS].sort((a, b) => {
      const orderDiff = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      if (orderDiff !== 0) return orderDiff;
      return a.name.localeCompare(b.name);
    });
  }, []);

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
    import('../game/arcana/arcanaVisuals.jsx').then(m => setEffectsModule(m)).catch(() => {});
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
    setSelectedSquare(null);
    setTargetSquare(null);
    setTargetingMode(false);
    setCustomParams({});
    setPawnShields({ w: null, b: null });
    setShieldTurnCounter({ w: 0, b: 0 });
    setActiveEffects({});
    setVisualEffects([]);
    setMoveHistory([]);
    setLegalTargets([]);
    setCutsceneActive(false);
    setGrayscaleIntensity(0);
    setActiveVisualArcana(null);
    setHighlightedSquares([]);
    setHighlightColor('#88c0d0');
    setValidTargetSquares([]);
    setValidationChecklist({ logic: false, visuals: false, sound: false, cutscene: false, server: false });
    setServerTestActive(false);
    setServerTestResult(null);
    addLog('Test reset', 'info');
  };

  // Server validation: creates a test game, applies arcana, verifies behavior
  const testWithServer = async () => {
    if (!selectedCard) {
      addLog('Select a card first to test with server', 'warning');
      return;
    }

    setServerTestActive(true);
    addLog(`Testing ${selectedCard.name} with server...`, 'info');

    try {
      // Create a test game
      const testGameId = `test-${Date.now()}`;
      const testPayload = {
        arcanaId: selectedCard.id,
        fen: chess.fen(),
        params: targetSquare ? { targetSquare } : {},
      };

      // Send test request to server
      socket.emit('balancingToolTest', testPayload, (response) => {
        setServerTestActive(false);
        
        if (response.success) {
          addLog(`✓ Server validation passed: ${selectedCard.name}`, 'success');
          setServerTestResult({ success: true, data: response });
          setValidationChecklist(prev => ({ ...prev, server: true }));
        } else {
          addLog(`✗ Server validation failed: ${response.error}`, 'error');
          setServerTestResult({ success: false, error: response.error });
        }
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (serverTestActive) {
          setServerTestActive(false);
          addLog('Server test timed out', 'error');
          setServerTestResult({ success: false, error: 'Timeout' });
        }
      }, 5000);

    } catch (err) {
      setServerTestActive(false);
      addLog(`Server test error: ${err.message}`, 'error');
      setServerTestResult({ success: false, error: err.message });
    }
  };

  const testCard = () => {
    if (!selectedCard) return;

    // Play card draw sound first (when you select/activate the card)
    try {
      soundManager.play('cardDraw');
    } catch (err) {
      addLog(`Sound error: ${err.message}`, 'warning');
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
      
      const targetType = getTargetTypeForArcana(selectedCard.id);
      const targetDescription = {
        'pawn': 'pawn',
        'piece': 'piece',
        'pieceNoKing': 'piece (not king)',
        'pieceNoQueenKing': 'piece (not queen or king)',
        'pieceWithMoves': 'piece that has legal moves',
        'pieceWithPushTarget': 'piece that can be pushed',
        'knight': 'knight',
        'bishop': 'bishop',
        'enemyPiece': 'enemy piece',
        'enemyRook': 'enemy rook',
        'poisoned': 'poisoned piece',
        'square': 'square'
      }[targetType] || 'target';
      
      addLog(`Select a ${targetDescription} for ${selectedCard.name} (${validSquares.length} valid targets highlighted)`, 'info');
    } else {
      // Apply immediately for cards that don't need targets
      const colorChar = playerColor === 'white' ? 'w' : 'b';
      applyCardEffect(selectedCard, {}, colorChar);
    }
  };

  const applyCardEffect = (card, params, colorChar) => {
    const testChess = new Chess(chess.fen());
    const testGameState = { 
      pawnShields, 
      shieldTurnCounter, 
      moveHistory,
      activeEffects: { ...activeEffects } || {}
    };

    // Use shared simulation logic
    const result = simulateArcanaEffect(testChess, card.id, params, colorChar, testGameState);

    // Update activeEffects from the simulation result
    if (testGameState.activeEffects) {
      setActiveEffects(testGameState.activeEffects);
    }

    // Play sound if specified
    if (result.soundEffect) {
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
    if (result.visualEffect) {
      setValidationChecklist(prev => ({ ...prev, visuals: true }));
      
      // Set the active visual arcana to trigger the shared renderer
      setActiveVisualArcana({
        arcanaId: card.id,
        params: params
      });

      // Clear visual after animation duration (use shared timing)
      const duration = getArcanaEffectDuration(card.id);
      setTimeout(() => {
        setActiveVisualArcana(null);
      }, duration || 3000);
      
      // Handle shield (persistent effect)
      if (result.visualEffect === 'shield') {
        setPawnShields(prev => ({ ...prev, [colorChar]: { square: params.targetSquare } }));
        setShieldTurnCounter(prev => ({ ...prev, [colorChar]: 1 }));
      }
    }

    // Special handling for specific cards
    if (card.id === 'shield_pawn' && result.success) {
      setPawnShields(prev => ({ ...prev, [colorChar]: { square: params.targetSquare } }));
      setShieldTurnCounter(prev => ({ ...prev, [colorChar]: 1 }));
      addLog(`${result.message} - protected for 1 enemy turn`, 'success');
      setValidationChecklist(prev => ({ ...prev, logic: true }));
      setChess(testChess);
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
        setTimeout(() => setCutsceneActive(false), getArcanaEffectDuration('temporal_echo'));
        return;
      }
    }

    if (card.id === 'time_travel') {
      setCameraTarget(new THREE.Vector3(0, 20, 0));
      setCutsceneActive(true);
      setGrayscaleIntensity(1);
      
      setTimeout(() => {
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

    // Update chess state and log result
    if (result.success) {
      setChess(testChess);
      setValidationChecklist(prev => ({ ...prev, logic: true }));
    }
    
    addLog(result.message, result.success ? 'success' : 'error');
  };

  const handleSquareClick = (fileIndex, rankIndex) => {
    const fileChar = 'abcdefgh'[fileIndex];
    const rankNum = 8 - rankIndex;
    const square = `${fileChar}${rankNum}`;

    // If we're in targeting mode for a card test, validate and set target square
    if (targetingMode && selectedCard) {
      // Check if this is a valid target
      if (!validTargetSquares.includes(square)) {
        const targetType = getTargetTypeForArcana(selectedCard.id);
        const targetDescription = {
          'pawn': 'one of your pawns',
          'piece': 'one of your pieces',
          'pieceNoKing': 'one of your pieces (not king)',
          'pieceNoQueenKing': 'one of your pieces (not queen or king)',
          'pieceWithMoves': 'one of your pieces that has legal moves',
          'pieceWithPushTarget': 'one of your pieces that can be pushed',
          'knight': 'one of your knights',
          'bishop': 'one of your bishops',
          'enemyPiece': 'an enemy piece',
          'enemyRook': 'an enemy rook',
          'poisoned': 'a poisoned piece',
          'square': 'any square'
        }[targetType] || 'a valid target';
        addLog(`Invalid target! Please select ${targetDescription}`, 'error');
        return;
      }
      
      setTargetSquare(square);
      setTargetingMode(false);
      setValidTargetSquares([]);
      addLog(`Targeting ${square} for ${selectedCard.name}`, 'info');
      
      const colorChar = playerColor === 'white' ? 'w' : 'b';
      const params = { ...customParams, targetSquare: square };
      applyCardEffect(selectedCard, params, colorChar);
      return;
    }

    // Otherwise, handle piece movement
    if (!selectedSquare) {
      setSelectedSquare(square);
      const piece = chess.get(square);
      if (piece) {
        // Get both standard and arcana-enhanced moves
        const colorChar = playerColor === 'white' ? 'w' : 'b';
        const standardMoves = chess.moves({ square, verbose: true });
        const arcanaMoves = getArcanaEnhancedMoves(chess, square, colorChar, activeEffects || {});
        
        // Merge moves, avoiding duplicates
        const allMoveTargets = new Set(standardMoves.map(m => m.to));
        arcanaMoves.forEach(m => allMoveTargets.add(m.to));
        
        setLegalTargets([...allMoveTargets]);
        addLog(`Selected square: ${square} (${allMoveTargets.size} legal moves)`, 'info');
      } else {
        addLog(`Selected square: ${square} (empty)`, 'info');
      }
    } else if (legalTargets.includes(square)) {
      // Make a move - try standard first, then arcana
      const colorChar = playerColor === 'white' ? 'w' : 'b';
      let move = null;
      let capturedPiece = null;
      
      try {
        move = chess.move({ from: selectedSquare, to: square });
        capturedPiece = move?.captured;
      } catch (standardErr) {
        // If standard move fails, try arcana-enhanced move
        const arcanaMoves = getArcanaEnhancedMoves(chess, selectedSquare, colorChar, activeEffects || {});
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
        
        soundManager.play(capturedPiece ? 'capture' : 'move');
        setMoveHistory(prev => [...prev, { ...move, fen: chess.fen() }]);
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
        const arcanaMoves = getArcanaEnhancedMoves(chess, square, colorChar, activeEffects || {});
        
        const allMoveTargets = new Set(standardMoves.map(m => m.to));
        arcanaMoves.forEach(m => allMoveTargets.add(m.to));
        
        setLegalTargets([...allMoveTargets]);
        addLog(`Selected square: ${square} (${allMoveTargets.size} legal moves)`, 'info');
      } else {
        addLog(`Selected square: ${square} (empty)`, 'info');
      }
    }
  };

  const parseFenPieces = (fenStr) => {
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
  };

  const pieces = parseFenPieces(fen);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backButton} onClick={onBack}>← Back</button>
        <h2 style={styles.title}>Card Balancing & Testing Tool V2</h2>
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
          <h3 style={styles.panelTitle}>Cards (Common → Legendary)</h3>
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
            >
              <color attach="background" args={["#0b1020"]} />
              <ambientLight intensity={0.4} />
              <directionalLight position={[10, 15, 5]} intensity={1.2} castShadow />
              <directionalLight position={[-5, 8, -5]} intensity={0.4} color="#88c0d0" />
              <pointLight position={[0, 5, 0]} intensity={0.6} color="#d8dee9" />
              <Environment preset="night" />
              <OrbitControls enablePan={false} minDistance={8} maxDistance={20} />

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
            <button
              style={{ ...styles.button, background: selectedCard ? '#4c6fff' : '#555' }}
              onClick={testCard}
              disabled={!selectedCard || targetingMode}
            >
              {targetingMode ? 'Targeting...' : 'Test Card'}
            </button>
            <button
              style={{ ...styles.button, background: serverTestActive ? '#ff8800' : '#2a7a2a' }}
              onClick={testWithServer}
              disabled={!selectedCard || serverTestActive}
            >
              {serverTestActive ? 'Testing...' : 'Test with Server'}
            </button>
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
          </div>
        </div>

        {/* Right: Details & Checklist */}
        <div style={styles.rightPanel}>
          {selectedCard ? (
            <>
              <div style={styles.cardPreview}>
                <ArcanaCard arcana={selectedCard} size="medium" />
              </div>

              {/* Card Description */}
              <div style={styles.descriptionSection}>
                <h4 style={styles.sectionTitle}>Description</h4>
                <p style={styles.descriptionText}>{selectedCard.description}</p>
              </div>

              {/* Validation Checklist */}
              <div style={styles.checklistSection}>
                <h4 style={styles.sectionTitle}>Card Status</h4>
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
                    {validationChecklist.sound ? '✓' : '✗'}
                  </span>
                  <span>Sound Working</span>
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
                  <span>Server Validated</span>
                </div>
              </div>

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
                Cards are sorted: Common → Legendary
              </p>
            </div>
          )}
        </div>
      </div>
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
