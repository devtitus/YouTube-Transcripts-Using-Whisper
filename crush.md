# Project Knowledge Base

## Project Overview
A TypeScript service for YouTube transcript processing using the Groq API.
- TypeScript backend (`src/`)
- Dockerized for easy deployment
- Uses Groq API for all transcriptions

## Key Commands
```bash
# Development (runs the Node.js server with hot-reloading)
npm run dev

# Build for production
npm run build

# Start production server
npm run start

# Cleanup temporary files
npm run cleanup
```

## Project Structure
- `src/`: TypeScript backend
  - `pipeline/`: Transcription processing workflow
  - `limits/`: Rate limiting for the Groq API
- `audio_file/`: Default output directory for temporary audio (created at runtime, ignored by .gitignore)
- `scripts/`: Helper scripts

## Style Guide
- Follow existing TypeScript patterns.
- Use async/await consistently.
- Keep pipeline stages modular.

## Tooling Preferences
- TypeScript 5+
- Node 18+
- Docker Compose
- Groq API for cloud transcription