import { spawn } from 'child_process';
import { io } from 'socket.io-client';

const HOST = '127.0.0.1';
const PORT = String(4100 + Math.floor(Math.random() * 200));
const BASE_URL = `http://${HOST}:${PORT}`;

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (!condition) {
    failed++;
    throw new Error(message);
  }
  passed++;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(child, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Server startup timed out')), timeoutMs);

    const onData = (data) => {
      const text = data.toString();
      if (text.includes('Arcana Chess server running on port')) {
        clearTimeout(timeout);
        child.stdout.off('data', onData);
        child.stderr.off('data', onData);
        resolve();
      }
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
}

async function connectClient(name) {
  const socket = io(BASE_URL, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 10000,
  });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${name} failed to connect`)), 10000);
    socket.on('connect', () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.on('connect_error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`${name} connect_error: ${err.message}`));
    });
  });

  return socket;
}

function emitAck(socket, event, payload = {}, timeoutMs = 6000) {
  return new Promise((resolve) => {
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) {
        done = true;
        resolve({ ok: false, error: `${event} ack timeout` });
      }
    }, timeoutMs);

    socket.emit(event, payload, (response) => {
      if (!done) {
        done = true;
        clearTimeout(timeout);
        resolve(response ?? { ok: false, error: `${event} empty ack` });
      }
    });
  });
}

async function run() {
  const serverProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT,
      NODE_ENV: 'test',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let whiteSocket = null;
  let blackSocket = null;
  let socketA = null;
  let socketB = null;

  try {
    await waitForServerReady(serverProcess);

    const arcanaResponse = await fetch(`${BASE_URL}/api/arcana`);
    ok(arcanaResponse.ok, 'GET /api/arcana should return 200');
    const arcanaList = await arcanaResponse.json();
    ok(Array.isArray(arcanaList) && arcanaList.length > 0, '/api/arcana should return non-empty list');

    socketA = await connectClient('clientA');
    socketB = await connectClient('clientB');

    ok(!!socketA.id && !!socketB.id, 'Both sockets should have IDs');

    const created = await emitAck(socketA, 'createLobby', {});
    ok(created?.ok === true && created?.lobby?.id, 'createLobby should succeed');

    const joined = await emitAck(socketB, 'joinLobby', { lobbyId: created.lobby.id });
    ok(joined?.ok === true, 'joinLobby should succeed');

    const started = await emitAck(socketA, 'startGame', { lobbyId: created.lobby.id });
    ok(started?.ok === true && started?.gameState?.id, 'startGame should succeed');

    const playerColors = started.gameState.playerColors || {};
    const whiteId = Object.keys(playerColors).find((id) => playerColors[id] === 'white');
    const blackId = Object.keys(playerColors).find((id) => playerColors[id] === 'black');

    whiteSocket = whiteId === socketA.id ? socketA : socketB;
    blackSocket = blackId === socketA.id ? socketA : socketB;

    ok(!!whiteSocket && !!blackSocket, 'White/Black sockets should be identified');

    const listArcanaAck = await emitAck(whiteSocket, 'getArcanaList', {});
    ok(listArcanaAck?.ok === true && Array.isArray(listArcanaAck.arcana), 'getArcanaList should succeed');

    const whiteMove1 = await emitAck(whiteSocket, 'playerAction', { move: { from: 'e2', to: 'e4' } });
    ok(whiteMove1?.ok === true, 'White legal move e2-e4 should succeed');

    const whiteOutOfTurn = await emitAck(whiteSocket, 'playerAction', { move: { from: 'd2', to: 'd4' } });
    ok(whiteOutOfTurn?.ok === false, 'White out-of-turn move should fail');

    const blackMove1 = await emitAck(blackSocket, 'playerAction', { move: { from: 'e7', to: 'e5' } });
    ok(blackMove1?.ok === true, 'Black legal move e7-e5 should succeed');

    const whiteInvalidMove = await emitAck(whiteSocket, 'playerAction', { move: { from: 'e4', to: 'e6' } });
    ok(whiteInvalidMove?.ok === false, 'Illegal pawn move e4-e6 should fail');

    const whiteCapture = await emitAck(whiteSocket, 'playerAction', { move: { from: 'e4', to: 'e5' } });
    ok(whiteCapture?.ok === false, 'Illegal forward pawn capture should fail');

    const whiteLegal2 = await emitAck(whiteSocket, 'playerAction', { move: { from: 'g1', to: 'f3' } });
    ok(whiteLegal2?.ok === true, 'White legal move g1-f3 should succeed');

    const blackForfeit = await emitAck(blackSocket, 'forfeitGame', {});
    ok(blackForfeit?.ok === true, 'forfeitGame should succeed');

    await delay(200);

    if (whiteSocket && whiteSocket.connected) whiteSocket.disconnect();
    if (blackSocket && blackSocket.connected) blackSocket.disconnect();

    console.log('\n========================================');
    console.log('🧪 LIVE E2E TEST RESULTS');
    console.log('========================================');
    console.log(`✅ Total Passed: ${passed}`);
    console.log(`❌ Total Failed: ${failed}`);
    console.log(`📊 Total Checks: ${passed + failed}`);
    console.log('========================================\n');

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    failed++;
    console.error('❌ E2E test failure:', error.message);
    console.log('\n========================================');
    console.log('🧪 LIVE E2E TEST RESULTS');
    console.log('========================================');
    console.log(`✅ Total Passed: ${passed}`);
    console.log(`❌ Total Failed: ${failed}`);
    console.log(`📊 Total Checks: ${passed + failed}`);
    console.log('========================================\n');
    process.exitCode = 1;
  } finally {
    if (socketA && socketA.connected) socketA.disconnect();
    if (socketB && socketB.connected) socketB.disconnect();

    if (serverProcess && !serverProcess.killed) {
      serverProcess.kill('SIGTERM');
      await delay(300);
      if (!serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }
  }
}

run();
