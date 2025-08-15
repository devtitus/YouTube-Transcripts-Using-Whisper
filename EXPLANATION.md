# Project Explanation

This document explains how the YouTube Transcription Service works from the inside. It's designed to be easy to understand, even if you're new to some of the technologies used.

## 💡 The Big Picture: What It Does

At its core, this project is a service that turns spoken words from a YouTube video into written text. You give it a YouTube link, and it gives you back a transcript with timestamps.

It does this using a super-fast cloud service called the **Groq API**, which runs powerful Whisper models for transcription.

The service offers two ways to do this:
1.  **Synchronous Mode:** You send a request and wait for the full transcript to be returned. Simple and direct.
2.  **Asynchronous Mode:** You submit a job and get an immediate confirmation. The service processes the video in the background and can notify you with a webhook when it's done. This is perfect for long videos.

--- 

## 🌊 How It Works: The Synchronous Flow

Here’s a simple breakdown of what happens when you use the synchronous API (`/v1/sync/transcripts`):

1.  **You Make a Request:** You send a request to the service's API with the YouTube URL you want to transcribe. The connection stays open while the job is processed.

2.  **Download the Audio:** The service uses a tool called `yt-dlp` to download just the audio from the YouTube video. It saves this audio as a temporary file (usually in `.m4a` or `.webm` format).

3.  **Convert the Audio:** The downloaded audio needs to be in a specific format that the transcription models can understand. The service uses a powerful tool called `ffmpeg` to convert the audio into a **16kHz mono WAV file**. This is a standard, high-quality format for speech recognition.

4.  **Chunk the Audio (If Necessary):** Large audio files can be too big for the Groq API to handle in one go. To solve this, the service automatically checks the file size and, if it exceeds a certain limit (e.g., 15MB), it splits the audio into smaller, sequential chunks using `ffmpeg`. This makes the transcription process much more reliable for long videos.

5.  **Transcribe the Audio:** This is the main event. The clean WAV audio file (or its chunks) is sent to the Groq API. The service includes a smart rate limiter to make sure it doesn’t send too many requests and exceed the free quotas.

6.  **Merge and Format the Transcript:** If the audio was split into chunks, the service intelligently merges the transcribed text from each chunk back together, adjusting the timestamps to be seamless. The final transcript is then formatted into several standard formats:
    - **`JSON`:** A structured format that's easy for other programs to read.
    - **`SRT` & `VTT`:** Standard subtitle formats that can be used with video players.
    - **`TXT`:** A plain text file with just the transcribed text.

7.  **Get the Result:** The final, formatted transcript is sent back to you in the API response.

8.  **Clean Up:** After the transcription is complete, the service automatically deletes all temporary audio files and chunks to save space.

---

## 🚀 How It Works: The Asynchronous Flow

The asynchronous flow is more advanced and involves three main components: the **API Server**, the **Job Queue (Redis)**, and the **Worker**.

1.  **You Make a Request:** You send a request to the asynchronous API endpoint (`/v1/async/transcripts`).

2.  **Job Creation:** The API server doesn't do the transcription itself. Instead, it creates a "job" – a small package of information containing the YouTube URL and any options you provided. It assigns this job a unique ID.

3.  **Queueing the Job:** The job is immediately placed into a queue managed by **Redis** and **BullMQ**. The server then instantly sends you back a response with the `jobId`. Your connection is now closed, and you're free to do other things.

4.  **The Worker Picks Up the Job:** A separate process, the **Worker**, is constantly watching the queue. As soon as a new job appears, the worker picks it up and starts the transcription process. This includes all the same steps as the synchronous flow:
    - Download the audio with `yt-dlp`.
    - Convert it with `ffmpeg`.
    - Chunk it if necessary.
    - Send it to the Groq API for transcription.

5.  **Storing the Result:** Once the transcription is complete, the worker stores the final transcript in Redis, linking it to the original `jobId`.

6.  **Checking the Status:** You can use the `/v1/async/transcripts/status/:jobId` endpoint at any time to check on the job. The API will look up the job in the queue and return its current state (e.g., `waiting`, `active`, `completed`, or `failed`). If it's completed, it will also fetch the final transcript from Redis and include it in the response.

7.  **Sending a Webhook (Optional):** If you've configured a webhook URL, the worker will automatically send a `POST` request to your specified URL with the final result as soon as the job is done. This is the most efficient way to get notified.

8.  **Clean Up:** The worker cleans up all temporary files, just like in the synchronous flow.

--- 

## 🛠️ Key Technologies

- **Node.js with Fastify:** The main API is built with Fastify, a very fast and efficient web server for Node.js.
- **Redis & BullMQ:** A powerful combination for managing background jobs. Redis acts as the queue's backend, while BullMQ provides the logic for creating, processing, and tracking jobs.
- **`yt-dlp`:** A command-line program to download videos and audio from YouTube and other sites.
- **`ffmpeg`:** The swiss-army knife for converting and splitting audio and video files.
- **Groq API's Whisper:** The core speech-to-text technology used for cloud-based transcription.
- **Docker & Docker Compose:** Used to package the entire application into a container, making it incredibly easy to deploy and run anywhere.
