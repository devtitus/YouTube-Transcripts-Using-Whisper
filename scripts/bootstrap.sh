#!/usr/bin/env bash
set -euo pipefail

# This script installs dependencies (ffmpeg, yt-dlp) and builds whisper.cpp locally.
# Run with: bash scripts/bootstrap.sh

if ! command -v sudo >/dev/null 2>&1; then
  echo "This script expects sudo for apt installs. Please run the commands manually if unavailable." >&2
fi

sudo apt-get update
sudo apt-get install -y ffmpeg build-essential cmake pkg-config libopenblas-dev curl git

# Install yt-dlp (prefer apt if available, else via pipx)
if ! command -v yt-dlp >/dev/null 2>&1; then
  if command -v apt >/dev/null 2>&1; then
    sudo apt-get install -y yt-dlp || true
  fi
fi
if ! command -v yt-dlp >/dev/null 2>&1; then
  echo "Installing yt-dlp via pipx..."
  if ! command -v pipx >/dev/null 2>&1; then
    python3 -m pip install --user pipx
    python3 -m pipx ensurepath || true
    export PATH="$HOME/.local/bin:$PATH"
  fi
  pipx install yt-dlp
fi

# Build whisper.cpp
TP_DIR="third_party/whisper.cpp"
if [ ! -d "$TP_DIR" ]; then
  git clone https://github.com/ggerganov/whisper.cpp "$TP_DIR"
fi
cd "$TP_DIR"
make -j$(nproc)
cd -

# Download a default model (base.en ~ 142MB)
mkdir -p models
if [ ! -f models/ggml-base.en.bin ]; then
  curl -L -o models/ggml-base.en.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin
fi

echo "Bootstrap complete. Configure env vars if needed, then run:"
echo "  npm install"
echo "  npm run dev"
