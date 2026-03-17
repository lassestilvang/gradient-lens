#!/bin/bash
set -euo pipefail

# GradientLens deployment helper for the DigitalOcean Gradient AI hackathon.
#
# This script does not provision cloud resources automatically.
# It prepares local env files and validates the app build so you can
# deploy to DigitalOcean App Platform or your preferred runtime.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_DIR"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  GradientLens — DigitalOcean Deployment Prep"
echo "════════════════════════════════════════════════════════════"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "❌ Node.js is required."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "❌ npm is required."
  exit 1
fi

echo "✓ Node: $(node --version)"
echo "✓ npm: $(npm --version)"

echo ""
echo "📦 Installing dependencies..."
npm ci

if [ ! -f ".env.local" ]; then
  echo "🧩 Creating .env.local from .env.example..."
  cp .env.example .env.local
fi

echo ""
echo "🔍 Validating required DigitalOcean variables..."
if ! grep -q '^DO_GRADIENT_MODEL_ACCESS_KEY=' .env.local; then
  echo "⚠️  DO_GRADIENT_MODEL_ACCESS_KEY is missing from .env.local"
fi

echo ""
echo "🏗️  Building app..."
npm run build

echo ""
echo "✅ Local deployment prep complete."

if [[ "${1:-}" == "--cloud" ]]; then
  echo ""
  echo "🚀 Triggering DigitalOcean Cloud Deployment..."
  if ! command -v doctl >/dev/null 2>&1; then
    echo "❌ doctl is not installed. Please install it to use cloud deployment."
    exit 1
  fi
  
  # Validate spec before creating
  echo "🔍 Validating app.yaml spec..."
  if ! doctl apps spec validate app.yaml; then
    echo "❌ app.yaml validation failed."
    exit 1
  fi

  echo "📦 Creating app on DigitalOcean App Platform..."
  doctl apps create --spec app.yaml
else
  echo "Next step: deploy this Next.js app to DigitalOcean App Platform."
  echo "You can also run './scripts/deploy.sh --cloud' to deploy via doctl automatically."
fi
echo ""
