/**
 * Generate sub-agent configs for page migration.
 *
 * Usage:
 *   node generate-agent-prompts.js <migration-dir> [model]
 *
 * Programmatic:
 *   const { generateConfigsFromFile } = require('./generate-agent-prompts.js');
 *   const configs = generateConfigsFromFile('/path/to/repo/.migration');
 *
 * @param {object} decomposition - The decomposition.json content (parsed)
 * @param {string} sourceUrl - The source page URL
 * @param {string} projectPath - The EDS project path
 * @param {string} [model] - Optional model ID for sub-agents. OMIT to let the
 *   orchestrator's sub-agent inherit the default model (recommended).
 * @returns {Array<{name: string, prompt: string, model?: string}>} `model` is
 *   present only when an explicit id was passed.
 */
/**
 * Read an optional JSON file, returning null on missing/parse errors.
 */
function readOptionalJson(filePath) {
	const fs = require("node:fs");
	try {
		return JSON.parse(fs.readFileSync(filePath, "utf8"));
	} catch {
		return null;
	}
}

/**
 * Build the enrichment context block that gets appended to every
 * sub-agent prompt. Gives agents measured data so they don't have to
 * re-derive colors, fonts, or asset URLs from the live page.
 */
function buildEnrichmentContext(migrationDir) {
	const brand = readOptionalJson(migrationDir + "/brand.json");
	const inventory = readOptionalJson(
		migrationDir + "/block-inventory.json",
	);

	const sections = [];

	if (brand) {
		const colors = brand.colors || {};
		const fonts = brand.fonts || {};
		const spacing = brand.spacing || {};
		sections.push(`## Brand Context (from extraction)
- Background: ${colors.background || "unknown"}
- Text: ${colors.text || "unknown"}
- Link: ${colors.link || "unknown"}
- Link hover: ${colors.linkHover || "unknown"}
- Light section: ${colors.light || "unknown"}
- Dark section: ${colors.dark || "unknown"}
- Heading font: ${fonts.heading?.family || "unknown"}
- Body font: ${fonts.body?.family || "unknown"}
- Section padding: ${spacing.sectionPadding || "unknown"}
- Content max-width: ${spacing.contentMaxWidth || "unknown"}
- Nav height: ${spacing.navHeight || "unknown"}`);
	}

	if (inventory && inventory.length > 0) {
		const names = inventory.map((b) => b.name).join(", ");
		sections.push(
			`## Existing Blocks in Project\n` +
				`${names}\n` +
				`If your block name matches an existing one, read its JS to ` +
				`understand the contract before writing new code.`,
		);
	}

	sections.push(
		`## Layout Contract\n` +
			`The orchestrator set section max-width, gutters, and spacing in ` +
			`styles.css. Do NOT override \`.{blockName}-wrapper\` max-width ` +
			`or padding. If your block needs full-bleed, report ` +
			`\`"fullWidth": true\` in your completion payload.`,
	);

	return sections.length > 0 ? "\n\n" + sections.join("\n\n") : "";
}

function generateAgentConfigs(
	decomposition,
	sourceUrl,
	projectPath,
	model = "",
	enrichment = "",
) {
	const configs = [];

	for (const fragment of decomposition.fragments) {
		for (const child of fragment.children || []) {
			if (child.type === "default-content") continue;

			const isSection = child.type === "section";
			const sectionHasHeading =
				isSection &&
				(child.children || []).some((c) => c.type === "default-content");
			const blocks = isSection
				? (child.children || []).filter((c) => c.type === "block")
				: [child];

			for (const block of blocks) {
				const isHeader =
					block.name === "nav-bar" ||
					block.name === "header" ||
					block.name === "navigation" ||
					fragment.path === "/nav";
				const isFooter =
					block.name === "footer" ||
					block.name === "footer-links" ||
					block.name === "footer-content" ||
					fragment.path === "/footer";

				const agentName = block.name + "-block";
				const bounds = block.bounds
					? `x=${block.bounds.x}, y=${block.bounds.y}, width=${block.bounds.width}, height=${block.bounds.height}`
					: "unknown";

				let prompt;

				if (isHeader) {
					prompt = buildHeaderPrompt(block, sourceUrl, projectPath, bounds);
				} else if (isFooter) {
					prompt = buildFooterPrompt(block, sourceUrl, projectPath, bounds);
				} else {
					prompt = buildBlockPrompt(
						block,
						sourceUrl,
						projectPath,
						bounds,
						sectionHasHeading,
					);
				}

				// Append enrichment context to every prompt
				if (enrichment) {
					prompt += enrichment;
				}

				const config = { name: agentName, prompt };
				if (model) config.model = model;
				configs.push(config);
			}
		}
	}

	return configs;
}

function buildBlockPrompt(
	block,
	sourceUrl,
	projectPath,
	bounds,
	headingOwnedByOrchestrator,
) {
	const headingNote = headingOwnedByOrchestrator
		? "\n- Section heading: OWNED BY ORCHESTRATOR — do NOT include the section's lead-in heading in your block output"
		: "";
	return `You are migrating a single block to EDS.

## Parameters
- Block name: ${block.name}
- Source URL: ${sourceUrl}
- Visual tree ID: ${block.id || "unknown"}
- Bounds: ${bounds}
- EDS project: ${projectPath}
- Notes: ${block.notes || block.style || ""}${headingNote}

## Instructions
Read the \`migrate-block\` skill and follow every step.
The skill tells you how to read head.html from the project.
Do NOT inline CSS or JS as a substitute for the EDS framework.`;
}

function buildHeaderPrompt(block, sourceUrl, projectPath, bounds) {
	return `You are migrating the website header/navigation to EDS.

## Parameters
- Source URL: ${sourceUrl}
- EDS project: ${projectPath}
- Bounds: ${bounds}
- Notes: ${block.notes || block.style || ""}

## Instructions
Read the \`migrate-header\` skill and follow it exactly.
This is a HEADER migration, not a regular block. Follow the header skill
exactly — it handles nav.plain.html generation, section-metadata styles,
dropdown detection, and header-specific CSS patterns.
Before iterating CSS, seed --nav-height and fonts from
${projectPath}/.migration/brand.json (see the header skill's Step 5) to save
iterations.`;
}

function buildFooterPrompt(block, sourceUrl, projectPath, bounds) {
	return `You are migrating a single block to EDS.

## Parameters
- Block name: ${block.name}
- Source URL: ${sourceUrl}
- Visual tree ID: ${block.id || "unknown"}
- Bounds: ${bounds}
- EDS project: ${projectPath}
- Special: This is the FOOTER block. Output the fragment to \`drafts/footer.plain.html\` (the footer fragment path), NOT to a block-named file, and do NOT wrap the content in a \`<div class="footer">\` block. See "Footer Block — Special Case" in the migrate-block skill.
- Notes: ${block.notes || block.style || ""}

## Instructions
Read the \`migrate-block\` skill and follow every step.
The skill tells you how to read head.html from the project.
Do NOT inline CSS or JS as a substitute for the EDS framework.`;
}

function generateConfigsFromFile(migrationDir, model) {
	const fs = require("node:fs");
	const decompositionPath = migrationDir + "/decomposition.json";
	let decomposition;
	try {
		decomposition = JSON.parse(fs.readFileSync(decompositionPath, "utf8"));
	} catch (err) {
		throw new Error("cannot read " + decompositionPath + ": " + err.message);
	}
	if (!decomposition.url) {
		throw new Error(decompositionPath + ' has no "url" field');
	}
	const projectPath = migrationDir.replace(/\/\.migration\/?$/, "");
	// No default model: omitting it lets the orchestrator's sub-agent inherit
	// the default model rather than pinning one that may be retired.
	const enrichment = buildEnrichmentContext(migrationDir);
	return generateAgentConfigs(
		decomposition,
		decomposition.url,
		projectPath,
		model || "",
		enrichment,
	);
}

// Keep legacy export name for backward compatibility
module.exports = {
	generateAgentConfigs,
	generateScoopConfigs: generateAgentConfigs,
	generateConfigsFromFile,
};

if (
	process.argv[1] &&
	require("node:path").resolve(process.argv[1]) === __filename
) {
	const migrationDir = process.argv[2];
	if (!migrationDir) {
		console.error(
			"Usage: node generate-agent-prompts.js <migration-dir> [model]",
		);
		process.exit(1);
	}
	try {
		console.log(
			JSON.stringify(generateConfigsFromFile(migrationDir, process.argv[3])),
		);
	} catch (err) {
		console.error("generate-agent-prompts: " + err.message);
		process.exit(1);
	}
}
