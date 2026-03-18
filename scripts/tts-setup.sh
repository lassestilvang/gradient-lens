#!/bin/bash
# TTS (Kokoro) Setup Script for GradientLens
# This script is meant to be run ON THE GPU DROPLET.

set -e

echo "🚀 Starting Kokoro TTS Setup..."

# 1. Pull and Run the Kokoro container
# We use ghcr.io/remsky/kokoro-fastapi-gpu for high-speed, GPU-accelerated TTS.
echo "📦 Running Kokoro TTS container..."

docker rm -f kokoro-tts || true
docker run -d --gpus all \
    --name kokoro-tts \
    -p 8880:8880 \
    --restart unless-stopped \
    ghcr.io/remsky/kokoro-fastapi-gpu:latest

echo "✅ Kokoro TTS is running on port 8880!"
echo "Check logs with: docker logs -f kokoro-tts"
echo "Your endpoint will be: http://$(curl -s ifconfig.me):8880/"
echo "Update your .env.local with: KOKORO_TTS_URL=http://$(curl -s ifconfig.me):8880/"
