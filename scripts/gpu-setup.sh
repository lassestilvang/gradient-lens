#!/bin/bash
# GPU Droplet Setup Script for GradientLens
# This script is meant to be run ON THE GPU DROPLET.

set -e

echo "🚀 Starting GPU Droplet Setup..."

# 1. Verify NVIDIA Environment
echo "🔍 Checking NVIDIA drivers..."
if ! command -v nvidia-smi &> /dev/null; then
    echo "❌ Error: NVIDIA drivers not found. Ensure you used an AI/ML-ready image."
    exit 1
fi
nvidia-smi -L

# 2. Setup NVIDIA Container Toolkit (Fix for 'invalid runtime name: nvidia')
echo "📦 Configuring NVIDIA Container Toolkit for Docker..."
if ! command -v nvidia-ctk &> /dev/null; then
    curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | sudo gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
    curl -s -L https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list | \
      sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
      sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
    sudo apt-get update
    sudo apt-get install -y nvidia-container-toolkit
fi

sudo nvidia-ctk runtime configure --runtime=docker
sudo systemctl restart docker

# 3. Setup vLLM with Llama 3.2 Vision
echo "Please enter your Hugging Face Token (required for Llama 3.2):"
read -s HF_TOKEN

# Open firewall for port 8000 if needed (UFW)
if command -v ufw &> /dev/null; then
    sudo ufw allow 8000/tcp
fi

# docker run --runtime nvidia --gpus all \
#     --name vllm-vision \
#     -d \
#     -v ~/.cache/huggingface:/root/.cache/huggingface \
#     -p 8000:8000 \
#     --env "HUGGING_FACE_HUB_TOKEN=$HF_TOKEN" \
#     vllm/vllm-openai \
#     --model meta-llama/Llama-3.2-11B-Vision-Instruct \
#     --trust-remote-code \
#     --max-model-len 4096 \
#     --limit-mm-per-prompt '{"image": 1}'

docker run --runtime nvidia --gpus all \
    --name vllm-vision \
    -d \
    -v ~/.cache/huggingface:/root/.cache/huggingface \
    -p 8000:8000 \
    --ipc=host \
    vllm/vllm-openai \
    --model Qwen/Qwen3-VL-8B-Instruct \
    --max-model-len 32768 \
    --limit-mm-per-prompt '{"image": 1}'

docker run --gpus all -d \
    -v /root/.cache/huggingface:/root/.cache/huggingface \
    -p 8000:8000 \
    --ipc=host \
    vllm/vllm-openai:latest \
    --model /root/.cache/huggingface/hub/models--Qwen--Qwen3-VL-8B-Instruct/snapshots/0c351dd01ed87e9c1b53cbc748cba10e6187ff3b \
    --quantization fp8 \
    --max-model-len 8192 \
    --gpu-memory-utilization 0.8

echo "✅ vLLM is starting in the background!"
echo "Check progress with: docker logs -f vllm-vision"
echo "Your endpoint will be: http://$(curl -s ifconfig.me):8000/v1"
