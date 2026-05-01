#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/app"

echo "=== Data Contract ==="
echo "Installing dependencies..."
npm install --silent 2>/dev/null || npm install

echo "Starting dev server on http://localhost:5119 ..."
npx vite dev --port 5119
