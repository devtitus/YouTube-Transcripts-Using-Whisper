# Setup Guide

This guide will walk you through setting up and running the transcription service. You can choose to run the project using Docker (recommended for ease of use) or by setting up a local environment.

## Method 1: Running with Docker (Recommended)

Using Docker is the easiest way to get the service running, as it automatically handles all dependencies and configurations.

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed on your system.
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop).

### Steps

1.  **Clone the Repository:**

    ```bash
    git clone https://github.com/devtitus/YouTube-Transcripts-Using-Whisper.git
    cd transcripts-project
    ```

2.  **Create an Environment File:**

    Create a file named `.env` in the root of the project and add the following content. This is where you will put your Groq API key.

    ```
    # .env file
    GROQ_API_KEY=your_groq_api_key_here
    GROQ_WHISPER_MODEL=  # pick one: whisper-large-v3-turbo (default), whisper-large-v3, or distil-whisper-large-v3-en
    GROQ_BASE_URL=https://api.groq.com/openai/v1/
    ```

    - **To use the Groq API:** Get an API key from [Groq](https://console.groq.com/keys) and paste it into the `.env` file.
    - **To use the local model:** You can leave the `GROQ_API_KEY` blank. You will need to download a `whisper.cpp` model and place it in the `models` directory (see local setup for more details).

3.  **Build and Run with Docker Compose:**

    Open a terminal in the project's root directory and run the following command:

    ```bash
    docker-compose up --build
    ```

    This command will:

    - Build the Docker image for the application.
    - Start the transcription service and a Redis container.
    - The service will be available at `http://localhost:5685`.

4.  **Stopping the Service:**

    To stop the services, press `Ctrl + C` in the terminal where `docker-compose` is running, or run the following command from another terminal:

    ```bash
    docker-compose down
    ```

## Method 2: Local Development Setup

If you prefer to run the service without Docker, you can set up a local development environment.

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or later)
- [npm](https://www.npmjs.com/) (included with Node.js)
- [ffmpeg](https://ffmpeg.org/download.html) installed and available in your system's PATH.
- (Optional) A C++ compiler to build `whisper.cpp` for local transcription.

### Steps

1.  **Clone the Repository:**

    ```bash
    git clone https://github.com/devtitus/YouTube-Transcripts-Using-Whisper.git
    cd transcripts-project
    ```

2.  **Install Dependencies:**

    ```bash
    npm install
    ```

3.  **Configure Environment Variables:**

    Create a `.env` file in the project root:

    ```
    # .env file

    # For Groq API transcription (recommended)
    GROQ_API_KEY=your_groq_api_key_here
    GROQ_WHISPER_MODEL= # pick one: whisper-large-v3-turbo (default), whisper-large-v3, or distil-whisper-large-v3-en
    GROQ_BASE_URL=https://api.groq.com/openai/v1/
    PORT=5685

    # For local transcription with whisper.cpp
    # WHISPER_CMD=path/to/your/whisper.cpp/main
    # WHISPER_MODEL=ggml-base.en.bin
    ```

    - **For Groq:** Fill in your `GROQ_API_KEY`.
    - **For Local `whisper.cpp`:**
      1.  Download or build `whisper.cpp` from the [official repository](https://github.com/ggerganov/whisper.cpp).
      2.  Download a model (e.g., `ggml-base.en.bin`) from the `whisper.cpp` repository.
      3.  Create a `models` directory in the project root and place the model file inside it.
      4.  Set the `WHISPER_CMD` variable in your `.env` file to the path of the `main` executable of `whisper.cpp`.

4.  **Run the Service:**

    ```bash
    npm run dev
    ```

    This will start the server in development mode with hot-reloading. The service will be available at `http://localhost:5685` (or the port specified in your `.env` file).

## How to Use the Service

Once the service is running, you can send `POST` requests to the `/v1/transcripts` endpoint.

### Example Request (using curl)

```bash
curl -X POST -H "Content-Type: application/json" \
-d '{"youtubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "sync": true}' \
http://localhost:5685/v1/transcripts
```

- Replace `5685` with `8080` if you are running a local development server.
- Set `sync` to `true` to wait for the transcript to be generated and returned in the response. This is recommended for shorter videos.
- Set `sync` to `false` (or omit it) for an asynchronous job that will run in the background. The response will contain a `jobId` that you can use to check the status later (though the current version of the service does not persist job results).
