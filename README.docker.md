# Docker Deployment Guide

This guide provides detailed instructions for deploying the YouTube Transcription Service using a simple and efficient single-container setup with Docker.

## 🚀 Deployment Overview

The service is designed to be easy to run using Docker Compose. The setup uses a single container that intelligently runs both the main Node.js API and the Python transcription service, making it resource-efficient and simple to manage.

--- 

## 🏁 Quick Start

Follow these steps to get the service running with Docker.

### 1. **Set Up the Environment**

First, create a `.env` file from the Docker environment template. This file will store your API key.

```bash
# Copy the template to a new .env file
cp .env.docker .env
```

Next, open the `.env` file in a text editor and add your Groq API key.

```env
# .env
GROQ_API_KEY=your_groq_api_key_here
```

> **Note:** If you leave `GROQ_API_KEY` blank, the service will automatically run in **local-only mode**, using the private, on-device transcription engine.

### 2. **Build the Application**

Before starting the Docker container, you need to build the TypeScript application. This compiles the code into JavaScript that can be run by Node.js.

```bash
# This command compiles the src/ directory into dist/
npm run build
```

### 3. **Start the Service**

With Docker running, start the service using Docker Compose:

```bash
# This command builds the image and starts the service in the background.
docker-compose up --build -d
```

### 4. **Check the Logs**

To see the logs and ensure everything is running correctly, use the `docker-compose logs` command.

```bash
docker-compose logs -f
```

### 5. **Test the API**

Once the service is running, you can test the API. The service will be available at `http://localhost:5685`.

```bash
# Test the local model
curl "http://localhost:5685/v1/transcripts?url=https://youtube.com/watch?v=...&model_type=local&sync=true"

# Test the cloud model (if you added a Groq API key)
curl "http://localhost:5685/v1/transcripts?url=https://youtube.com/watch?v=...&model_type=cloud&sync=true"
```

--- 

## 🏗️ Architecture Overview

The Docker setup consists of two main components running inside a single container:

- **Node.js API (Port `5685`)**: The main entry point for all requests. It handles job creation, downloads audio, and communicates with the Python service.
- **Python ASR Service (Port `5686`)**: A dedicated FastAPI server that runs the `faster-whisper` model for local, on-device transcriptions.
- **Redis (Port `6381`)**: A separate container that is used for rate limiting to ensure you don’t exceed the Groq API quotas.

An entrypoint script (`docker-entrypoint.sh`) manages starting both the Python and Node.js services in the correct order.

## 📦 Volumes

Docker volumes are used to persist data and cache models, which is crucial for efficiency.

- `audio_data`: A temporary storage location for audio files during processing.
- `models_data`: Stores the downloaded `faster-whisper` models so they don't need to be re-downloaded every time the container starts.
- `huggingface_cache`: A cache for models downloaded from Hugging Face.
- `redis_data`: Persists Redis data, so rate-limiting information is not lost on restart.

To clear all cached data, including models, you can run `docker-compose down -v`.

## ⚙️ Environment Variables

You can customize the service's behavior by setting environment variables in your `.env` file.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `GROQ_API_KEY` | `(none)` | **Required for cloud mode.** Your API key from Groq. |
| `DEFAULT_MODEL_TYPE` | `auto` | The default transcription mode: `local`, `cloud`, or `auto`. |
| `LOCAL_ASR_MODEL` | `base.en` | The default model to use for the local service. |
| `LOCAL_CHUNK_SECONDS` | `600` | Duration of each audio chunk in seconds for local service. |
| `LOCAL_MAX_FILE_MB` | `100` | File size threshold in MB for triggering chunking (local service). |
| `GROQ_WHISPER_MODEL` | `whisper-large-v3-turbo` | The default model to use for the Groq cloud service. |
| `GROQ_CHUNK_SECONDS` | `600` | Duration of each audio chunk in seconds for cloud service. |
| `GROQ_MAX_REQUEST_MB` | `15` | File size threshold in MB for chunking (cloud service). |

## 🛠️ Useful Docker Commands

Here are some common commands for managing your Docker deployment:

```bash
# Start services in the background
docker-compose up -d

# View real-time logs from all services
docker-compose logs -f

# Stop all running services
docker-compose down

# Rebuild the image and restart the services
docker-compose up --build -d

# Stop services and remove all associated volumes (clears caches)
docker-compose down -v

# Check the status and health of your running containers
docker-compose ps
```

## 🩺 Health Checks

The service has health check endpoints to ensure it is running correctly.

- **Node.js API:** `curl http://localhost:5685/healthz`
- **Python ASR Service:** `curl http://localhost:5686/healthz`

Docker Compose automatically uses these health checks to monitor the container status.
