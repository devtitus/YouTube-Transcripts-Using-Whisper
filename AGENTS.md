# Project Knowledge Base

## Project Overview
This project is a TypeScript/Python pipeline for generating transcripts from YouTube videos. It features:
- A **TypeScript backend** (`src/`) that manages the API and workflow.
- A **Python ASR service** (`py_asr_service/`) using `faster-whisper` for local, on-device transcription.
- A **dual-mode system** that can use either the private local service or the fast **Groq API** (cloud-based) for transcription.
- A fully **Dockerized infrastructure** for easy deployment.

## Key Commands
```bash
# Run the full service in development mode (Node.js + Python)
npm run dev

# Build the TypeScript code for production
npm run build

# Set up the Python virtual environment and install dependencies
npm run python:setup

# Start only the Python ASR service
npm run python:start

# Clean up temporary audio files
npm run cleanup
```

## Project Structure
- `src/`: The core TypeScript backend.
  - `pipeline/`: Contains the logic for the transcription workflow (downloading, converting, transcribing).
  - `limits/`: Handles rate limiting for the Groq API.
- `py_asr_service/`: The Python FastAPI service for local transcriptions.
- `scripts/`: Helper scripts for setup and cleanup.
- `audio_file/`: The default directory for temporary audio files (should be in `.gitignore`).

## Style Guide
- Follow the existing TypeScript and Python coding patterns.
- Use `async/await` for all asynchronous operations in TypeScript.
- Keep the pipeline stages in `src/pipeline/` modular and focused on a single task.
- Ensure environment variables are documented in `.env.example` and `README.docker.md`.

## Tooling Preferences
- TypeScript 5+
- Node.js 18+
- Python 3.10+
- Docker Compose
- `yt-dlp` for downloading audio.
- `ffmpeg` for audio conversion and manipulation.