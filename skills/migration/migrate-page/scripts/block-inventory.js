/**
 * Scan an EDS project's blocks/ directory for available blocks.
 *
 * Usage:
 *   node block-inventory.js <project-path>
 *
 * Programmatic:
 *   const { writeBlockInventory } = require('./block-inventory.js');
 *   writeBlockInventory('/path/to/repo');
 *   // writes .migration/block-inventory.json, prints + returns summary
 */
const fs = require("node:fs");
const path = require("node:path");

function fileSize(p) {
  let stat;
  try {
    stat = fs.statSync(p);
  } catch (err) {
    if (err.code === "ENOENT") return undefined;
    throw err;
  }
  return stat.isFile() ? stat.size : undefined;
}

function isDirectory(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

function scanBlockInventory(projectPath) {
  const entries = [];
  const blocksDir = projectPath + "/blocks";
  let names;
  try {
    names = fs.readdirSync(blocksDir);
  } catch (err) {
    if (err.code === "ENOENT") return entries;
    throw err;
  }
  for (const name of names) {
    const blockDir = blocksDir + "/" + name;
    if (!isDirectory(blockDir)) continue;
    const jsSize = fileSize(blockDir + "/" + name + ".js");
    const cssSize = fileSize(blockDir + "/" + name + ".css");
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

function writeBlockInventory(projectPath) {
  const blocks = scanBlockInventory(projectPath);
  fs.mkdirSync(projectPath + "/.migration", { recursive: true });
  fs.writeFileSync(
    projectPath + "/.migration/block-inventory.json",
    JSON.stringify(blocks, null, 2),
  );
  const summary = {
    blockCount: blocks.length,
    blocks: blocks.map((b) => b.name),
  };
  console.log(JSON.stringify(summary));
  return summary;
}

module.exports = { scanBlockInventory, writeBlockInventory };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  const projectPath = process.argv[2];
  if (!projectPath) {
    console.error("Usage: node block-inventory.js <project-path>");
    process.exit(1);
  }
  if (!fs.existsSync(projectPath)) {
    console.error("block-inventory: project path not found: " + projectPath);
    process.exit(1);
  }
  try {
    writeBlockInventory(projectPath);
  } catch (err) {
    console.error("block-inventory failed: " + err.message);
    process.exit(1);
  }
}
