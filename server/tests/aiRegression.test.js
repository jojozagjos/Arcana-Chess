import { GameManager } from '../gameManager.js';

function createManager() {
  const io = {
    to: () => ({ emit: () => {} }),
    sockets: { sockets: { get: () => true } },
  };
  const lobbyManager = { lobbies: new Map(), socketToLobby: new Map() };
  return new GameManager(io, lobbyManager);
}

async function runScenario({ name, fen, difficulty = 'Monarch', expectedSans = null }) {
  const gm = createManager();
  const state = await gm.startAIGame(
    { id: `human-${name}` },
    { gameMode: 'Classic', difficulty, playerColor: 'white', timeControl: 5 },
  );

  const gameState = gm.games.get(state.id);
  const aiId = gameState.playerIds.find((id) => id.startsWith('AI-'));
  gameState.chess.load(fen);
  gameState.currentTurnSocket = aiId;

  const legalSans = new Set((gameState.chess.moves({ verbose: true }) || []).map((m) => m.san));
  await gm.performAIMove(gameState);
  const chosenSan = gameState.lastMove?.san || null;

  const legalOk = !!chosenSan && legalSans.has(chosenSan);
  const expectedOk = !expectedSans || expectedSans.includes(chosenSan);

  return {
    name,
    difficulty,
    chosenSan,
    legalOk,
    expectedOk,
    expectedSans,
  };
}

async function runDistributionCheck() {
  const samples = 10;
  const out = {};

  for (const difficulty of ['Scholar', 'Knight', 'Monarch']) {
    const counts = {};
    let totalMs = 0;

    for (let i = 0; i < samples; i += 1) {
      const gm = createManager();
      const t0 = Date.now();
      const state = await gm.startAIGame(
        { id: `human-${difficulty}-${i}` },
        { gameMode: 'Classic', difficulty, playerColor: 'black', timeControl: 5 },
      );
      totalMs += Date.now() - t0;
      const san = state.lastMove?.san || 'none';
      counts[san] = (counts[san] || 0) + 1;
    }

    out[difficulty] = {
      avgMs: Math.round(totalMs / samples),
      uniqueMoves: Object.keys(counts).length,
      counts,
    };
  }

  return out;
}

async function main() {
  const scenarios = [
    {
      name: 'en-passant-capture',
      fen: '4k3/8/8/8/3pP3/8/8/4K3 b - e3 0 1',
      expectedSans: null,
    },
    {
      name: 'avoid-blunder-under-check',
      fen: '4k3/8/8/8/8/8/6q1/5K1R b - - 0 1',
      expectedSans: null,
    },
    {
      name: 'castling-available',
      fen: 'r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1',
      expectedSans: null,
    },
  ];

  const scenarioResults = [];
  for (const scenario of scenarios) {
    scenarioResults.push(await runScenario(scenario));
  }

  const distribution = await runDistributionCheck();

  const scenarioFailures = scenarioResults.filter((r) => !r.legalOk || !r.expectedOk);
  const personalityCheck = distribution.Scholar.uniqueMoves >= distribution.Monarch.uniqueMoves;

  console.log(JSON.stringify({ scenarioResults, distribution, personalityCheck }, null, 2));

  if (scenarioFailures.length > 0 || !personalityCheck) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[ai_regression] failed', err);
  process.exitCode = 1;
});
