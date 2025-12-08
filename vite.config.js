import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  // Where your React app source lives
  root: 'client',

  plugins: [react()],

  server: {
    port: 3000, // Dev client on 3000
    proxy: {
      // Proxy Socket.io to the Node server on 4000
      '/socket.io': {
        target: 'http://localhost:4000',
        ws: true,
      },
      // Proxy any REST API routes if you use them
      '/api': {
        target: 'http://localhost:4000',
      },
    },
  },

  build: {
    // Build into the server's public directory for production
    outDir: '../server/public',
    emptyOutDir: true,
    // Increase warning limit to avoid spurious warnings for big effect files
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Rely on Vite's automatic code-splitting for dynamic imports.
      },
    },
  },
});
