#!/usr/bin/env bash
set -euo pipefail

# da-upload.sh — Upload migration artifacts to DA via aem CLI
#
# Usage: da-upload.sh <branch> <project-path>
#   branch:       Git branch name (used as DA folder)
#   project-path: VFS path to the EDS project (e.g., /shared/vibemigrated)
#
# Requires: aem CLI skill (oauth-token adobe for auth)
#
# Uploads to DA at aemcoder/vibemigrated:
#   /{branch}/index.html  (main page with metadata block)
#   /{branch}/nav.html    (navigation fragment)
#   /{branch}/footer.html (footer fragment)
#   /{branch}/images/*    (all images)

BRANCH="${1:?Usage: da-upload.sh <branch> <project-path>}"
PROJECT="${2:?Usage: da-upload.sh <branch> <project-path>}"

DA_BASE="https://main--vibemigrated--aemcoder.aem.page"

echo "=== DA Upload: ${BRANCH} ==="

# --- Upload images ---
IMAGE_DIR="${PROJECT}/drafts/images"
if [ -d "${IMAGE_DIR}" ]; then
  IMAGE_COUNT=0
  for img in "${IMAGE_DIR}"/*; do
    [ -f "${img}" ] || continue
    FILENAME=$(basename "${img}")
    echo "Uploading image: ${FILENAME}"
    aem upload "${img}" "${DA_BASE}/${BRANCH}/images/${FILENAME}"
    IMAGE_COUNT=$((IMAGE_COUNT + 1))
  done
  echo "Uploaded ${IMAGE_COUNT} images"
else
  echo "No images directory found, skipping"
fi

# --- Upload nav ---
NAV_FILE="${PROJECT}/drafts/nav.plain.html"
if [ -f "${NAV_FILE}" ]; then
  echo "Uploading nav"
  aem put "${DA_BASE}/${BRANCH}/nav" "${NAV_FILE}"
else
  echo "Warning: nav.plain.html not found, skipping"
fi

# --- Upload footer ---
FOOTER_FILE="${PROJECT}/drafts/footer.plain.html"
if [ -f "${FOOTER_FILE}" ]; then
  echo "Uploading footer"
  aem put "${DA_BASE}/${BRANCH}/footer" "${FOOTER_FILE}"
else
  echo "Warning: footer.plain.html not found, skipping"
fi

# --- Upload main page ---
# Find the main page .plain.html (not nav/footer, not preview)
MAIN_FILE=""
for f in "${PROJECT}"/drafts/*.plain.html; do
  [ -f "${f}" ] || continue
  BASE=$(basename "${f}")
  case "${BASE}" in
    nav.plain.html|footer.plain.html) continue ;;
    *) MAIN_FILE="${f}"; break ;;
  esac
done

if [ -n "${MAIN_FILE}" ]; then
  echo "Uploading main page: $(basename "${MAIN_FILE}")"
  aem put "${DA_BASE}/${BRANCH}/index" "${MAIN_FILE}"
else
  echo "Error: no main page .plain.html found in ${PROJECT}/drafts/"
  exit 1
fi

echo ""
echo "=== Upload complete ==="
echo "DA folder: https://da.live/#/aemcoder/vibemigrated/${BRANCH}"
