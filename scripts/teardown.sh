#!/bin/bash
set -euo pipefail

# GradientLens local teardown helper.
# Removes local build artifacts and optionally clears local env.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  GradientLens — Local Teardown"
echo "════════════════════════════════════════════════════════════"
echo ""

rm -rf .next

echo "✓ Removed .next build output"

echo ""
echo "If you also want to remove local secrets, run:"
echo "  rm .env.local"
echo ""
