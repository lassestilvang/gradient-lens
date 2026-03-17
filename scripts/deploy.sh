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

  # Sync models from .env.local to app.yaml if they exist
  if [ -f ".env.local" ]; then
    echo "🔄 Syncing model IDs from .env.local to app.yaml..."
    
    TEXT_MODEL=$(grep '^DO_GRADIENT_TEXT_MODEL=' .env.local | cut -d '=' -f2)
    VISION_MODEL=$(grep '^DO_GRADIENT_VISION_MODEL=' .env.local | cut -d '=' -f2)
    
    if [ -n "$TEXT_MODEL" ]; then
      sed -i '' "s/\(key: DO_GRADIENT_TEXT_MODEL\).*/\1\n    scope: RUN_TIME\n    value: $TEXT_MODEL/" app.yaml
      # Note: This sed is a bit fragile without a specific line match, 
      # but since we control the app.yaml format it's a quick win.
      # Let's do a more robust replacement:
      sed -i '' "/key: DO_GRADIENT_TEXT_MODEL/{n;n;s/value: .*/value: $TEXT_MODEL/;}" app.yaml
    fi
    
    if [ -n "$VISION_MODEL" ]; then
      sed -i '' "/key: DO_GRADIENT_VISION_MODEL/{n;n;s/value: .*/value: $VISION_MODEL/;}" app.yaml
    fi
  fi
  
  # Validate spec before creating
  echo "🔍 Validating app.yaml spec..."
  if ! doctl apps spec validate app.yaml; then
    echo ""
    echo "❌ app.yaml validation failed."
    echo "💡 HINT: Ensure you have created the database cluster first:"
    echo "   doctl databases create gradient-lens-redis-cluster --engine valkey --region nyc1 --size db-s-1vcpu-1gb --num-nodes 1"
    echo ""
    exit 1
  fi

  echo "📦 Preparing deployment to DigitalOcean App Platform..."
  APP_NAME=$(grep '^name: ' app.yaml | cut -d ' ' -f2)
  EXISTING_APP_ID=$(doctl apps list --format ID,Spec.Name --no-header | grep "$APP_NAME" | awk '{print $1}' || echo "")

  if [ -n "$EXISTING_APP_ID" ]; then
    echo "🔄 Updating existing app: $APP_NAME (ID: $EXISTING_APP_ID)..."
    doctl apps update "$EXISTING_APP_ID" --spec app.yaml
  else
    echo "✨ Creating new app: $APP_NAME..."
    doctl apps create --spec app.yaml
  fi
else
  echo "Next step: deploy this Next.js app to DigitalOcean App Platform."
  echo "You can also run './scripts/deploy.sh --cloud' to deploy via doctl automatically."
fi
echo ""
