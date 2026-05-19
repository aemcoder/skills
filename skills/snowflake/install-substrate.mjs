#!/usr/bin/env node
/**
 * snowflake substrate installer.
 *
 * Idempotently installs the overlay-pattern substrate on top of a
 * vanilla (or modified) Adobe EDS boilerplate repository. Drives off
 * substrate/MANIFEST.json — adding new files there is enough to extend
 * the installer; no code changes needed.
 *
 * Behavior:
 *   - Detects whether the substrate is already installed by grepping
 *     for the marker string in scripts/scripts.js.
 *   - If installed at the bundled version (per .snowflake/config.json):
 *     no-op.
 *   - If installed at a different version: prints a drift report
 *     and refuses to act unless --force is passed.
 *   - If not installed: copies substrate files into place, backing up
 *     existing versions to .snowflake/.backup/<timestamp>/. Merges
 *     lines into .eslintignore / .stylelintignore / .gitignore
 *     idempotently (no duplicate lines).
 *   - Writes .snowflake/config.json on success.
 *
 * Run from the target EDS repository's root. The installer
 * self-locates the substrate bundle via import.meta.url, so it
 * works regardless of where the skill bundle is mounted.
 *
 * Usage:
 *   node <SKILL_DIR>/install-substrate.mjs           [--dry-run] [--force]
 *
 * Flags:
 *   --dry-run   Print what would change; touch nothing.
 *   --force     Install even if a different-version substrate is detected.
 *
 * Exit codes:
 *   0   Success (installed, no-op, or dry-run completed cleanly)
 *   1   Target repo not detected (no .git, no package.json, etc.)
 *   2   Substrate is already installed at a different version (use --force)
 *   3   Filesystem error during install
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const SKILL_DIR = dirname(fileURLToPath(import.meta.url));
const SUBSTRATE_DIR = join(SKILL_DIR, 'substrate');

const flags = new Set(process.argv.slice(2));
const DRY_RUN = flags.has('--dry-run');
const FORCE = flags.has('--force');

const log = (msg) => console.log(`[snowflake] ${msg}`);
const warn = (msg) => console.warn(`[snowflake] WARN: ${msg}`);
const die = (msg, code = 3) => { console.error(`[snowflake] ${msg}`); process.exit(code); };

// ---------------------------------------------------------------------------
// 1. Locate the target repo (the EDS repo we're installing into)
// ---------------------------------------------------------------------------

let REPO_ROOT;
try {
  REPO_ROOT = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim();
} catch {
  die('not inside a git repository — run this from the target EDS repo root', 1);
}
if (!existsSync(join(REPO_ROOT, 'package.json'))) {
  die(`no package.json at ${REPO_ROOT} — does not look like an EDS boilerplate repo`, 1);
}
log(`target repo: ${REPO_ROOT}`);

// ---------------------------------------------------------------------------
// 2. Load the bundled manifest + version
// ---------------------------------------------------------------------------

const manifest = JSON.parse(readFileSync(join(SUBSTRATE_DIR, 'MANIFEST.json'), 'utf8'));
const bundledVersion = readFileSync(join(SUBSTRATE_DIR, 'VERSION'), 'utf8').trim();
log(`bundled substrate version: ${bundledVersion}`);

// ---------------------------------------------------------------------------
// 3. Detect current substrate state
// ---------------------------------------------------------------------------

const markerPath = join(REPO_ROOT, manifest.marker.file);
let installedVersion = null;
let markerPresent = false;

if (existsSync(markerPath)) {
  const content = readFileSync(markerPath, 'utf8');
  markerPresent = content.includes(manifest.marker.needle);
}

const configPath = join(REPO_ROOT, '.snowflake', 'config.json');
if (existsSync(configPath)) {
  try {
    const cfg = JSON.parse(readFileSync(configPath, 'utf8'));
    installedVersion = cfg.substrateVersion ?? null;
  } catch {
    warn(`.snowflake/config.json is malformed — ignoring`);
  }
}

if (markerPresent) {
  if (installedVersion === bundledVersion) {
    log(`substrate v${bundledVersion} already installed — no-op`);
    process.exit(0);
  }
  if (installedVersion && installedVersion !== bundledVersion && !FORCE) {
    console.error(`[snowflake] substrate is at v${installedVersion}, bundled is v${bundledVersion}`);
    console.error(`[snowflake] re-run with --force to overwrite, or update the bundled version`);
    process.exit(2);
  }
  if (!installedVersion) {
    warn(`marker present in ${manifest.marker.file} but no .snowflake/config.json — treating as drift`);
    if (!FORCE) {
      console.error(`[snowflake] re-run with --force to install at v${bundledVersion}`);
      process.exit(2);
    }
  }
}

if (DRY_RUN) log(`(dry-run — no files will be modified)`);

// ---------------------------------------------------------------------------
// 4. Back up files we're about to overwrite
// ---------------------------------------------------------------------------

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupDir = join(REPO_ROOT, '.snowflake', '.backup', timestamp);

function backupOne(repoRelPath) {
  const src = join(REPO_ROOT, repoRelPath);
  if (!existsSync(src)) return;
  const dst = join(backupDir, repoRelPath);
  if (DRY_RUN) {
    log(`would back up: ${repoRelPath} → .snowflake/.backup/${timestamp}/${repoRelPath}`);
    return;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  log(`backed up: ${repoRelPath}`);
}

// ---------------------------------------------------------------------------
// 5. Replace files per manifest.replace
// ---------------------------------------------------------------------------

for (const entry of manifest.replace) {
  const src = join(SUBSTRATE_DIR, entry.src);
  const dst = join(REPO_ROOT, entry.dst);
  if (!existsSync(src)) die(`bundle missing: ${entry.src}`);
  backupOne(entry.dst);
  if (DRY_RUN) {
    log(`would replace: ${entry.dst}  (purpose: ${entry.purpose})`);
    continue;
  }
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  log(`replaced: ${entry.dst}`);
}

// ---------------------------------------------------------------------------
// 6. Merge ignore-file patches (idempotent: skip lines already present)
// ---------------------------------------------------------------------------

function mergeLines(repoRelPath, linesToAdd) {
  const path = join(REPO_ROOT, repoRelPath);
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const existingLines = new Set(existing.split('\n'));

  const additions = linesToAdd.filter((l) => !existingLines.has(l));
  if (additions.length === 0) {
    log(`no changes needed: ${repoRelPath}`);
    return;
  }

  if (DRY_RUN) {
    log(`would append ${additions.length} line(s) to ${repoRelPath}:`);
    additions.forEach((l) => log(`    + ${l}`));
    return;
  }

  backupOne(repoRelPath);
  const next = existing
    + (existing.endsWith('\n') || existing.length === 0 ? '' : '\n')
    + additions.join('\n')
    + '\n';
  writeFileSync(path, next);
  log(`appended ${additions.length} line(s) to ${repoRelPath}`);
}

for (const patch of manifest.ignorePatches ?? []) {
  mergeLines(patch.dst, patch.lines);
}

if (manifest.gitignore) {
  mergeLines(manifest.gitignore.dst, manifest.gitignore.lines);
}

// ---------------------------------------------------------------------------
// 7. Write .snowflake/config.json with installed version
// ---------------------------------------------------------------------------

const snowflakeDir = join(REPO_ROOT, '.snowflake');
const configOut = {
  substrateVersion: bundledVersion,
  installedAt: new Date().toISOString(),
  installedFrom: relative(REPO_ROOT, SKILL_DIR) || SKILL_DIR,
};
if (DRY_RUN) {
  log(`would write .snowflake/config.json: ${JSON.stringify(configOut)}`);
} else {
  mkdirSync(snowflakeDir, { recursive: true });
  const merged = existsSync(configPath)
    ? { ...JSON.parse(readFileSync(configPath, 'utf8')), ...configOut }
    : configOut;
  writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n');
  log(`wrote .snowflake/config.json`);
}

log(`done — substrate v${bundledVersion} ${DRY_RUN ? 'would be ' : ''}installed`);
