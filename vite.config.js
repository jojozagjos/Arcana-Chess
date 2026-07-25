import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import fs from 'fs';

/**
 * Exposes `virtual:sound-manifest` — a map of every sfx file present under
 * public/sounds/{arcana,ui}. Drop in a new clip and it is registered
 * automatically; there is no list to maintain by hand.
 *
 * This is a virtual module rather than `import.meta.glob` on purpose: globbing
 * files that already live in publicDir makes Vite emit a second hashed copy of
 * every clip into the bundle (currently ~10MB of duplicated audio). Here we only
 * ever produce the public URLs.
 */
function soundManifestPlugin() {
  const virtualId = 'virtual:sound-manifest';
  const resolvedId = `\0${virtualId}`;
  const soundsDir = path.resolve(__dirname, 'public/sounds');

  const buildManifest = () => {
    const manifest = { arcana: {}, ui: {} };
    for (const folder of ['arcana', 'ui']) {
      const dir = path.join(soundsDir, folder);
      let entries = [];
      try {
        entries = fs.readdirSync(dir);
      } catch {
        continue; // folder absent -> nothing to register
      }
      for (const file of entries) {
        const match = /^(.+)\.(mp3|ogg|wav)$/i.exec(file);
        if (!match) continue;
        const name = match[1];
        const key = folder === 'arcana' ? `arcana:${name}` : name;
        manifest[folder][key] = `/sounds/${folder}/${file}`;
      }
    }
    return manifest;
  };

  return {
    name: 'arcana-sound-manifest',
    resolveId(id) {
      return id === virtualId ? resolvedId : null;
    },
    load(id) {
      if (id !== resolvedId) return null;
      return `export default ${JSON.stringify(buildManifest())};`;
    },
    configureServer(server) {
      // Pick up newly added clips without restarting the dev server.
      server.watcher.add(soundsDir);
      const invalidate = (file) => {
        if (!String(file).startsWith(soundsDir)) return;
        const mod = server.moduleGraph.getModuleById(resolvedId);
        if (mod) {
          server.moduleGraph.invalidateModule(mod);
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.on('add', invalidate);
      server.watcher.on('unlink', invalidate);
    },
  };
}

export default defineConfig({
  // Where your React app source lives
  root: 'client',
  
  // Point to consolidated public folder at repo root
  publicDir: path.resolve(__dirname, 'public'),

  plugins: [react(), soundManifestPlugin()],

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
