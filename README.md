# YouTube Transcription Service

This project is a powerful and efficient service that automatically generates transcripts for any YouTube video using the Groq API. You provide a YouTube URL, and the service returns the video's text with timestamps.

## ✨ Features

- **☁️ Cloud-Powered (Groq):** Uses the [Groq API](https://groq.com/) for incredibly fast and accurate transcription with OpenAI's Whisper models.
- **Smart Chunking:** Automatically splits large audio files into smaller chunks to meet API limits and improve reliability.
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
cd transcripts_project
cp .env.docker .env
```

Next, open the `.env` file in a text editor and add your Groq API key. You can get one from the [Groq Console](https://console.groq.com/keys).

```env
# .env
GROQ_API_KEY=your_groq_api_key_here
```

> **Note:** The `GROQ_API_KEY` is **required** for the service to operate.

### 2. **Build and Run the Service**

With Docker running, start the service using Docker Compose:

```bash
# This command builds the image and starts the service in the background.
docker-compose up --build -d
```

The service is now running! The main API is available at `http://localhost:5687`.

### 3. **Test the API**

You can test the service by sending a `curl` request. Here’s how to transcribe a video:

```bash
# Example: Transcribe a video
curl "http://localhost:5687/v1/transcripts?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
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

## 🐳 Docker Deployment

For more detailed information on Docker deployment, see the [**Docker Guide**](./README.docker.md).

## 📄 Project Documentation

- **[EXPLANATION.md](./EXPLANATION.md):** A detailed look at how the project works internally.
- **[WORKFLOW.md](./WORKFLOW.md):** A diagram and explanation of the data flow.
- **[SETUP_GUIDE.md](./SETUP_GUIDE.md):** Instructions for setting up a local development environment.
