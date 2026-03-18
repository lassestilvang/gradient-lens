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

# Parse arguments
DEPLOY_CLOUD=false
REGION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --cloud)
      DEPLOY_CLOUD=true
      shift
      ;;
    --region)
      REGION="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [[ "$DEPLOY_CLOUD" == "true" ]]; then
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
    KOKORO_URL=$(grep '^KOKORO_TTS_URL=' .env.local | cut -d '=' -f2-)
    
    if [ -n "$TEXT_MODEL" ]; then
      sed -i '' "/key: DO_GRADIENT_TEXT_MODEL/{n;n;s/value: .*/value: $TEXT_MODEL/;}" .do/app.yaml
    fi
    
    if [ -n "$VISION_MODEL" ]; then
      sed -i '' "/key: DO_GRADIENT_VISION_MODEL/{n;n;s/value: .*/value: $VISION_MODEL/;}" .do/app.yaml
    fi

    if [ -n "$KOKORO_URL" ]; then
      echo "🔊 Syncing KOKORO_TTS_URL to .do/app.yaml..."
      sed -i '' "/key: KOKORO_TTS_URL/{n;n;s|value: .*|value: $KOKORO_URL|;}" .do/app.yaml
    fi
  fi

  # Sync region if provided
  if [ -n "$REGION" ]; then
    echo "🌍 Setting region to: $REGION in .do/app.yaml..."
    sed -i '' "s/^region: .*/region: $REGION/" .do/app.yaml
  fi
  
  # Validate spec before creating
  echo "🔍 Validating .do/app.yaml spec..."
  if ! doctl apps spec validate .do/app.yaml; then
    # Get current region from .do/app.yaml if not provided as flag
    HINT_REGION="${REGION:-$(grep '^region: ' .do/app.yaml | cut -d ' ' -f2)}"
    [ -z "$HINT_REGION" ] && HINT_REGION="nyc3"

    echo ""
    echo "❌ .do/app.yaml validation failed."
    echo "💡 HINT: Ensure you have created the database cluster in the same region ($HINT_REGION):"
    echo "   doctl databases create gradient-lens-redis-cluster --engine valkey --region $HINT_REGION --size db-s-1vcpu-1gb --num-nodes 1"
    echo ""
    exit 1
  fi

  echo "📦 Preparing deployment to DigitalOcean App Platform..."
  APP_NAME=$(grep '^name: ' .do/app.yaml | cut -d ' ' -f2)
  EXISTING_APP_ID=$(doctl apps list --format ID,Spec.Name --no-header | grep "$APP_NAME" | awk '{print $1}' || echo "")

  if [ -n "$EXISTING_APP_ID" ]; then
    echo "🔄 Updating existing app: $APP_NAME (ID: $EXISTING_APP_ID)..."
    doctl apps update "$EXISTING_APP_ID" --spec .do/app.yaml
  else
    echo "✨ Creating new app: $APP_NAME..."
    doctl apps create --spec .do/app.yaml
  fi
else
  echo "Next step: deploy this Next.js app to DigitalOcean App Platform."
  echo "You can also run './scripts/deploy.sh --cloud [--region <region>]' to deploy via doctl automatically."
fi
echo ""
