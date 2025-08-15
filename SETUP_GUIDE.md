# Local Development Setup Guide

This guide will walk you through setting up and running the YouTube Transcription Service on your local machine **without using Docker**. This method is ideal for contributing to the code.

## ✅ Prerequisites

Before you begin, make sure you have the following software installed on your system:

- **[Node.js](https://nodejs.org/)**: Version 18 or later.
- **[npm](https://www.npmjs.com/)**: Included with Node.js.
- **[ffmpeg](https://ffmpeg.org/download.html)**: A tool for audio conversion. It must be installed and accessible in your system's PATH.
- **[Redis](https://redis.io/docs/getting-started/)**: A Redis server is required for the asynchronous job queue. You can install it locally or run it via Docker.

> **Tip:** To check if `ffmpeg` is installed correctly, open a terminal and run `ffmpeg -version`.

---

## ⚙️ Setup Instructions

### 1. **Clone the Repository**

First, clone the project to your local machine:

```bash
git clone https://github.com/devtitus/YouTube-Transcripts-Using-Whisper.git
cd transcripts-project
```

### 2. **Install Node.js Dependencies**

Install all the required Node.js packages using npm:

```bash
npm install
```

### 3. **Configure Environment Variables**

Create a `.env` file in the project root by copying the example file:

```bash
cp .env.example .env
```

Now, open the `.env` file and add your Groq API key.

```env
# .env file

# Get an API key from https://console.groq.com/keys
GROQ_API_KEY=your_groq_api_key_here

# (Optional) Set a key to secure your service endpoint
# API_KEY=a_secret_key_for_your_service

# Server port
PORT=5687

# Redis connection for the job queue
REDIS_HOST=localhost
REDIS_PORT=6382

# (Optional) Webhook URL for async job completion
# WEBHOOK_URL=
```

- The `GROQ_API_KEY` is required for the service to work.
- `REDIS_HOST` and `REDIS_PORT` are required for the asynchronous features.

---

## ▶️ Running the Service

To run the full service locally, you need to run **two separate processes** in two different terminals: the API server and the Worker.

### Terminal 1: Start the API Server

```bash
npm run dev
```

This command starts the **Node.js Fastify server** on port `5687`. This server handles all incoming API requests (both synchronous and asynchronous).

### Terminal 2: Start the Worker

```bash
npm run worker
```

This command starts the **background worker**. This process listens to the Redis queue for new transcription jobs and executes them. Without the worker running, asynchronous jobs will be created but will never be processed.

## 🧪 How to Use the Service

Once both the server and worker are running, you can send requests to the API.

### Example Synchronous Request (using curl)

This is the simplest way to get a transcript. The request will block until the transcript is ready.

```bash
curl -X POST "http://localhost:5687/v1/sync/transcripts?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

### Example Asynchronous Request (using curl)

This is ideal for longer videos.

1.  **Create the job:**
    ```bash
    curl -X POST -H "Content-Type: application/json" \
      -d '{"youtubeUrl": "https://www.youtube.com/watch?v=your_video_id"}' \
      http://localhost:5687/v1/async/transcripts
    ```
    This will return a `jobId`.

2.  **Check the status:**
    ```bash
    curl http://localhost:5687/v1/async/transcripts/status/YOUR_JOB_ID
    ```

If you have set an `API_KEY` in your `.env` file, you must include it in the header of your requests (e.g., `-H "X-API-Key: your_secret_key"`).
