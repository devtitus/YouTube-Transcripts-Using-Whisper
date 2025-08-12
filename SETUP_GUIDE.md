# Local Development Setup Guide

This guide will walk you through setting up and running the YouTube Transcription Service on your local machine **without using Docker**. This method is ideal for contributing to the code.

## ✅ Prerequisites

Before you begin, make sure you have the following software installed on your system:

- **[Node.js](https://nodejs.org/)**: Version 18 or later.
- **[npm](https://www.npmjs.com/)**: Included with Node.js.
- **[ffmpeg](https://ffmpeg.org/download.html)**: A tool for audio conversion. It must be installed and accessible in your system's PATH.

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
PORT=5685
```

- The `GROQ_API_KEY` is required for the service to work.

---

## ▶️ Running the Service

Now you are ready to start the service.

```bash
npm run dev
```

This command starts the **Node.js Fastify server** on port `5685`. The service runs in development mode with hot-reloading, so any changes you make to the code will automatically restart the server.

## 🧪 How to Use the Service

Once the service is running, you can send `POST` requests to the `/v1/transcripts` endpoint.

### Example Request (using curl)

Here is an example of how to transcribe a video:

```bash
curl "http://localhost:5685/v1/transcripts?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

If you have set an `API_KEY` in your `.env` file, you must include it in the header:

```bash
curl -H "X-API-Key: a_secret_key_for_your_service" \
"http://localhost:5685/v1/transcripts?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```
