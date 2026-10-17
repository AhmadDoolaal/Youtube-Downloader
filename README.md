# YTDownload — Fantastico YouTube Downloader

A glassmorphism YouTube-to-MP3/MP4 downloader with quality selection, built with Python (Flask + yt-dlp) and a modern frontend.

## Features
- Paste any YouTube URL (`youtube.com` or `youtu.be`)
- Choose format: **MP4 video** or **MP3 audio**
- Choose quality: Best / 1080p / 720p / 480p / 360p
- Video preview (title, thumbnail, channel, duration) before downloading
- Glassmorphism "fantastico" UI with animated background, progress ring, and recent-downloads list
- One-click clipboard paste

## Requirements
- Python 3.8+
- pip packages: `flask`, `flask-cors`, `yt-dlp`
- **FFmpeg** (strongly recommended) — required for true MP3 conversion and merged high-quality (1080p) MP4. Without it, the app falls back to single-file MP4 and audio-only streams.

## Install & Run

```bash
# 1. Go into the project folder
cd youtube-downloader

# 2. Install Python dependencies
pip install flask flask-cors yt-dlp

# 3. Install FFmpeg (Windows)
#    Option A: winget install ffmpeg
#    Option B: download from https://www.gyan.dev/ffmpeg/builds/ and add ffmpeg.exe to your PATH

# 4. Run the server
python app.py
```

Then open: **http://127.0.0.1:5000**

## Project Structure
```
youtube-downloader/
├── app.py              # Flask backend + yt-dlp downloader
├── README.md
├── templates/
│   └── index.html      # Frontend HTML
└── static/
    ├── style.css       # Glassmorphism UI
    └── app.js          # Frontend logic
```

## Notes
- Downloaded files are streamed directly to your browser and removed from the server immediately after sending, so nothing is stored long-term.
- Without FFmpeg, MP3 is not available as a true conversion; the server will tell you what's supported.
- Respect YouTube's Terms of Service and copyright. Use for personal, fair-use downloads only.

## Troubleshooting
- **"Invalid YouTube URL"** — make sure the link is a standard watch or youtu.be link.
- **Download fails** — YouTube occasionally changes its player; `pip install -U yt-dlp` usually fixes it.
- **MP3 / 1080p missing** — install FFmpeg and restart `app.py`.