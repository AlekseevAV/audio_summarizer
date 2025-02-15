#!/bin/bash

APP_NAME="audio_summarizer"
APP_DIR="$HOME/$APP_NAME"

echo "🏃 Installing $APP_NAME..."

# Change directory to the install script directory
cd "$(dirname "$0")"

if [ -d "$APP_DIR" ]; then
    echo "🚀 Directory $APP_DIR already exists. Updating files..."
else
    echo "🚀 Creating directory $APP_DIR..."
fi
# Copy directory if it does not exist, excluding .git .venv directory
rsync -av --exclude={.git,.venv} . $APP_DIR

# Change directory to the user's home directory
cd $APP_DIR


echo "📦 Installing system dependencies..."
# Install Homebrew if it does not exist
if [ -x "$(command -v brew)" ]; then
    echo "Homebrew already exists. Skipping installation..."
else
    echo "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
    eval "$(/opt/homebrew/bin/brew shellenv)"
fi

# Install ffmpeg if it does not exist. It is required for audio processing during model transcriptions
if [ -x "$(command -v ffmpeg)" ]; then
    echo "ffmpeg already exists. Skipping installation..."
else
    echo "Installing ffmpeg..."
    brew install ffmpeg
fi

# Install uv if it does not exist
if [ -x "$(command -v uv)" ]; then
    echo "uv already exists. Skipping installation..."
else
    echo "Installing uv..."
    brew install uv
fi

# Install python venv and dependencies
cd $APP_DIR/src/server

# Install python if .venv does not exist
if [ -d ".venv" ]; then
    echo "Python venv already exists. Skipping installation..."
else
    echo "Installing python venv..."
    uv venv
fi

echo "📦 Installing python dependencies..."
uv sync

echo "🔥 Warming up the model..."
# Init model to download pre-trained model
uv run - <<EOF
from whisper_turbo import init
init()
EOF

# Back to the app directory
cd $APP_DIR

./server.sh install

# delay to allow the server to start
echo "🌐 Starting server..."
sleep 5

# check if the server is running
if [ -z "$(lsof -i :8995)" ]; then
    echo "❌ Server failed to start. Please check the logs."
    exit 1
fi

echo "🎉 Installation complete! 🎉"

echo "🖥️ Press any key to open Chrome to the extension page..."
read -n 1 -s
open -a "Google Chrome" "chrome://extensions/"
