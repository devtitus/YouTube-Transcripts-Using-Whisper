# YouTube Transcription Service

This project is a powerful and flexible service that automatically generates transcripts for any YouTube video. You provide a YouTube URL, and the service returns the video's text with timestamps. It's designed to be easy to use, with options for both fast cloud-based transcription and a private, local-only mode.

## ✨ Features

- **Dual Transcription Modes:**
  - **☁️ Cloud-Powered (Groq):** Uses the [Groq API](https://groq.com/) for incredibly fast and accurate transcription with OpenAI's Whisper models.
  - **💻 Local-Only:** Runs a private, on-device transcription service using `faster-whisper` for offline use and data privacy.
- **Automatic Fallback:** If one transcription service fails, it can automatically switch to the other, ensuring high availability.
- **Smart Chunking:** Automatically splits large audio files into smaller chunks to meet API limits and improve reliability for both local and cloud processing.
- **Easy Deployment:** Get started in minutes with Docker Compose.
- **Multiple Output Formats:** Get your transcripts in `JSON`, `SRT`, `VTT`, or plain `TXT`.
- **Smart Rate Limiting:** Automatically manages API usage to prevent hitting Groq's rate limits.
- **Flexible API:** Submit transcription jobs via query parameters or a JSON body.

## 🚀 Quick Start (Docker)

The easiest way to get the service running is with Docker.

### 1. **Set Up the Environment**

First, clone the project and create your environment file from the example:

```bash
git clone https://github.com/devtitus/YouTube-Transcripts-Using-Whisper.git
cd YouTube-Transcripts-Using-Whisper
cp .env.docker .env
```

Next, open the `.env` file in a text editor and add your Groq API key. If you don't have one, you can get it from the [Groq Console](https://console.groq.com/keys).

```env
# .env
GROQ_API_KEY=your_groq_api_key_here
```

> **Note:** If you leave the `GROQ_API_KEY` blank, the service will run in **local-only** mode.

### 2. **Build and Run the Service**

With Docker running, start the services using Docker Compose:

```bash
# This command builds the images and starts the services in the background.
docker-compose up --build -d
```

The service is now running! The main API is available at `http://localhost:5685`.

### 3. **Test the API**

You can test the service by sending a `curl` request. Here’s how to transcribe a video and get the result directly (synchronously):

```bash
# Example: Transcribe a video using the default "auto" mode
curl "http://localhost:5685/v1/transcripts?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ&sync=true"
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
    curl "http://localhost:5685/v1/transcripts?url=<YOUTUBE_URL>&model_type=cloud&model=whisper-large-v3"
    ```

2.  **JSON Body (for more control):**

    ```bash
    curl -X POST http://localhost:5685/v1/transcripts \
      -H "Content-Type: application/json" \
      -d '{
        "youtubeUrl": "<YOUTUBE_URL>",
        "options": {
          "model_type": "local",
          "model": "base.en"
        }
      }'
    ```

### Parameters

| Parameter | Location | Description | Example |
| : | : | : | : |
| `youtubeUrl` or `url` | Body / Query | **Required.** The URL of the YouTube video. | `https://youtube.com/watch?v=...` |
| `model_type` | Body / Query | `cloud`, `local`, or `auto` (default). Chooses the transcription service. | `cloud` |
| `model` | Body / Query | The specific model to use. See below for options. | `whisper-large-v3` |
| `language` | Body / Query | A hint for the audio language (e.g., "en", "es"). | `en` |

### Available Models

- **Cloud (Groq):** `whisper-large-v3-turbo` (default), `whisper-large-v3`, `distil-whisper-large-v3-en`
- **Local (`faster-whisper`):** `base.en` (default), `small.en`, `tiny.en`, `large-v3`

## 🔧 Local Development (Without Docker)

If you prefer to run the service without Docker, see the [**Local Setup Guide**](./SETUP_GUIDE.md).

## 🐳 Docker Deployment

For more detailed information on Docker deployment, including multi-container setups and troubleshooting, see the [**Docker Guide**](./README.docker.md).

## 📄 Project Documentation

- **[EXPLANATION.md](./EXPLANATION.md):** A detailed look at how the project works internally.
- **[WORKFLOW.md](./WORKFLOW.md):** A diagram and explanation of the data flow.
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md):** Instructions for setting up a local development environment.
