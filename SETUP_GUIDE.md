# Local Development Setup Guide

This guide will walk you through setting up and running the YouTube Transcription Service on your local machine **without using Docker**. This method is ideal if you want to have more direct control over the environment or contribute to the code.

## ✅ Prerequisites

Before you begin, make sure you have the following software installed on your system:

- **[Node.js](https://nodejs.org/)**: Version 18 or later.
- **[npm](https://www.npmjs.com/)**: Included with Node.js.
- **[Python](https://www.python.org/downloads/)**: Version 3.8 or later.
- **[ffmpeg](https://ffmpeg.org/download.html)**: A tool for audio conversion. It must be installed and accessible in your system's PATH.

> **Tip:** To check if `ffmpeg` is installed correctly, open a terminal and run `ffmpeg -version`. If it shows the version number, you're good to go.

---

## ⚙️ Setup Instructions

### 1. **Clone the Repository**

First, clone the project to your local machine:

```bash
git clone https://github.com/devtitus/YouTube-Transcripts-Using-Whisper.git
cd YouTube-Transcripts-Using-Whisper
```

### 2. **Install Node.js Dependencies**

Install all the required Node.js packages using npm:

```bash
npm install
```

### 3. **Set Up the Python Environment**

The project uses a Python script to automatically set up a virtual environment for the local transcription service. This keeps its dependencies isolated from your system.

Run the following command from the project root:

```bash
node scripts/setup-python.js
```

This script will:
- Create a `venv` folder inside `py_asr_service`.
- Install all the necessary Python packages from `requirements.txt`.

### 4. **Configure Environment Variables**

Create a `.env` file in the project root by copying the example file:

```bash
cp .env.example .env
```

Now, open the `.env` file and configure it:

```env
# .env file

# To use the fast cloud-based transcription:
# Get an API key from https://console.groq.com/keys
GROQ_API_KEY=your_groq_api_key_here

# To use the private, local-only transcription:
# Leave GROQ_API_KEY blank.

# You can also set the default model type ("auto", "cloud", or "local")
DEFAULT_MODEL_TYPE=auto

# Server port
PORT=5685
```

- **For Cloud Mode:** Fill in your `GROQ_API_KEY`.
- **For Local-Only Mode:** Leave `GROQ_API_KEY` empty.

### 5. **Build the TypeScript Code**

Before running the server, you need to compile the TypeScript code to JavaScript:

```bash
npm run build
```

---


## ▶️ Running the Service

Now you are ready to start the service. The project uses `concurrently` to run both the Node.js API and the Python transcription server at the same time.

```bash
npm run dev
```

This command will:
1.  Start the **Python FastAPI server** for local transcriptions on port `5686`.
2.  Start the **Node.js Fastify server** for the main API on port `5685`.

The service is now running in development mode with hot-reloading, so any changes you make to the code will automatically restart the server.

## 🧪 How to Use the Service

Once the service is running, you can send `POST` requests to the `/v1/transcripts` endpoint.

### Example Request (using curl)

Here is an example of how to transcribe a video and get the result immediately:

```bash
curl -X POST -H "Content-Type: application/json" \
-d '{"youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"}' \
http://localhost:5685/v1/transcripts
```

This will use the `auto` mode, which will try the Groq API first (if a key is provided) and fall back to the local service if needed.
