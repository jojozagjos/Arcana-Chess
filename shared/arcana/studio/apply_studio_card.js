import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { rebuildStudioOverridesIndex, writeStudioCardModule } from './studioFileWriter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../..');
const DEFAULT_EXPORTS_DIR = path.resolve(REPO_ROOT, 'studio_exports');
const ARCHIVE_ROOT = path.join(DEFAULT_EXPORTS_DIR, 'archived');
const LAST_ARCHIVE_FOLDER = path.join(ARCHIVE_ROOT, 'last-applied');

function usage() {
  console.log('Usage: node shared/arcana/studio/apply_studio_card.js <card1.json> [card2.json ...]');
  console.log('       node shared/arcana/studio/apply_studio_card.js --all [exports-dir]');
  console.log('');
  console.log('Accepted file types: *.arcana.json');
  console.log('');
  console.log('Examples:');
  console.log('  npm run studio:apply -- ./studio_exports/shield_pawn.arcana.json');
  console.log('  npm run studio:apply');
}

function isSupportedStudioExportFile(name) {
  return name.endsWith('.arcana.json');
}

async function listStudioExportFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && isSupportedStudioExportFile(entry.name))
    .map((entry) => path.join(dirPath, entry.name));
}

async function archiveFiles(files = []) {
  if (files.length === 0) return null;

  await fs.mkdir(ARCHIVE_ROOT, { recursive: true });
  await fs.rm(LAST_ARCHIVE_FOLDER, { recursive: true, force: true });
  await fs.mkdir(LAST_ARCHIVE_FOLDER, { recursive: true });

  for (const filePath of files) {
    try {
      const destination = path.join(LAST_ARCHIVE_FOLDER, path.basename(filePath));
      await fs.rename(filePath, destination);
    } catch {
      // Ignore missing or locked files.
    }
  }

  return LAST_ARCHIVE_FOLDER;
}

async function main() {
  const args = process.argv.slice(2);
  await fs.mkdir(DEFAULT_EXPORTS_DIR, { recursive: true });

  if (args.includes('--help') || args.includes('-h')) {
    usage();
    process.exit(0);
  }

  const allRequested = args.includes('--all') || args.length === 0;
  const positionalArgs = args.filter((arg) => !arg.startsWith('--'));

  let inputPaths = positionalArgs;

  if (allRequested) {
    const directoryArg = positionalArgs[0]
      ? path.resolve(process.cwd(), positionalArgs[0])
      : DEFAULT_EXPORTS_DIR;

    try {
      inputPaths = await listStudioExportFiles(directoryArg);
    } catch {
      console.log(`Exports directory not found: ${path.relative(REPO_ROOT, directoryArg)}`);
      console.log('Create it or pass a directory path: npm run studio:apply -- --all ./your-exports-folder');
      process.exit(0);
    }

    if (inputPaths.length === 0) {
      console.log(`No *.arcana.json files found in ${path.relative(REPO_ROOT, directoryArg)}.`);
      process.exit(0);
    }

    console.log(`Applying ${inputPaths.length} file(s) from ${path.relative(REPO_ROOT, directoryArg)}...`);
  }

  if (inputPaths.length === 0) {
    console.log('No card files were provided.');
    console.log('If you already used Export JSON in Arcana Studio, your override is already applied.');
    console.log('Use --help for usage details.');
    process.exit(0);
  }

  const applied = [];
  const stagedFiles = [];

  for (const inputPath of inputPaths) {
    const absolute = path.resolve(process.cwd(), inputPath);
    const raw = await fs.readFile(absolute, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error(`Invalid card config in ${inputPath}`);
    }

    const id = String(parsed.id || '').trim();
    if (!id) {
      throw new Error(`Missing card id in ${inputPath}`);
    }

    const written = await writeStudioCardModule(REPO_ROOT, parsed);
    applied.push(id);
    stagedFiles.push(absolute);
    console.log(`Wrote ${path.relative(REPO_ROOT, written.filePath)}`);
  }

  await rebuildStudioOverridesIndex(REPO_ROOT);
  const archiveFolder = await archiveFiles(stagedFiles);

  console.log(`Applied ${applied.length} card override(s): ${applied.join(', ')}`);
  console.log(`Updated ${path.relative(REPO_ROOT, path.resolve(REPO_ROOT, 'shared/arcana/studio/studioCutsceneOverrides.js'))}`);
  if (archiveFolder) {
    console.log(`Archived exports to ${path.relative(REPO_ROOT, archiveFolder)}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});