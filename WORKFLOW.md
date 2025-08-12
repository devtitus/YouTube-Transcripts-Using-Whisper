# Project Workflow

This document provides a visual and descriptive overview of the workflow for the YouTube Transcription Service. The diagram shows the journey from an initial API request to the final, delivered transcript.

## 🌊 Workflow Diagram

This diagram illustrates the simplified, step-by-step process.

```mermaid
graph TD
    A[Start] --> B[Receive POST Request];
    B --> C[Extract YouTube URL & Options];
    C --> D[Download Audio with yt-dlp];
    D --> E[Convert Audio to 16kHz WAV with ffmpeg];
    E --> F{Audio too large?};
    F -- Yes --> G[Split Audio into Chunks];
    F -- No --> H[Process as Single File];
    G --> I[Use Groq API on Each Chunk];
    H --> I;
    I --> J[Receive Transcripts from Groq];
    J --> K[Merge Transcripts & Adjust Timestamps];
    K --> L[Format Final Transcript];
    L --> M[Clean Up Temporary Audio Files];
    M --> N[Return Final Transcript];
    N --> O[End];
```

--- 

## 📝 Explanation of the Workflow

1.  **Receive Request:** The workflow begins when the service receives a `POST` request at the `/v1/transcripts` endpoint.

2.  **Extract URL & Options:** The service parses the request to get the YouTube URL and any other options provided, such as a specific `model`.

3.  **Download & Convert Audio:**
    - **`yt-dlp`** is used to download the audio from the YouTube URL.
    - **`ffmpeg`** then converts this audio into a standard `16kHz mono WAV` file, which is the ideal format for speech recognition.

4.  **Chunking Decision:** The service checks the size of the WAV file. To improve reliability and handle large files, it may be split into chunks.

5.  **Split Audio (If Needed):** For large files, `ffmpeg` is used to split the audio into smaller, sequential chunks.

6.  **Transcribe the Audio:**
    - Each chunk (or the single file) is sent to the **Groq API** for transcription.
    - The service uses a powerful Whisper model to generate the transcript very quickly.

7.  **Merge & Format Transcript:**
    - If the audio was chunked, the transcribed text from all chunks is intelligently merged.
    - Timestamps are adjusted to be continuous across the full duration of the original audio.
    - The final, unified transcript is formatted into `JSON`, `SRT`, `VTT`, and `TXT`.

8.  **Clean Up:** To save disk space, the service deletes all temporary files created during the process, including the downloaded audio, the converted WAV file, and all audio chunks.

9.  **Return Response:** The final, formatted transcript is sent back to the user in the API response, completing the request.
