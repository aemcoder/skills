#!/usr/bin/env bash
set -euo pipefail

# da-upload.sh — Upload migration artifacts to DA via aem CLI
#
# Usage: da-upload.sh <branch> <project-path>
#   branch:       Git branch name (used as DA folder)
#   project-path: VFS path to the EDS project (e.g., /shared/vibemigrated)
#
# Prerequisites:
#   - prepare-da-content.js must have run first (populates .migration/da/)
#   - aem CLI skill installed (oauth-token adobe for auth)
#
# Upload sequence (order is critical):
#   1. Upload images (multipart form, lowercased filenames)
#   2. Preview images (required for CDN accessibility)
#   3. Verify images are accessible via aem.page
#   4. Upload HTML content from .migration/da/ (DA source format)
#   5. Preview HTML content

BRANCH="${1:?Usage: da-upload.sh <branch> <project-path>}"
PROJECT="${2:?Usage: da-upload.sh <branch> <project-path>}"

DA_BASE="https://main--vibemigrated--aemcoder.aem.page"
ORG="aemcoder"
REPO="vibemigrated"

echo "=== DA Upload: ${BRANCH} ==="

# ── Step 1: Upload images (lowercased filenames) ───────────────

IMAGE_DIR="${PROJECT}/drafts/images"
IMAGE_COUNT=0
if [ -d "${IMAGE_DIR}" ]; then
	for img in "${IMAGE_DIR}"/*; do
		[ -f "${img}" ] || continue
		ORIGINAL=$(basename "${img}")
		LOWERED=$(echo "${ORIGINAL}" | tr '[:upper:]' '[:lower:]')
		echo "Uploading image: ${ORIGINAL} → ${LOWERED}"
		aem upload "${img}" "${DA_BASE}/${BRANCH}/images/${LOWERED}"
		IMAGE_COUNT=$((IMAGE_COUNT + 1))
	done
	echo "Uploaded ${IMAGE_COUNT} images"
else
	echo "No images directory found, skipping"
fi

# ── Step 2: Preview images (required for CDN access) ───────────

if [ "${IMAGE_COUNT}" -gt 0 ]; then
	echo "Previewing ${IMAGE_COUNT} images..."
	for img in "${IMAGE_DIR}"/*; do
		[ -f "${img}" ] || continue
		LOWERED=$(basename "${img}" | tr '[:upper:]' '[:lower:]')
		aem preview "${DA_BASE}/${BRANCH}/images/${LOWERED}"
	done
	echo "All images previewed"
fi

# ── Step 3: Verify images accessible ───────────────────────────

if [ "${IMAGE_COUNT}" -gt 0 ]; then
	echo "Verifying image accessibility..."
	FAIL_COUNT=0
	for img in "${IMAGE_DIR}"/*; do
		[ -f "${img}" ] || continue
		LOWERED=$(basename "${img}" | tr '[:upper:]' '[:lower:]')
		URL="${DA_BASE}/${BRANCH}/images/${LOWERED}"
		STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${URL}")
		if [ "${STATUS}" != "200" ]; then
			echo "  WARN: ${LOWERED} → HTTP ${STATUS}"
			FAIL_COUNT=$((FAIL_COUNT + 1))
		fi
	done
	if [ "${FAIL_COUNT}" -gt 0 ]; then
		echo "Warning: ${FAIL_COUNT} images not yet accessible (may need more time)"
	else
		echo "All images accessible"
	fi
fi

# ── Step 4: Upload DA-format HTML ──────────────────────────────

DA_DIR="${PROJECT}/.migration/da"
if [ ! -d "${DA_DIR}" ]; then
	echo "Error: ${DA_DIR} not found. Run prepare-da-content.js first."
	exit 1
fi

# Upload nav first (referenced by main page metadata)
if [ -f "${DA_DIR}/nav.html" ]; then
	echo "Uploading nav"
	aem put "${DA_BASE}/${BRANCH}/nav" "${DA_DIR}/nav.html"
else
	echo "Warning: nav.html not found in DA output"
fi

# Upload footer
if [ -f "${DA_DIR}/footer.html" ]; then
	echo "Uploading footer"
	aem put "${DA_BASE}/${BRANCH}/footer" "${DA_DIR}/footer.html"
else
	echo "Warning: footer.html not found in DA output"
fi

# Upload main page (any .html that isn't nav/footer)
MAIN_UPLOADED=false
for f in "${DA_DIR}"/*.html; do
	[ -f "${f}" ] || continue
	BASE=$(basename "${f}")
	case "${BASE}" in
	nav.html | footer.html) continue ;;
	*)
		echo "Uploading main page: ${BASE}"
		aem put "${DA_BASE}/${BRANCH}/index" "${f}"
		MAIN_UPLOADED=true
		break
		;;
	esac
done

if [ "${MAIN_UPLOADED}" != "true" ]; then
	echo "Error: no main page HTML found in ${DA_DIR}"
	exit 1
fi

# ── Step 5: Preview HTML content ───────────────────────────────

echo "Previewing content..."
if [ -f "${DA_DIR}/nav.html" ]; then
	aem preview "${DA_BASE}/${BRANCH}/nav"
fi
if [ -f "${DA_DIR}/footer.html" ]; then
	aem preview "${DA_BASE}/${BRANCH}/footer"
fi
aem preview "${DA_BASE}/${BRANCH}/index"

echo ""
echo "=== Upload complete ==="
echo "DA folder: https://da.live/#/${ORG}/${REPO}/${BRANCH}"
echo "EDS preview: https://${BRANCH}--${REPO}--${ORG}.aem.page/${BRANCH}/"
