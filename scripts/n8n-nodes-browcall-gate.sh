#!/usr/bin/env bash

set -e

# ===== CONFIG =====
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_SCRIPT="$SCRIPT_DIR/add-n8n-package-link.sh"

PACKAGE_PATH="./packages/n8n-nodes-browcall-gate"
EXPECTED_PACKAGE_NAME="n8n-nodes-browcall-gate"

# ===== CHECK INSTALL SCRIPT =====
if [ ! -f "$INSTALL_SCRIPT" ]; then
  echo "❌ add-n8n-package-link.sh not found at:"
  echo "   $INSTALL_SCRIPT"
  exit 1
fi

# ===== CHECK PACKAGE PATH =====
if [ ! -f "$PACKAGE_PATH/package.json" ]; then
  echo "❌ package.json not found in:"
  echo "   $PACKAGE_PATH"
  exit 1
fi

# ===== VERIFY PACKAGE NAME =====
ACTUAL_PACKAGE_NAME=$(node -p "require('$PACKAGE_PATH/package.json').name")

if [ "$ACTUAL_PACKAGE_NAME" != "$EXPECTED_PACKAGE_NAME" ]; then
  echo "❌ Package name mismatch!"
  echo "   Expected: $EXPECTED_PACKAGE_NAME"
  echo "   Found   : $ACTUAL_PACKAGE_NAME"
  exit 1
fi

echo "📦 Package verified: $ACTUAL_PACKAGE_NAME"
echo "📁 Package path    : $PACKAGE_PATH"

# ===== CALL INSTALL SCRIPT =====
echo "🚀 Installing package into n8n..."
bash "$INSTALL_SCRIPT" "$PACKAGE_PATH"

echo "✅ n8n-nodes-browcall-gate installed successfully"
echo "👉 Restart n8n to load the node"
