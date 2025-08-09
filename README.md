# YouTube Transcripts Service

A Node.js service for transcribing YouTube videos using Groq API with rate limiting and Redis support.

## Features

- YouTube video transcription using Groq's Whisper models
- Rate limiting with Redis backend
- Query parameter and JSON body support
- Docker Compose deployment
- Multiple output formats (JSON, SRT, VTT, TXT)
- No persistent storage (memory-based job tracking)

## Quick Start with Docker

1. **Clone and setup environment:**

   ```bash
   git clone https://github.com/devtitus/YouTube-Transcripts-Using-Whisper.git
   cd transcripts_project
   cp .env.docker .env
   # Edit .env and add your GROQ_API_KEY
   ```

2. **Start with Docker Compose:**

   ```bash
   docker-compose up -d
   ```

3. **Test the API:**
   ```bash
   curl 'http://localhost:5685/v1/transcripts?url=https://www.youtube.com/watch?v=jvDJ5jTamHE&language=en&model=distil-whisper-large-v3-en&sync=true'
   ```

## API Usage

### POST /v1/transcripts

**Query Parameters:**

- `url` or `youtubeUrl`: YouTube video URL (required)
- `language`: Language code (e.g., "en") (optional)
- `model`: Whisper model (optional)
  - `distil-whisper-large-v3-en`
  - `whisper-large-v3-turbo`
  - `whisper-large-v3`
- `sync`: Set to "true" for synchronous processing (optional)

**JSON Body (alternative):**

```json
{
  "youtubeUrl": "https://www.youtube.com/watch?v=jvDJ5jTamHE",
  "options": {
    "language": "en",
    "model": "distil-whisper-large-v3-en"
  },
  "sync": true
}
```

### Examples

**Query Parameters:**

```bash
curl 'http://localhost:5685/v1/transcripts?url=https://www.youtube.com/watch?v=jvDJ5jTamHE&language=en&model=distil-whisper-large-v3-en&sync=true'
```

**JSON Body:**

```bash
curl -X POST 'http://localhost:5685/v1/transcripts' \
  -H 'Content-Type: application/json' \
  -d '{
    "youtubeUrl": "https://www.youtube.com/watch?v=jvDJ5jTamHE",
    "options": {"language": "en", "model": "distil-whisper-large-v3-en"},
    "sync": true
  }'
```

## Rate Limiting

The service implements Groq's rate limits:

- **20 requests/minute**: Waits until next minute
- **7,200 audio seconds/hour**: Waits until next hour
- **2,000 requests/day**: Returns 429 error
- **28,800 audio seconds/day**: Returns 429 error

Rate limiting data is stored in Redis for persistence across restarts.

## Development

**Local development:**

```bash
npm install
npm run dev
```

**Build:**

```bash
npm run build
npm start
```

## Environment Variables

- `GROQ_API_KEY`: Your Groq API key (required)
- `GROQ_WHISPER_MODEL`: Default model (default: distil-whisper-large-v3-en)
- `GROQ_BASE_URL`: Groq API base URL (default: https://api.groq.com/openai/v1)
- `REDIS_URL`: Redis connection URL (default: redis://localhost:6379)
- `PORT`: Server port (default: 8080)

## Docker Compose Services

- **app**: Main transcription service
- **redis**: Redis server for rate limiting and caching

## Health Check

```bash
curl http://localhost:8080/healthz
```

## Notes

- Transcript data is not persisted - use `sync=true` for immediate results
- Audio files are temporarily stored during processing and cleaned up automatically
- The service falls back to filesystem-based rate limiting if Redis is unavailable
