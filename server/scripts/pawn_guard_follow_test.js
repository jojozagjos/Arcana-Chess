import { io } from 'socket.io-client';

const SERVER = process.env.SERVER_URL || 'http://localhost:4000';
function wait(ms){return new Promise(r=>setTimeout(r,ms));}

async function run(){
  const a = io(SERVER, { reconnection: false });
  const b = io(SERVER, { reconnection: false });
  await Promise.all([new Promise(r=>a.on('connect',r)), new Promise(r=>b.on('connect',r))]);
  console.log('connected', a.id, b.id);
  const lobby = await new Promise(res=> a.emit('createLobby', {}, r=> res(r.lobby)));
  await new Promise(res=> b.emit('joinLobby', { lobbyId: lobby.id }, r=> res(r.lobby)));
  const { gameState } = await new Promise(res=> a.emit('startGame', { lobbyId: lobby.id }, r=> res(r)));
  console.log('game started', gameState.id);

  const latest = { a: null, b: null };
  a.on('gameUpdated', s=> latest.a = s);
  b.on('gameUpdated', s=> latest.b = s);

  const playerColors = gameState.playerColors;
  const whiteId = Object.keys(playerColors).find(k=> playerColors[k] === 'white');
  const blackId = Object.keys(playerColors).find(k=> playerColors[k] === 'black');
  const sockFor = id => id === a.id ? a : id === b.id ? b : null;
  const whiteSock = sockFor(whiteId);
  const blackSock = sockFor(blackId);
  function action(sock,payload){ return new Promise(res=> sock.emit('playerAction', payload, r=> res(r))); }

  // quick sequence to ascension
  await action(whiteSock, { move: { from: 'e2', to: 'e4' }});
  await wait(50);
  await action(blackSock, { move: { from: 'd7', to: 'd5' }});
  await wait(50);
  await action(whiteSock, { move: { from: 'e4', to: 'd5' }});
  await wait(200);

  // Ensure white has pawn_guard in hand (it should after ascension draws may vary) - draw until it has one
  let state = latest.a || latest.b || gameState;
  let attempts = 0;
  while((!(state.arcanaByPlayer && state.arcanaByPlayer[whiteSock.id] && state.arcanaByPlayer[whiteSock.id].some(c=>c.id==='pawn_guard')) ) && attempts < 5){
    await action(whiteSock, { actionType: 'drawArcana' });
    await wait(200);
    state = latest.a || latest.b || state;
    attempts++;
  }
  state = latest.a || latest.b || state;
  console.log('white cards:', (state.arcanaByPlayer[whiteSock.id]||[]).map(c=>c.id));

  const pawnGuard = (state.arcanaByPlayer[whiteSock.id]||[]).find(c=>c.id==='pawn_guard');
  if(!pawnGuard){ console.log('pawn_guard not found after draws'); a.disconnect(); b.disconnect(); process.exit(0);} 

  // Use pawn_guard on pawn at e5? find a white pawn square
  const pawnSquares = Object.keys(state.pawnShields || {}).length ? [] : [];
  // pick a pawn at d5 (we moved there)
  const target = 'd5';
  console.log('using pawn_guard on', target);
  const useRes = await action(whiteSock, { actionType: 'useArcana', arcanaUsed: [{ arcanaId: 'pawn_guard', params: { targetSquare: target } }] });
  console.log('useRes', useRes);
  await wait(200);
  state = latest.a || latest.b || state;
  console.log('pawnShields after use:', state.pawnShields);

  // Now move the guarding pawn (d5 -> d6)
  const moveRes = await action(whiteSock, { move: { from: 'd5', to: 'd6' } });
  console.log('moveRes', moveRes.ok ? 'ok' : moveRes);
  await wait(200);
  state = latest.a || latest.b || state;
  console.log('pawnShields after pawn moved:', state.pawnShields);

  a.disconnect(); b.disconnect();
  process.exit(0);
}

run().catch(e=>{ console.error(e); process.exit(1); });
