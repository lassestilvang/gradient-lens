#!/bin/bash
# Piper TTS Setup Script for GradientLens
# This script is meant to be run ON THE GPU DROPLET.

set -e

echo "🚀 Starting Piper TTS Setup..."

# 1. Prepare model directory
echo "📁 Creating model directory..."
mkdir -p piper_models
cd piper_models

# 2. Download high-quality voice model (Amy Medium)
# We download on the host to avoid 403 errors sometimes seen inside Docker containers
echo "📥 Downloading voice model (en_US-amy-medium)..."
if [ ! -f "model.onnx" ]; then
    curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx" -o model.onnx
fi
if [ ! -f "model.onnx.json" ]; then
    curl -L "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/amy/medium/en_US-amy-medium.onnx.json" -o model.onnx.json
fi
cd ..

# 3. Pull and Run the Piper container
echo "📦 Running Piper with volume mount..."
docker rm -f piper-tts || true
docker run -d \
    --name piper-tts \
    --restart unless-stopped \
    -p 5555:5000 \
    -v "$(pwd)/piper_models:/app/models" \
    artibex/piper-http:latest

echo "✅ Piper TTS is running on port 5555!"
echo "Check logs with: docker logs -f piper-tts"
echo "Your endpoint will be: http://$(curl -s ifconfig.me):5555/tts"
echo "Update your .env.local with: PIPER_TTS_URL=http://$(curl -s ifconfig.me):5555/tts"
