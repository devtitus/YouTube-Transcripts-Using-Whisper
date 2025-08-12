# Project Explanation

This document explains how the YouTube Transcription Service works from the inside. It's designed to be easy to understand, even if you're new to some of the technologies used.

## 💡 The Big Picture: What It Does

At its core, this project is a service that turns spoken words from a YouTube video into written text. You give it a YouTube link, and it gives you back a transcript with timestamps.

The entire process runs on your own machine, using the `faster-whisper` library for high-quality, private, and offline-capable transcription.

--- 

## 🌊 How It Works: A Step-by-Step Flow

Here’s a simple breakdown of what happens when you ask the service to transcribe a YouTube video:

1.  **You Make a Request:** You send a request to the service's API with the YouTube URL you want to transcribe.

2.  **Download the Audio:** The service uses a tool called `yt-dlp` to download just the audio from the YouTube video. It saves this audio into a temporary, job-specific directory.

3.  **Convert the Audio:** The downloaded audio needs to be in a specific format that the transcription models can understand. The service uses a powerful tool called `ffmpeg` to convert the audio into a **16kHz mono WAV file**. This is a standard, high-quality format for speech recognition.

4.  **Chunk the Audio (If Necessary):** Large audio files can be too big for the transcription model to handle in one go. To solve this, the service automatically checks the file size and, if it exceeds a certain limit, it splits the audio into smaller, sequential chunks using `ffmpeg`. This makes the transcription process much more reliable for long videos.

5.  **Transcribe the Audio:** This is the main event. The clean WAV audio file (or its chunks) is sent to the local Python server, which uses `faster-whisper` (an optimized version of Whisper) to transcribe the audio. This runs entirely on your own machine. The service also uses a Voice Activity Detection (VAD) filter to skip silent parts of the audio, speeding up the process.

6.  **Merge and Format the Transcript:** If the audio was split into chunks, the service intelligently merges the transcribed text from each chunk back together, adjusting the timestamps to be seamless. The final transcript is then formatted into several standard formats:
    - **`JSON`:** A structured format that's easy for other programs to read.
    - **`SRT` & `VTT`:** Standard subtitle formats that can be used with video players.
    - **`TXT`:** A plain text file with just the transcribed text.

7.  **Get the Result:** The final, formatted transcript is sent back to you in the API response.

8.  **Clean Up:** After the transcription is complete, the service automatically deletes the temporary directory containing all audio files and chunks to save space.

--- 

## 🛠️ Key Technologies

- **Node.js with Fastify:** The main API is built with Fastify, a very fast and efficient web server for Node.js.
- **Python with FastAPI:** The local transcription service is a separate API built with FastAPI, which is perfect for creating high-performance Python services.
- **`yt-dlp`:** A command-line program to download videos and audio from YouTube and other sites.
- **`ffmpeg`:** The swiss-army knife for converting and splitting audio and video files.
- **`faster-whisper`:** An optimized C++ implementation of the Whisper model for efficient, high-quality local transcription.
- **Docker & Docker Compose:** Used to package the entire application into containers, making it incredibly easy to deploy and run anywhere.
