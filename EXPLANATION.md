# Project Explanation

This document explains how the YouTube Transcription Service works from the inside. It's designed to be easy to understand, even if you're new to some of the technologies used.

## 💡 The Big Picture: What It Does

At its core, this project is a service that turns spoken words from a YouTube video into written text. You give it a YouTube link, and it gives you back a transcript with timestamps.

The entire process runs on your own machine, using the `faster-whisper` library for high-quality, private, and offline-capable transcription.

--- 

## 🌊 How It Works: A Step-by-Step Flow

Here’s a simple breakdown of what happens when you ask the service to transcribe a YouTube video:

1.  **You Make a Request:** You send a request to the service's API with the YouTube URL and any options, like enabling chunking for faster processing.

2.  **Download and Optimize Audio:** The service uses `yt-dlp` and `ffmpeg` in a single step to download the audio and convert it directly to an **optimized `16kHz mono MP3` file**. This is much more efficient than creating a large, uncompressed WAV file.

3.  **Choose a Transcription Strategy:**
    - **If Chunking is Enabled:** For very long videos, you can enable chunking. The service will use `ffmpeg` to split the audio into smaller, overlapping chunks. This allows for faster, parallel processing.
    - **If Chunking is Disabled:** The service will process the entire audio file in one go. This is ideal for shorter videos and can offer the best accuracy.

4.  **Transcribe the Audio:** This is the main event. The optimized MP3 file (or its chunks) is sent to the local Python server, which uses `faster-whisper` to perform the transcription. The service also uses a Voice Activity Detection (VAD) filter to skip silent parts of the audio, speeding up the process significantly.

5.  **Merge and Format the Transcript:** If the audio was chunked, the service intelligently merges the transcribed text from all chunks back together, ensuring the timestamps are seamless and accurate. The final transcript is then formatted into several standard formats:
    - **`JSON`:** A structured format that's easy for other programs to read.
    - **`SRT` & `VTT`:** Standard subtitle formats that can be used with video players.
    - **`TXT`:** A plain text file with just the transcribed text.

6.  **Get the Result:** The final, formatted transcript is sent back to you in the API response.

7.  **Clean Up:** After the transcription is complete, the service automatically deletes the temporary directory containing the MP3 file and any audio chunks to save space.

--- 

## 🛠️ Key Technologies

- **Node.js with Fastify:** The main API is built with Fastify, a very fast and efficient web server for Node.js.
- **Python with FastAPI:** The local transcription service is a separate API built with FastAPI, which is perfect for creating high-performance Python services.
- **`yt-dlp`:** A command-line program to download videos and audio from YouTube and other sites.
- **`ffmpeg`:** The swiss-army knife for converting and splitting audio and video files.
- **`faster-whisper`:** An optimized C++ implementation of the Whisper model for efficient, high-quality local transcription.
- **Docker & Docker Compose:** Used to package the entire application into containers, making it incredibly easy to deploy and run anywhere.
