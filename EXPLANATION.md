# Project Explanation

This project is a service that automatically generates transcripts for any YouTube video. You give it a YouTube URL, and it gives you back the text from the video, along with timestamps.

## How it Works: A Simple Flow

Here is a step-by-step breakdown of what happens when you ask the service to transcribe a YouTube video:

1.  **You Make a Request:** You send a request to the service with the YouTube URL you want to transcribe.

2.  **Download the Audio:** The service takes the YouTube URL and uses a tool called `yt-dlp` to download just the audio from the video. It saves this audio as a file.

3.  **Convert the Audio:** The downloaded audio might be in a format like M4A or WebM. The transcription model needs the audio to be in a specific format (16kHz mono WAV). The service uses a tool called `ffmpeg` to convert the audio file into this required format.

4.  **Transcribe the Audio:** This is the core step. The service now has a clean audio file ready for transcription. It uses one of two methods:
    *   **Groq API (Default):** If you provide a Groq API key, it sends the audio file to the Groq API, which uses a powerful Whisper model to transcribe the audio very quickly. The service has a built-in rate limiter to make sure it doesn't send too many requests to Groq too quickly.
    *   **Local Model:** If you don't provide a Groq API key, it uses a local version of a transcription model called `whisper.cpp`. This runs on the same machine as the service, so it doesn't depend on an internet connection to a third-party service.

5.  **Format the Transcript:** The transcription model returns the text of the audio, along with timestamps for each segment of text. The service then formats this information into several standard formats:
    *   **JSON:** A structured format that's easy for other programs to read.
    *   **SRT & VTT:** Standard subtitle formats that can be used with video players.
    *   **TXT:** A plain text file with just the transcribed text.

6.  **Get the Result:**
    *   If you made a "synchronous" request, you'll get the final transcript back as soon as it's ready.
    *   If you made an "asynchronous" request, the service will start the process in the background and immediately give you a Job ID. You can use this ID to check the status of your transcription later.

## Key Technologies

*   **Fastify:** A fast and lightweight web server for Node.js.
*   **yt-dlp:** A command-line program to download videos from YouTube and other sites.
*   **ffmpeg:** A powerful tool for converting audio and video files.
*   **Whisper:** An automatic speech recognition model from OpenAI. This project uses either the Groq API's version of Whisper or a C++ version of it (`whisper.cpp`).
*   **Redis:** An in-memory data store used for rate limiting to avoid exceeding API quotas.
