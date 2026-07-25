#!/usr/bin/env bash
# Smoke tests for the migrate-page node scripts. Run from anywhere:
#   bash tests/migrate-page-scripts/smoke.sh
# NOTE: this runs under REAL node. It cannot exercise SLICC's node bridge,
# where `require.main === module` is never true. That is exactly why the
# skills document the programmatic `require(...).fn()` entry as primary — the
# tests below verify that entry works, not just the bare CLI form.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

SCRIPTS=skills/migration/migrate-page/scripts
SCRIPTS_ABS="$(pwd)/$SCRIPTS"
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

# --- block-inventory.js: programmatic entry (the documented-primary path) ---
rm -rf "$TMP/project/.migration/block-inventory.json"
out="$(node -e "process.chdir('$TMP/project'); const {writeBlockInventory}=require('$SCRIPTS_ABS/block-inventory.js'); writeBlockInventory('$TMP/project');")"
echo "$out" | node -e '
  const data = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (data.blockCount !== 1 || data.blocks.join(",") !== "foo") throw new Error("programmatic summary: " + JSON.stringify(data));
' || fail "block-inventory writeBlockInventory() programmatic summary"
[[ -f "$TMP/project/.migration/block-inventory.json" ]] || fail "writeBlockInventory did not write the file"

# --- block-inventory.js: error path (no args) ---
err="$(node "$SCRIPTS/block-inventory.js" 2>&1 1>/dev/null)" && fail "block-inventory.js with no args should exit non-zero"
[[ "$err" == *"Usage"* ]] || fail "block-inventory.js no-args stderr missing usage message: $err"

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
  const cards = configs.find((c) => c.name === "cards-block");
  if (!cards) throw new Error("no cards-block in: " + names);
  if (!cards.prompt.includes("Section heading: OWNED BY CONE")) throw new Error("cards-block (under a default-content heading) missing OWNED BY CONE note");
  if (nav.prompt.includes("Section heading: OWNED BY CONE")) throw new Error("nav-bar-block (no section heading) should NOT have OWNED BY CONE note");
  if (names.some((n) => n.includes("intro") || n.includes("activity-heading"))) throw new Error("default-content got a scoop");
' || fail "generate-scoop-prompts output"

# --- generate-scoop-prompts.js: programmatic entry (the documented-primary path) ---
out="$(node -e "console.log(JSON.stringify(require('$SCRIPTS_ABS/generate-scoop-prompts.js').generateConfigsFromFile('$TMP/project/.migration')))")"
echo "$out" | node -e '
  const configs = JSON.parse(require("fs").readFileSync(0, "utf8"));
  if (!Array.isArray(configs) || !configs.find((c) => c.name === "nav-bar-block")) throw new Error("programmatic configs: " + JSON.stringify(configs));
' || fail "generate-scoop-prompts generateConfigsFromFile() programmatic output"

# --- generate-scoop-prompts.js: error paths ---
err="$(node "$SCRIPTS/generate-scoop-prompts.js" 2>&1 1>/dev/null)" && fail "generate-scoop-prompts.js with no args should exit non-zero"
[[ "$err" == *"Usage"* ]] || fail "generate-scoop-prompts.js no-args stderr missing usage message: $err"

err="$(node "$SCRIPTS/generate-scoop-prompts.js" "$TMP" 2>&1 1>/dev/null)" && fail "generate-scoop-prompts.js without decomposition.json should exit non-zero"
[[ "$err" == *"decomposition.json"* ]] || fail "generate-scoop-prompts.js missing-file stderr doesn't name the file: $err"

# --- generate-scoop-prompts.js: error path (decomposition.json missing "url") ---
NOURL="$(mktemp -d)"
mkdir -p "$NOURL/.migration"
echo '{"fragments":[]}' >"$NOURL/.migration/decomposition.json"
err="$(node "$SCRIPTS/generate-scoop-prompts.js" "$NOURL/.migration" 2>&1 1>/dev/null)" && fail "generate-scoop-prompts.js with decomposition.json missing url should exit non-zero"
[[ "$err" == *"url"* ]] || fail "generate-scoop-prompts.js missing-url stderr doesn't mention url: $err"
if command -v trash >/dev/null 2>&1; then
	trash "$NOURL"
else
	rm -rf "$NOURL"
fi

# --- bridge-safety: node CLI scripts must avoid SLICC-node-bridge-incompatible idioms ---
# The SLICC node bridge lacks Dirent objects (withFileTypes), child_process
# (spawn/exec/execFile, in any form), stdin streaming (process.stdin), a
# reliable require.main, and reliable async-fs flush (fs/promises). These all
# pass under REAL node, so the functional tests above cannot catch them — this
# static guard can. We match the child_process MODULE NAME rather than
# individual method-call forms (spawn/exec/execFile/...) since you cannot use
# any of them without importing child_process — that's the reliable,
# false-positive-free signal. Applies only to the two CLI scripts that run
# under the node bridge, NOT the browser eval-file scripts (which legitimately
# use browser APIs).
for script in block-inventory.js generate-scoop-prompts.js; do
	if grep -nE 'withFileTypes|child_process|process\.stdin|require\.main|fs/promises' "$SCRIPTS/$script"; then
		fail "$script uses a SLICC-node-bridge-incompatible idiom (matches above) — see the SLICC node-bridge constraints box in migrate-page/SKILL.md"
	fi
done

echo "SMOKE OK"
