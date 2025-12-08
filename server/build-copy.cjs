const fs = require('fs');
const path = require('path');

// Copy client build output to server/public for production deployment.
// Try multiple candidate locations so the script works both locally
// and in hosting environments (Render, CI, etc.).
const dest = path.join(__dirname, 'public');

// Allow overriding via environment variable (e.g., in CI/deploy):
//   CLIENT_BUILD_DIR=/absolute/path/to/client/dist
const candidates = [];

if (process.env.CLIENT_BUILD_DIR) {
  candidates.push(path.resolve(process.env.CLIENT_BUILD_DIR));
}

// Fallback candidate locations:
candidates.push(
  // Relative to repository root when running npm from project root
  path.join(__dirname, '..', 'client', 'dist'),
  path.join(process.cwd(), 'client', 'dist'),
  // Some setups output to repository-level `dist`
  path.join(__dirname, '..', 'dist'),
  path.join(process.cwd(), 'dist'),
  // Render's working tree path (common in some deploy logs)
  path.join('/', 'opt', 'render', 'project', 'src', 'client', 'dist')
);

function findExistingCandidate(list) {
  for (const p of list) {
    try {
      if (fs.existsSync(p)) return p;
    } catch (e) {
      // ignore and try next
    }
  }
  return null;
}

const src = findExistingCandidate(candidates);

function copyRecursive(source, destination) {
  if (!fs.existsSync(source)) {
    console.warn(`Warning: Source directory ${source} does not exist. Skipping copy.`);
    return;
  }

  if (!fs.existsSync(destination)) {
    fs.mkdirSync(destination, { recursive: true });
  }

  const entries = fs.readdirSync(source, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(source, entry.name);
    const destPath = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!src) {
  // Check if the destination already has the build output (vite.config.js might use outDir: '../server/public')
  const indexExists = fs.existsSync(path.join(dest, 'index.html'));
  if (indexExists) {
    console.log('Client build already present in server/public (built directly to destination). Copy not needed.');
  } else {
    console.warn('Warning: No client build directory found. Attempted the following paths:');
    for (const p of candidates) console.warn(' -', p);
    console.warn('Skipping copy. If you built the client into a different folder, set an environment variable `CLIENT_BUILD_DIR` or update this script.');
  }
} else {
  console.log('Copying client build from', src, 'to', dest);
  copyRecursive(src, dest);
  console.log('Build copy complete!');
}

// Also copy a root-level favicon.ico into server/public if present (helps when Vite built directly into server/public)
try {
  const rootFavicon = path.join(__dirname, '..', 'favicon.ico');
  const destFavicon = path.join(dest, 'favicon.ico');
  if (fs.existsSync(rootFavicon)) {
    fs.copyFileSync(rootFavicon, destFavicon);
    console.log('Copied root favicon to', destFavicon);
  }
} catch (e) {
  // Non-fatal; ignore copy errors for favicon
}
