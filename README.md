# YouTube Transcription Service

This project is a powerful and efficient service that automatically generates transcripts for any YouTube video using the Groq API. You provide a YouTube URL, and the service returns the video's text with timestamps.

## ✨ Features

- **☁️ Cloud-Powered (Groq):** Uses the [Groq API](https://groq.com/) for incredibly fast and accurate transcription with OpenAI's Whisper models.
- **⚡️ Synchronous & Asynchronous API:** Choose between a simple, blocking API for quick tasks or a non-blocking API for long videos, complete with job tracking and webhooks.
- **Smart Chunking:** Automatically splits large audio files into smaller chunks to meet API limits and improve reliability.
- **Easy Deployment:** Get started in minutes with Docker Compose, including a Redis-backed job queue.
- **Multiple Output Formats:** Get your transcripts in `JSON`, `SRT`, `VTT`, or plain `TXT`.
- **Smart Rate Limiting:** Automatically manages API usage to prevent hitting Groq's rate limits.
- **Flexible API:** Submit transcription jobs via query parameters or a JSON body.

## 🚀 Quick Start (Docker)

The easiest way to get the service running is with Docker.

### 1. **Set Up the Environment**

First, clone the project and create your environment file from the example:

```bash
git clone https://github.com/devtitus/YouTube-Transcripts-Using-Whisper.git
cd transcripts_project
cp .env.docker .env
```

Next, open the `.env` file in a text editor and add your Groq API key. You can get one from the [Groq Console](https://console.groq.com/keys).

```env
# .env
GROQ_API_KEY=your_groq_api_key_here

# Optional: For async job completion webhooks
# WEBHOOK_URL=https://your-app.com/webhook-receiver
```

> **Note:** The `GROQ_API_KEY` is **required** for the service to operate. The `WEBHOOK_URL` is optional and is used by the asynchronous processing mode.

### 2. **Build and Run the Service**

With Docker running, start the service using Docker Compose:

```bash
# This command builds the image and starts the service in the background.
docker-compose up --build -d
```

The service is now running! The main API is available at `http://localhost:5687`.

### 3. **Test the API**

You can test the service by sending a `curl` request. Here’s how to transcribe a video using the synchronous endpoint:

```bash
# Example: Transcribe a video synchronously
curl -X POST "http://localhost:5687/v1/sync/transcripts?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

You should see a JSON response containing the full transcript. See the [Asynchronous API](#-asynchronous-api) section for non-blocking requests.

## ⚙️ API Usage

The service provides two modes for transcription: **Synchronous** for immediate results and **Asynchronous** for long-running jobs.

### Synchronous API (Simple & Blocking)

This mode is best for shorter videos or when you need the transcript in a single request-response cycle.

**Request Endpoint:** `POST /v1/sync/transcripts`

### How to Provide Input

You can provide the YouTube URL and options in two ways:

1.  **Query Parameters (for simple requests):**

    ```bash
    curl "http://localhost:5687/v1/transcripts?url=<YOUTUBE_URL>&model=whisper-large-v3"
    ```

2.  **JSON Body (for more control):**

    ```bash
    curl -X POST http://localhost:5687/v1/transcripts \
      -H "Content-Type: application/json" \
      -d '{
        "youtubeUrl": "<YOUTUBE_URL>",
        "options": {
          "model": "whisper-large-v3"
        }
      }'
    ```

### Parameters

| Parameter             | Location     | Description                                            | Example                           |
| :-------------------- | :----------- | :----------------------------------------------------- | :-------------------------------- |
| `youtubeUrl` or `url` | Body / Query | **Required.** The URL of the YouTube video.            | `https://youtube.com/watch?v=...` |
| `model`               | Body / Query | The specific Groq model to use. See below for options. | `whisper-large-v3`                |
| `language`            | Body / Query | A hint for the audio language (e.g., "en", "es").      | `en`                              |

### Available Models

- **Cloud (Groq):** `whisper-large-v3-turbo` (default), `whisper-large-v3`, `distil-whisper-large-v3-en`

### Asynchronous API (Scalable & Non-Blocking)

This mode is ideal for long videos. It immediately accepts the job, returns a job ID, and processes the transcription in the background. You can check the status using the job ID and optionally receive a webhook upon completion.

#### 1. Create a Transcription Job

Send a request to this endpoint to create a new job. The server will validate the request and add it to the processing queue.

**Request Endpoint:** `POST /v1/async/transcripts`

**Example Request:**
```bash
curl -X POST http://localhost:5687/v1/async/transcripts \
  -H "Content-Type: application/json" \
  -d '{
    "youtubeUrl": "https://www.youtube.com/watch?v=your_video_id"
  }'
```

**Example Response (202 Accepted):**
```json
{
  "jobId": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  "message": "Job accepted for processing.",
  "statusUrl": "http://localhost:5687/v1/async/transcripts/status/a1b2c3d4-e5f6-7890-1234-567890abcdef"
}
```

#### 2. Check Job Status

Use the `jobId` from the previous step to poll the status of your transcription job.

**Request Endpoint:** `GET /v1/async/transcripts/status/:jobId`

**Example Request:**
```bash
curl http://localhost:5687/v1/async/transcripts/status/a1b2c3d4-e5f6-7890-1234-567890abcdef
```

**Example Response (Completed):**
```json
{
  "jobId": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  "state": "completed",
  "progress": null,
  "result": {
    "text": "This is the full transcript...",
    "segments": [...]
  },
  "error": null,
  "timestamp": "2023-10-27T10:00:00.000Z"
}
```

**Job States:**
- `waiting`: The job is in the queue waiting to be processed.
- `active`: The job is currently being processed by a worker.
- `completed`: The job finished successfully. The `result` field will contain the transcript.
- `failed`: The job failed. The `error` field will contain the error message.

#### 3. Receive Webhook (Optional)

If you configure a `WEBHOOK_URL` in your `.env` file, the service will send a `POST` request to that URL with the final job details upon completion or failure.

**Example Webhook Payload:**
```json
{
  "jobId": "a1b2c3d4-e5f6-7890-1234-567890abcdef",
  "status": "completed",
  "result": {
    "text": "This is the full transcript...",
    "segments": [...]
  }
}
```

## 🐳 Docker Deployment

For more detailed information on Docker deployment, see the [**Docker Guide**](./README.docker.md).

## 📄 Project Documentation

- **[EXPLANATION.md](./EXPLANATION.md):** A detailed look at how the project works internally.
- **[WORKFLOW.md](./WORKFLOW.md):** A diagram and explanation of the data flow.
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md):** Instructions for setting up a local development environment.
