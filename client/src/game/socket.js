import { io } from 'socket.io-client';

const SERVER_URL = import.meta.env.DEV
  ? 'http://localhost:3000'
  : window.location.origin;

export const socket = io(SERVER_URL, {
  autoConnect: true,
});
