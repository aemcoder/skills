/**
 * Scan an EDS project's blocks/ directory for available blocks.
 *
 * CLI: node block-inventory.js <project-path>
 *
 * Writes <project-path>/.migration/block-inventory.json and prints a
 * summary ({ blockCount, blocks }) to stdout. Uses standard node fs —
 * Slicc's node bridges require('fs'), so the same invocation works
 * inside Slicc and under real node (PLG labs).
 */
const fsp = require('node:fs/promises');

async function fileSize(path) {
  let stat;
  try {
    stat = await fsp.stat(path);
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
  return stat.isFile() ? stat.size : undefined;
}

async function scanBlockInventory(projectPath) {
  const entries = [];

  let dirEntries;
  try {
    dirEntries = await fsp.readdir(projectPath + '/blocks', { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return entries;
    throw err;
  }

  for (const entry of dirEntries) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const blockDir = projectPath + '/blocks/' + name;
    const jsSize = await fileSize(blockDir + '/' + name + '.js');
    const cssSize = await fileSize(blockDir + '/' + name + '.css');
    if (jsSize === undefined && cssSize === undefined) continue;
    entries.push({
      name,
      hasJs: jsSize !== undefined,
      hasCss: cssSize !== undefined,
      jsSize,
      cssSize,
    });
  }

  return entries;
}

module.exports = { scanBlockInventory };

async function main() {
  const projectPath = process.argv[2];
  if (!projectPath) {
    console.error('Usage: node block-inventory.js <project-path>');
    process.exit(1);
  }
  try {
    await fsp.access(projectPath);
  } catch {
    console.error('block-inventory: project path not found: ' + projectPath);
    process.exit(1);
  }
  const blocks = await scanBlockInventory(projectPath);
  await fsp.mkdir(projectPath + '/.migration', { recursive: true });
  await fsp.writeFile(
    projectPath + '/.migration/block-inventory.json',
    JSON.stringify(blocks, null, 2)
  );
  console.log(
    JSON.stringify({ blockCount: blocks.length, blocks: blocks.map((b) => b.name) })
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('block-inventory failed: ' + err.message);
    process.exit(1);
  });
}
