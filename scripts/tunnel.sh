#!/bin/bash
set -euo pipefail

# GradientLens tunneling helper.
# Exposes your local development server to the internet via HTTPS
# so you can test features like the Camera API on your mobile device.

PORT=${1:-3000}

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  GradientLens — Secure Tunnel for Mobile Testing"
echo "════════════════════════════════════════════════════════════"
echo ""

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

if command_exists npx; then
  echo "🚀 Starting tunnel via localtunnel (npx localtunnel)..."
  echo "💡 Tip: Once the tunnel starts, open the provided URL on your iPhone."
  echo "          You might need to click 'Reminder: This is a dev tunnel' to proceed."
  echo ""
  npx localtunnel --port "$PORT"
elif command_exists ngrok; then
  echo "🚀 Starting tunnel via ngrok..."
  ngrok http "$PORT"
else
  echo "❌ Error: Neither 'localtunnel' (via npx) nor 'ngrok' was found."
  echo "   Please install one of them to use this script."
  echo "   - To use localtunnel: npm install -g localtunnel"
  echo "   - To use ngrok: https://ngrok.com/download"
  exit 1
fi
