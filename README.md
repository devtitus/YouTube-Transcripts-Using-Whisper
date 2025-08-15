# YouTube Transcription Service

This project is a powerful, private, and easy-to-use service that automatically generates transcripts for any YouTube video. You provide a YouTube URL, and the service returns the video's text with timestamps. It runs a local transcription service using `faster-whisper` for performance, privacy, and offline use.

## ✨ Features

- **💻 Private & Local-Only:** Runs a private, on-device transcription service using `faster-whisper` for 100% offline use and data privacy.
- **🚀 High Performance:** Uses an optimized version of Whisper and includes Voice Activity Detection (VAD) to quickly process audio by skipping silent segments.
- **🚀 Smart Chunking:** For long videos, enable chunking to process audio in parallel for faster transcriptions.
- **Easy Deployment:** Get started in minutes with Docker Compose.
- **Multiple Output Formats:** Get your transcripts in `JSON`, `SRT`, `VTT`, or plain `TXT`.
- **Flexible API:** Submit transcription jobs via query parameters or a JSON body.

## 🚀 Quick Start (Docker)

The easiest way to get the service running is with Docker.

### 1. **Set Up the Environment**

First, clone the project. No API keys are needed.

```bash
git clone https://github.com/devtitus/YouTube-Transcripts-Using-Whisper.git
cd transcripts_project
```

The service is ready to run out-of-the-box.

### 2. **Build and Run the Service**

With Docker running, start the services using Docker Compose:

```bash
# This command builds the images and starts the services in the background.
docker-compose up --build -d
```

The service is now running! The main API is available at `http://localhost:5688`.

### 3. **Test the API**

You can test the service by sending a `curl` request. Here’s how to transcribe a video:

```bash
# Example: Transcribe a video
curl "http://localhost:5688/v1/transcripts?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

You should see a JSON response containing the full transcript.

## ⚙️ API Usage

You can create a new transcription job by sending a `POST` request to the `/v1/transcripts` endpoint.

### Request Endpoint

`POST /v1/transcripts`

### How to Provide Input

You can provide the YouTube URL and options in two ways:

1.  **Query Parameters (for simple requests):**

    ```bash
    curl "http://localhost:5688/v1/transcripts?url=<YOUTUBE_URL>&model=base.en"
    ```

2.  **JSON Body (for more control):**

    ```bash
    curl -X POST http://localhost:5688/v1/transcripts \
      -H "Content-Type: application/json" \
      -d '{
        "youtubeUrl": "<YOUTUBE_URL>",
        "options": {
          "model": "base.en"
        }
      }'
    ```

### Parameters

| Parameter                | Location     | Description                                                                 | Example                           |
| :----------------------- | :----------- | :-------------------------------------------------------------------------- | :-------------------------------- |
| `youtubeUrl` or `url`    | Body / Query | **Required.** The URL of the YouTube video.                                 | `https://youtube.com/watch?v=...` |
| `model`                  | Body / Query | The `faster-whisper` model to use.                                          | `small.en`                        |
| `language`               | Body / Query | A hint for the audio language (e.g., "en", "es").                           | `en`                              |
| `task`                   | Body / Query | Set to `translate` to translate the audio to English.                       | `translate`                       |
| `enableChunking`         | Body / Query | Set to `true` to enable chunking for faster processing of long videos.      | `true`                            |
| `chunkDurationSeconds`   | Body / Query | The duration of each audio chunk in seconds. (Default: `120`)               | `180`                             |
| `overlapSeconds`         | Body / Query | The overlap between consecutive chunks in seconds. (Default: `10`)          | `15`                              |

### Available Models

The following `faster-whisper` models are available:

- `base.en` (default)
- `small.en`
- `tiny.en`
- `large-v3`

## 🔧 Local Development (Without Docker)

If you prefer to run the service without Docker, see the [**Local Setup Guide**](./SETUP_GUIDE.md).

## 🐳 Docker Deployment

For more detailed information on Docker deployment, see the [**Docker Guide**](./README.docker.md).

## 📄 Project Documentation

- **[EXPLANATION.md](./EXPLANATION.md):** A detailed look at how the project works internally.
- **[WORKFLOW.md](./WORKFLOW.md):** A diagram and explanation of the data flow.
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md):** Instructions for setting up a local development environment.
