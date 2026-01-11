import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function pascalCase(id) {
  return id.split(/[_-]/).map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..', '..');
const sharedDefs = fs.readFileSync(path.join(root, 'shared', 'arcanaDefinitions.js'), 'utf8');
const visuals = fs.readFileSync(path.join(root, 'client', 'src', 'game', 'arcana', 'arcanaVisuals.jsx'), 'utf8');

// extract arcana ids from shared definitions
const ids = [];
const idRe = /id:\s*['"]([^'\"]+)['"]/g;
let m;
while ((m = idRe.exec(sharedDefs)) !== null) ids.push(m[1]);

// extract exported effect function names and their param lists
const exportRe = /export function (\w+Effect)\s*\(([^)]*)\)/g;
const exportsMap = {};
while ((m = exportRe.exec(visuals)) !== null) {
  const name = m[1];
  const params = m[2].replace(/\s+/g, ' ').trim();
  exportsMap[name] = params;
}

const report = [];
for (const id of ids) {
  const comp = pascalCase(id) + 'Effect';
  const exists = !!exportsMap[comp];
  const params = exportsMap[comp] || null;
  report.push({ arcanaId: id, expectedComponent: comp, exists, params });
}

console.log(JSON.stringify(report, null, 2));
