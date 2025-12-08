import { io } from 'socket.io-client';

// In development connect directly to the backend server to avoid proxy timing issues.
const SERVER_URL = import.meta.env.DEV
  ? 'http://localhost:4000'
  : window.location.origin;

export const socket = io(SERVER_URL, {
  autoConnect: true,
  // prefer websocket transport first to reduce polling requests
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5,
});
