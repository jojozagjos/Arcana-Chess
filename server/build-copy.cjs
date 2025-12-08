const fs = require('fs');
const path = require('path');

// Copy client/dist to server/public for production deployment
const src = path.join(__dirname, '..', 'client', 'dist');
const dest = path.join(__dirname, 'public');

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

console.log('Copying client build to server/public...');
copyRecursive(src, dest);
console.log('Build copy complete!');
