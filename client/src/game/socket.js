import { io } from 'socket.io-client';

// In development connect directly to the backend server to avoid proxy timing issues.
const SERVER_URL = import.meta.env.DEV
  ? 'http://localhost:4000'
  : window.location.origin;

const MAX_RECONNECTION_ATTEMPTS = 5;

export const socket = io(SERVER_URL, {
  autoConnect: true,
  // prefer websocket transport first to reduce polling requests
  transports: ['websocket', 'polling'],
  reconnectionAttempts: MAX_RECONNECTION_ATTEMPTS,
});

socket.on('reconnect_failed', () => {
  console.error('Socket reconnection failed: maximum reconnection attempts exhausted.');
  if (typeof window !== 'undefined' && typeof window.alert === 'function') {
    window.alert('Connection to the server was lost and could not be restored. Please check your network and refresh the page.');
  }
});
