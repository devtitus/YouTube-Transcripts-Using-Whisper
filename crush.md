# Project Knowledge Base

## Project Overview
TypeScript/Python pipeline for YouTube transcript processing with:
- TypeScript backend (`src/`)
- Python ASR service using Whisper models (`py_asr_service/`)
- Dockerized infrastructure
- Groq API and local transcription options

## Key Commands
```bash
# Development
npm run dev

# Build
npm run build

# Test
npm test

# Lint
npm run lint

# Start Python ASR service
npm run start:python

# Cleanup resources
npm run cleanup
```

## Project Structure
- `src/`: TypeScript backend
  - `pipeline/`: Processing workflows
  - `limits/`: Rate limiting
  - `store/`: Data storage
- `py_asr_service/`: Whisper-based ASR service
- `audio_file/`: Output directory
- `scripts/`: Infrastructure helpers

## Style Guide
- Follow existing TypeScript patterns
- Use async/await consistently
- Maintain Python service structure
- Keep pipeline stages modular

## Tooling Preferences
- TypeScript 5+
- Node 18+
- Python 3.11+
- Docker Compose
- Groq API for cloud transcription