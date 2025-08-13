#!/bin/bash

# Cross-platform Python server startup script
set -e

cd py_asr_service

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python -m venv venv
fi

# Activate virtual environment (cross-platform)
if [ -f "venv/bin/activate" ]; then
    # Unix/Linux/macOS
    source venv/bin/activate
elif [ -f "venv/Scripts/activate" ]; then
    # Windows
    source venv/Scripts/activate
else
    echo "Error: Could not find virtual environment activation script"
    exit 1
fi

# Install/update requirements
echo "Installing Python dependencies..."
pip install -r requirements.txt

# Start the server
echo "Starting Python ASR server on port 5689..."
uvicorn server:app --host 0.0.0.0 --port 5689