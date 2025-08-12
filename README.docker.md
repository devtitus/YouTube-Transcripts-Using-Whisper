# Docker Deployment Guide

This guide provides detailed instructions for deploying the YouTube Transcription Service using Docker.

## 🚀 Deployment Overview

The service is packaged into a single, lightweight Docker container that runs the Node.js application. It is configured to use the Groq API for all transcription tasks.

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
```

> **Note:** `GROQ_API_KEY` is **required** for the service to function.

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

Once the service is running, you can test the API, which will be available at `http://localhost:5685`.

```bash
# Send a request to the transcription endpoint
curl "http://localhost:5685/v1/transcripts?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

If you set an `API_KEY` in your `.env` file, include it as a header:
```bash
curl -H "X-API-Key: your_secret_key" \
"http://localhost:5685/v1/transcripts?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

--- 

## 🏗️ Architecture Overview

The Docker setup consists of a single **Node.js API** service running on port `5685`. It handles job creation, downloads audio, sends it to the Groq API for transcription, and returns the result.

## 📦 Volumes

A Docker volume is used to store temporary audio files during processing.

- `audio_data`: A temporary storage location for audio files.

To clear this volume, you can run `docker-compose down -v`.

## ⚙️ Environment Variables

You can customize the service's behavior by setting environment variables in your `.env` file.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | `(none)` | **Required.** Your API key from Groq. |
| `API_KEY` | `(none)` | An optional secret key to protect the API endpoint. |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3-turbo` | The default model to use for the Groq cloud service. |
| `GROQ_CHUNK_SECONDS` | `600` | Duration of each audio chunk in seconds. |
| `GROQ_MAX_REQUEST_MB` | `15` | File size threshold in MB for triggering chunking. |
| `GROQ_TIMEOUT_MS` | `1800000` | Request timeout in milliseconds for Groq transcription. |

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

- **Node.js API:** `curl http://localhost:5685/healthz`
