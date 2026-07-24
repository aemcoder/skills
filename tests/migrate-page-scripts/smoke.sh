#!/usr/bin/env bash
# Smoke tests for the migrate-page node scripts. Run from anywhere:
#   bash tests/migrate-page-scripts/smoke.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

SCRIPTS=skills/migration/migrate-page/scripts
FIXTURES=tests/migrate-page-scripts/fixtures/project

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -R "$FIXTURES" "$TMP/project"

fail() {
	echo "FAIL: $1" >&2
	exit 1
}

# --- block-inventory.js: happy path ---
out="$(node "$SCRIPTS/block-inventory.js" "$TMP/project")"
echo "$out" | node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (data.blockCount !== 1) throw new Error("blockCount: " + data.blockCount);
  if (data.blocks.join(",") !== "foo") throw new Error("blocks: " + data.blocks);
' || fail "block-inventory stdout summary"

node -e '
  const data = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  if (data.length !== 1) throw new Error("entries: " + data.length);
  const e = data[0];
  if (e.name !== "foo" || e.hasJs !== true || e.hasCss !== true) throw new Error(JSON.stringify(e));
  if (typeof e.jsSize !== "number" || typeof e.cssSize !== "number") throw new Error("sizes not numeric");
' "$TMP/project/.migration/block-inventory.json" || fail "block-inventory.json contents"

# --- block-inventory.js: error path (no args) ---
if node "$SCRIPTS/block-inventory.js" 2>/dev/null; then
	fail "block-inventory.js with no args should exit non-zero"
fi

# --- generate-scoop-prompts.js: happy path ---
out="$(node "$SCRIPTS/generate-scoop-prompts.js" "$TMP/project/.migration")"
echo "$out" | node -e '
  const configs = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!Array.isArray(configs)) throw new Error("not an array");
  for (const c of configs) {
    for (const k of ["name", "model", "prompt"]) {
      if (typeof c[k] !== "string" || !c[k]) throw new Error("missing " + k + " in " + JSON.stringify(c));
    }
  }
  const names = configs.map((c) => c.name);
  const nav = configs.find((c) => c.name === "nav-bar-block");
  if (!nav) throw new Error("no nav-bar-block in: " + names);
  if (!nav.prompt.includes("migrate-header/SKILL.md")) throw new Error("nav prompt missing header skill ref");
  const footer = configs.find((c) => c.name === "footer-block");
  if (!footer) throw new Error("no footer-block in: " + names);
  if (!footer.prompt.includes("footer.plain.html")) throw new Error("footer prompt missing footer.plain.html");
  if (!configs.find((c) => c.name === "cards-block")) throw new Error("no cards-block in: " + names);
  if (names.some((n) => n.includes("intro"))) throw new Error("default-content got a scoop");
' || fail "generate-scoop-prompts output"

# --- generate-scoop-prompts.js: error paths ---
if node "$SCRIPTS/generate-scoop-prompts.js" 2>/dev/null; then
	fail "generate-scoop-prompts.js with no args should exit non-zero"
fi
if node "$SCRIPTS/generate-scoop-prompts.js" "$TMP" 2>/dev/null; then
	fail "generate-scoop-prompts.js without decomposition.json should exit non-zero"
fi

echo "SMOKE OK"
