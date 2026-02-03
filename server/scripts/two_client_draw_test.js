import { io } from 'socket.io-client';

const SERVER = process.env.SERVER_URL || 'http://localhost:4000';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('Connecting two test clients to', SERVER);
  const a = io(SERVER, { reconnection: false });
  const b = io(SERVER, { reconnection: false });

  await Promise.all([
    new Promise(res => a.on('connect', () => res())),
    new Promise(res => b.on('connect', () => res())),
  ]);

  console.log('Connected:', a.id, b.id);

  // Create lobby with A, join with B
  const lobby = await new Promise((res) => {
    a.emit('createLobby', {}, (r) => res(r.lobby));
  });
  console.log('Lobby created', lobby.id, lobby.code);

  await new Promise((res) => {
    b.emit('joinLobby', { lobbyId: lobby.id }, (r) => res(r.lobby));
  });
  console.log('B joined lobby');

  // Start game (A triggers)
  const { gameState } = await new Promise((res) => {
    a.emit('startGame', { lobbyId: lobby.id }, (r) => res(r));
  });
  console.log('Game started id=', gameState.id);

  // Map sockets to player ids/colors
  const playerColors = gameState.playerColors || {};
  const whiteId = Object.keys(playerColors).find(k => playerColors[k] === 'white');
  const blackId = Object.keys(playerColors).find(k => playerColors[k] === 'black');

  const sockFor = (id) => (id === a.id ? a : id === b.id ? b : null);

  const whiteSock = sockFor(whiteId);
  const blackSock = sockFor(blackId);
  if (!whiteSock || !blackSock) {
    console.error('Failed to identify white/black sockets from gameState', playerColors);
    process.exit(1);
  }

  console.log('White socket:', whiteId, 'Black socket:', blackId);

  // Helper to emit playerAction and await ack
  function playerAction(sock, payload, timeout = 3000) {
    return new Promise((res) => {
      let done = false;
      const t = setTimeout(() => { if (!done) { done = true; res({ ok: false, error: 'timeout' }); } }, timeout);
      sock.emit('playerAction', payload, (r) => { if (!done) { done = true; clearTimeout(t); res(r); } });
    });
  }

  // Register lightweight listeners to capture 'gameUpdated' for inspection
  const latestState = { a: null, b: null };
  a.on('gameUpdated', (s) => { latestState.a = s; });
  b.on('gameUpdated', (s) => { latestState.b = s; });

  // Helper to get the latest game state for a socket
  function getLatestFor(sock) {
    return sock === a ? latestState.a : latestState.b;
  }

  // First, perform a quick capture sequence to trigger ascension (white capture)
  console.log('\n-- Prep: White plays e2-e4');
  const prep1 = await playerAction(whiteSock, { move: { from: 'e2', to: 'e4' } }, 5000);
  console.log('white move:', prep1.ok ? 'ok' : prep1);

  await wait(200);

  console.log('\n-- Prep: Black plays d7-d5');
  const prep2 = await playerAction(blackSock, { move: { from: 'd7', to: 'd5' } }, 5000);
  console.log('black move:', prep2.ok ? 'ok' : prep2);

  await wait(200);

  console.log('\n-- Prep: White captures e4xd5 to trigger ascension');
  const prep3 = await playerAction(whiteSock, { move: { from: 'e4', to: 'd5' } }, 5000);
  console.log('white capture response:', prep3);

  // Allow server to process ascension state
  await wait(300);

  // After white captures, it's black's turn
  console.log('\n-- Step 1: Black makes a move (e7-e5)');
  const res1 = await playerAction(blackSock, { move: { from: 'e7', to: 'e5' } }, 5000);
  console.log('black move response:', res1.ok ? 'ok' : res1);

  await wait(200);

  // Now it's white's turn - white can draw
  console.log('\n-- Step 2: White draws (should succeed - first draw after ascension)');
  const res2 = await playerAction(whiteSock, { actionType: 'drawArcana' }, 5000);
  console.log('white draw response:', res2.ok ? 'ok' : res2);
  if (!res2.ok) {
    console.error('ERROR: First draw should have succeeded!');
  } else {
    console.log('✓ First draw successful');
  }

  await wait(200);

  // After white draws, it's black's turn
  console.log('\n-- Step 3: Black makes another move (f7-f6)');
  const res3 = await playerAction(blackSock, { move: { from: 'f7', to: 'f6' } }, 5000);
  console.log('black move response:', res3.ok ? 'ok' : res3);

  await wait(200);

  // Now it's white's turn - white tries to draw (only 1 ply since last draw, should be blocked)
  console.log('\n-- Step 4: White tries to draw again (should be BLOCKED - only 1 ply has passed)');
  const res4 = await playerAction(whiteSock, { actionType: 'drawArcana' }, 5000);
  console.log('white draw (immediate) response:', res4.ok ? 'ALLOWED (error!)' : 'BLOCKED (correct)');
  if (res4.ok) {
    console.error('ERROR: Draw should have been blocked but was allowed!');
  } else {
    console.log('✓ Draw correctly blocked');
  }

  await wait(200);

  console.log('\n-- Step 5: White makes a regular move instead (g2-g3)');
  const res5 = await playerAction(whiteSock, { move: { from: 'g2', to: 'g3' } }, 5000);
  console.log('white move response:', res5.ok ? 'ok' : res5);

  await wait(200);

  console.log('\n-- Step 6: Black makes another move (g7-g6)');
  const res6 = await playerAction(blackSock, { move: { from: 'g7', to: 'g6' } }, 5000);
  console.log('black move response:', res6.ok ? 'ok' : res6);

  await wait(200);

  // Now it's white's turn - 3 plies have passed since white last drew (black move, white move, black move)
  console.log('\n-- Step 7: White attempts to draw again (should now be ALLOWED - 3 plies have passed)');
  const res7 = await playerAction(whiteSock, { actionType: 'drawArcana' }, 5000);
  console.log('white draw (after sequence) response:', res7.ok ? 'ALLOWED (correct)' : `BLOCKED: ${res7.error}`);
  if (!res7.ok) {
    console.error('ERROR: Draw should have been allowed but was blocked!', res7);
  } else {
    console.log('✓ Draw correctly allowed');
  }

  // --- Additional checks: independence and draw-after-use ---
  await wait(300);

  console.log('\n-- Independence test: Ensure black can draw on its turn independently');
  // Let black draw on its turn
  // If it's currently white's turn, make a pass move (simple pawn move) to give black a turn
  const cur = getLatestFor(blackSock) || getLatestFor(whiteSock);
  if (cur && cur.turn === 'w') {
    // make a white move to hand turn back to black (if possible)
    await playerAction(whiteSock, { move: { from: 'a2', to: 'a3' } }, 3000).catch(()=>{});
    await wait(200);
  }

  const blackDraw = await playerAction(blackSock, { actionType: 'drawArcana' }, 5000);
  console.log('black draw response:', blackDraw);

  await wait(300);

  console.log('\n-- Draw after use test: White draws, uses a card, then attempts to draw (should be blocked)');
  // Ensure white has at least one card: if not, draw one
  const stateForWhite = getLatestFor(whiteSock);
  const whiteCards = stateForWhite?.arcanaByPlayer?.[whiteSock.id] || [];
  if (!whiteCards || whiteCards.length === 0) {
    const d1 = await playerAction(whiteSock, { actionType: 'drawArcana' }, 5000);
    console.log('white drew for use test:', d1.ok ? 'ok' : d1);
    await wait(200);
  }

  const stateAfterDraw = getLatestFor(whiteSock);
  const cardsNow = stateAfterDraw?.arcanaByPlayer?.[whiteSock.id] || [];
  console.log('white card count before use:', cardsNow.length);

  if (cardsNow.length > 0) {
    // Attempt to use the first card (no targeting params)
    const first = cardsNow[0];
    const useRes = await playerAction(whiteSock, { actionType: 'useArcana', arcanaUsed: [{ arcanaId: first.id, params: {} }] }, 5000);
    console.log('useArcana response:', useRes);
    await wait(300);

    const postUseState = getLatestFor(whiteSock);
    const postCards = postUseState?.arcanaByPlayer?.[whiteSock.id] || [];
    console.log('white card count after use:', postCards.length);

    console.log('Now attempt immediate draw after using a card (should be blocked)');
    const blockedDraw = await playerAction(whiteSock, { actionType: 'drawArcana' }, 5000);
    console.log('draw after use response:', blockedDraw);
  }

  await wait(300);

  console.log('\n-- Draw while in check test: try to force a check and draw (should be blocked)');
  // This is a weaker check: if in-check condition can be simulated, attempt draw and expect error
  const tryCheckDraw = await playerAction(whiteSock, { actionType: 'drawArcana' }, 3000);
  console.log('draw while maybe in-check response:', tryCheckDraw);

  console.log('\nTest completed — closing sockets.');
  a.disconnect(); b.disconnect();
  process.exit(0);
}

run().catch((e) => { console.error('Test failed:', e); process.exit(1); });
