/**
 * Generate scoop creation configs for page migration.
 *
 * CLI: node generate-scoop-prompts.js <migration-dir> [model]
 * Reads <migration-dir>/decomposition.json and prints scoop configs as
 * JSON to stdout. Uses standard node fs — works inside Slicc's node
 * bridge and under real node (PLG labs).
 *
 * Programmatic use: require(...).generateScoopConfigs(decomposition,
 * sourceUrl, projectPath, model?) returns Array<{ name, model, prompt }>.
 *
 * @param {object} decomposition - The decomposition.json content (parsed)
 * @param {string} sourceUrl - The source page URL
 * @param {string} projectPath - The EDS project path (e.g., "/shared/vibemigrated")
 * @param {string} [model='claude-opus-4-6'] - Model ID for scoops.
 * @returns {Array<{name: string, model: string, prompt: string}>}
 */
function generateScoopConfigs(decomposition, sourceUrl, projectPath, model = 'claude-opus-4-6') {
  const configs = [];

  for (const fragment of decomposition.fragments) {
    for (const child of fragment.children || []) {
      if (child.type === 'default-content') continue;

      const blocks = child.type === 'section'
        ? (child.children || []).filter(c => c.type === 'block')
        : [child];

      for (const block of blocks) {
        const isHeader = block.name === 'nav-bar' || block.name === 'header'
          || block.name === 'navigation' || fragment.path === '/nav';
        const isFooter = block.name === 'footer' || block.name === 'footer-links'
          || block.name === 'footer-content' || fragment.path === '/footer';

        const scoopName = block.name + '-block';
        const bounds = block.bounds
          ? `x=${block.bounds.x}, y=${block.bounds.y}, width=${block.bounds.width}, height=${block.bounds.height}`
          : 'unknown';

        let prompt;

        if (isHeader) {
          prompt = buildHeaderPrompt(block, sourceUrl, projectPath, bounds);
        } else if (isFooter) {
          prompt = buildFooterPrompt(block, sourceUrl, projectPath, bounds);
        } else {
          prompt = buildBlockPrompt(block, sourceUrl, projectPath, bounds);
        }

        const config = { name: scoopName, prompt };
        if (model) config.model = model;
        configs.push(config);
      }
    }
  }

  return configs;
}

function buildBlockPrompt(block, sourceUrl, projectPath, bounds) {
  return `You are migrating a single block to EDS.

## Parameters
- Block name: ${block.name}
- Source URL: ${sourceUrl}
- Visual tree ID: ${block.id || 'unknown'}
- Bounds: ${bounds}
- EDS project: ${projectPath}
- Notes: ${block.notes || block.style || ''}

## Instructions
Read /workspace/skills/migrate-block/SKILL.md and follow every step.
The skill tells you how to read head.html from the project.
Do NOT inline CSS or JS as a substitute for the EDS framework.`;
}

function buildHeaderPrompt(block, sourceUrl, projectPath, bounds) {
  return `You are migrating the website header/navigation to EDS.

## Parameters
- Source URL: ${sourceUrl}
- EDS project: ${projectPath}
- Bounds: ${bounds}
- Notes: ${block.notes || block.style || ''}

## Instructions
Read /workspace/skills/migrate-header/SKILL.md and follow it exactly.
This is a HEADER migration, not a regular block. Follow the header skill
exactly — it handles nav.plain.html generation, section-metadata styles,
dropdown detection, and header-specific CSS patterns.`;
}

function buildFooterPrompt(block, sourceUrl, projectPath, bounds) {
  return `You are migrating a single block to EDS.

## Parameters
- Block name: ${block.name}
- Source URL: ${sourceUrl}
- Visual tree ID: ${block.id || 'unknown'}
- Bounds: ${bounds}
- EDS project: ${projectPath}
- Special: This is the FOOTER block. Output footer.plain.html, not ${block.name}.plain.html. See "Footer Block — Special Case" in the migrate-block skill.
- Notes: ${block.notes || block.style || ''}

## Instructions
Read /workspace/skills/migrate-block/SKILL.md and follow every step.
The skill tells you how to read head.html from the project.
Do NOT inline CSS or JS as a substitute for the EDS framework.`;
}

module.exports = { generateScoopConfigs };

async function main() {
  const fsp = require('node:fs/promises');
  const migrationDir = process.argv[2];
  if (!migrationDir) {
    console.error('Usage: node generate-scoop-prompts.js <migration-dir> [model]');
    process.exit(1);
  }
  const decompositionPath = migrationDir + '/decomposition.json';
  let decomposition;
  try {
    decomposition = JSON.parse(await fsp.readFile(decompositionPath, 'utf8'));
  } catch (err) {
    console.error(
      'generate-scoop-prompts: cannot read ' + decompositionPath + ': ' + err.message
    );
    process.exit(1);
  }
  if (!decomposition.url) {
    console.error(
      'generate-scoop-prompts: ' + decompositionPath + ' has no "url" field'
    );
    process.exit(1);
  }
  const projectPath = migrationDir.replace(/\/\.migration\/?$/, '');
  const model = process.argv[3] || 'claude-opus-4-6';
  console.log(
    JSON.stringify(generateScoopConfigs(decomposition, decomposition.url, projectPath, model))
  );
}

if (require.main === module) {
  main().catch((err) => {
    console.error('generate-scoop-prompts failed: ' + err.message);
    process.exit(1);
  });
}
