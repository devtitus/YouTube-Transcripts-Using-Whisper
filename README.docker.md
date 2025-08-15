# Docker Deployment Guide

This guide provides detailed instructions for deploying the YouTube Transcription Service using Docker.

## 🚀 Deployment Overview

The service is deployed as a multi-container application using Docker Compose, consisting of three main services:
- **`transcripts-service`**: The main Node.js API server that accepts requests.
- **`worker`**: A background worker that processes transcription jobs from the queue.
- **`redis`**: The Redis server that powers the job queue and stores results.

This setup allows for scalable, non-blocking job processing, making it highly efficient for handling long-running transcription tasks.

---

## 🏁 Quick Start

Follow these steps to get the service running with Docker.

### 1. **Set Up the Environment**

First, create a `.env` file from the Docker environment template. This file will store your API keys.

```bash
# Copy the template to a new .env file
cp .env.docker .env
```

Next, open the `.env` file in a text editor and add your Groq API key. You can also set an optional API key to secure your service endpoint.

```env
# .env
# Required: Get an API key from https://console.groq.com/keys
GROQ_API_KEY=your_groq_api_key_here

# Optional: Set a key to secure your service endpoint
# API_KEY=a_secret_key_for_your_service

# Optional: For async job completion webhooks
# WEBHOOK_URL=https://your-app.com/webhook-receiver
```

> **Note:** `GROQ_API_KEY` is **required** for the service to function. `WEBHOOK_URL` is optional and used for asynchronous job notifications.

### 2. **Start the Service**

With Docker running, start the service using Docker Compose. This single command will build the image and start the container.

```bash
docker-compose up --build -d
```

### 3. **Check the Logs**

To see the logs and ensure everything is running correctly, use the `docker-compose logs` command.

```bash
docker-compose logs -f
```

### 4. **Test the API**

Once the service is running, you can test the API, which will be available at `http://localhost:5687`.

```bash
# Send a request to the synchronous transcription endpoint
curl -X POST "http://localhost:5687/v1/sync/transcripts?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

For asynchronous jobs, see the [main README file's API documentation](../README.md#asynchronous-api).

---

## 🏗️ Architecture Overview

The `docker-compose.yml` file defines three services:

1.  **`transcripts-service`**: The main Node.js API server. It receives all HTTP requests, and for asynchronous jobs, it adds them to the Redis queue before returning a `jobId` to the client.
2.  **`worker`**: A background Node.js process that listens for jobs on the Redis queue. It executes the transcription tasks (download, convert, transcribe) and stores the results back in Redis.
3.  **`redis`**: A Redis container that serves as the message broker for the job queue. It also stores the results of completed jobs.

## 📦 Volumes

Two Docker volumes are used to persist data:

- `audio_data`: A temporary storage location for audio files shared between the API and worker services.
- `redis_data`: Persists Redis data, ensuring that the job queue and results are not lost if the Redis container restarts.

To clear all volumes, you can run `docker-compose down -v`.

## ⚙️ Environment Variables

You can customize the service's behavior by setting environment variables in your `.env` file.

| Variable              | Default                  | Description                                                  |
| :-------------------- | :----------------------- | :----------------------------------------------------------- |
| `GROQ_API_KEY`        | `(none)`                 | **Required.** Your API key from Groq.                        |
| `API_KEY`             | `(none)`                 | An optional secret key to protect the API endpoint.          |
| `WEBHOOK_URL`         | `(none)`                 | An optional URL to send a POST request to on job completion. |
| `REDIS_HOST`          | `redis`                  | The hostname of the Redis service (for Docker Compose).      |
| `REDIS_PORT`          | `6382`                   | The port that the Redis service is exposed on.               |
| `GROQ_WHISPER_MODEL`  | `whisper-large-v3-turbo` | The default model to use for the Groq cloud service.         |
| `GROQ_CHUNK_SECONDS`  | `600`                    | Duration of each audio chunk in seconds.                     |
| `GROQ_MAX_REQUEST_MB` | `15`                     | File size threshold in MB for triggering chunking.           |
| `GROQ_TIMEOUT_MS`     | `1800000`                | Request timeout in milliseconds for Groq transcription.      |

## 🛠️ Useful Docker Commands

Here are some common commands for managing your Docker deployment:

```bash
# Start the service in the background
docker-compose up -d

# View real-time logs
docker-compose logs -f

# Stop the service
docker-compose down

# Rebuild the image and restart the service
docker-compose up --build -d

# Stop the service and remove the audio volume
docker-compose down -v

# Check the status of the running container
docker-compose ps
```

## 🩺 Health Checks

The service has a health check endpoint to ensure it is running correctly. Docker Compose automatically uses this to monitor the container's status.

- **Node.js API:** `curl http://localhost:5687/healthz`
