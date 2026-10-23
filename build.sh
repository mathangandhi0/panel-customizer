#!/usr/bin/env bash
# build.sh — Build and optionally install the Panel Customizer extension.
#
# Usage:
#   ./build.sh           — compile schema + create installable zip
#   ./build.sh install   — compile, zip, and install via gnome-extensions
#   ./build.sh direct    — compile + copy files directly (no zip needed) ← fastest
#   ./build.sh clean     — remove build artefacts
#
# The 'direct' mode copies files straight into
#   ~/.local/share/gnome-shell/extensions/<UUID>/
# and is the most reliable approach when the 'zip' command is unavailable.

set -euo pipefail

UUID="panel-customizer@example.com"
SCHEMA_DIR="schemas"
DIST_DIR="dist"
ZIP_NAME="${UUID}.zip"
INSTALL_DIR="${HOME}/.local/share/gnome-shell/extensions/${UUID}"

# ── Helpers ───────────────────────────────────────────────────────────────────

info()  { echo "▶ $*"; }
ok()    { echo "✔ $*"; }
err()   { echo "✖ $*" >&2; exit 1; }

have_cmd() { command -v "$1" >/dev/null 2>&1; }
require_cmd() { have_cmd "$1" || err "Required command not found: $1"; }

# ── Clean ─────────────────────────────────────────────────────────────────────

if [[ "${1:-}" == "clean" ]]; then
    info "Cleaning build artefacts…"
    rm -rf "${DIST_DIR}" "${UUID}.zip" /tmp/panel-customizer.css
    ok "Clean done."
    exit 0
fi

# ── Step 1: Always compile the GSettings schema ───────────────────────────────

require_cmd glib-compile-schemas
info "Compiling GSettings schema…"
glib-compile-schemas "${SCHEMA_DIR}/"
ok "Schema compiled → ${SCHEMA_DIR}/gschemas.compiled"

# ── Step 2a: Direct install (no zip required) ─────────────────────────────────

if [[ "${1:-}" == "direct" ]]; then
    info "Installing directly to ${INSTALL_DIR} …"
    mkdir -p "${INSTALL_DIR}/${SCHEMA_DIR}"

    for f in metadata.json extension.js prefs.js stylesheet.css; do
        cp "$f" "${INSTALL_DIR}/"
    done
    cp "${SCHEMA_DIR}/gschemas.compiled" \
       "${SCHEMA_DIR}/org.gnome.shell.extensions.panel-customizer.gschema.xml" \
       "${INSTALL_DIR}/${SCHEMA_DIR}/"

    ok "Files copied to ${INSTALL_DIR}"
    echo ""
    echo "  Reload the Shell, then enable the extension:"
    echo "    X11:    Alt+F2 → r → Enter"
    echo "    Wayland: log out and back in"
    echo ""
    echo "  gnome-extensions enable ${UUID}"
    exit 0
fi

# ── Step 2b: Create distribution zip ─────────────────────────────────────────

info "Creating extension zip…"
rm -rf "${DIST_DIR}"
mkdir -p "${DIST_DIR}/${UUID}/${SCHEMA_DIR}"

for f in metadata.json extension.js prefs.js stylesheet.css; do
    cp "$f" "${DIST_DIR}/${UUID}/"
done
cp "${SCHEMA_DIR}/gschemas.compiled" \
   "${SCHEMA_DIR}/org.gnome.shell.extensions.panel-customizer.gschema.xml" \
   "${DIST_DIR}/${UUID}/${SCHEMA_DIR}/"

# Prefer the system 'zip' binary; fall back to Python's built-in zipfile module.
if have_cmd zip; then
    ( cd "${DIST_DIR}/${UUID}" && zip -r "../../${ZIP_NAME}" . )
elif have_cmd python3; then
    info "'zip' not found — using python3 zipfile module as fallback…"
    python3 - "${DIST_DIR}/${UUID}" "${ZIP_NAME}" <<'PYEOF'
import sys, zipfile, pathlib
src  = pathlib.Path(sys.argv[1])
dest = pathlib.Path(sys.argv[2])
with zipfile.ZipFile(dest, 'w', zipfile.ZIP_DEFLATED) as zf:
    for f in src.rglob('*'):
        if f.is_file():
            zf.write(f, f.relative_to(src))
print(f"Created {dest}")
PYEOF
else
    err "Neither 'zip' nor 'python3' found. Install one of them and retry, or use './build.sh direct'."
fi

ok "Zip created → ${ZIP_NAME}"

# ── Step 3 (optional): Install via gnome-extensions ──────────────────────────

if [[ "${1:-}" == "install" ]]; then
    require_cmd gnome-extensions
    info "Installing via gnome-extensions…"
    gnome-extensions install --force "${ZIP_NAME}"
    ok "Extension installed."
    echo ""
    echo "  Reload the Shell, then enable:"
    echo "    X11:    Alt+F2 → r → Enter"
    echo "    Wayland: log out and back in"
    echo ""
    echo "  gnome-extensions enable ${UUID}"
fi

info "Done."
