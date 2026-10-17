import os
import re
import uuid
import shutil
from flask import Flask, render_template, request, jsonify, Response
from flask_cors import CORS
import yt_dlp

app = Flask(__name__, template_folder="templates", static_folder="static")
CORS(app)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DOWNLOAD_FOLDER = os.path.join(BASE_DIR, "downloads")
os.makedirs(DOWNLOAD_FOLDER, exist_ok=True)

# Detect ffmpeg availability (needed for true MP3 + merged high-quality MP4).
# Checks system PATH first, then a ffmpeg.exe dropped next to app.py.
_FFMPEG_PATH = shutil.which("ffmpeg")
if not _FFMPEG_PATH:
    _local = os.path.join(BASE_DIR, "ffmpeg.exe")
    if os.path.exists(_local):
        _FFMPEG_PATH = _local
FFMPEG_PATH = _FFMPEG_PATH
HAS_FFMPEG = FFMPEG_PATH is not None

# Quality presets -> max height
QUALITY_HEIGHTS = {
    "best": None,
    "1080": 1080,
    "720": 720,
    "480": 480,
    "360": 360,
}

YOUTUBE_URL_RE = re.compile(
    r"(?:https?://)?(?:www\.)?(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([A-Za-z0-9_-]{11})"
)


def extract_video_id(url):
    m = YOUTUBE_URL_RE.search(url or "")
    return m.group(1) if m else None


def build_ydl_opts(fmt, quality, file_id):
    """Build yt-dlp options for the requested format/quality."""
    out_tmpl = os.path.join(DOWNLOAD_FOLDER, f"{file_id}.%(ext)s")
    height = QUALITY_HEIGHTS.get(quality)
    h_filter = f"[height<={height}]" if height else ""

    common = {
        "outtmpl": out_tmpl,
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "concurrent_fragment_downloads": 5,
    }
    if HAS_FFMPEG and FFMPEG_PATH:
        common["ffmpeg_location"] = FFMPEG_PATH

    if fmt == "mp3":
        if HAS_FFMPEG:
            common.update({
                "format": "bestaudio[ext=m4a]/bestaudio/best",
                "postprocessors": [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "mp3",
                    "preferredquality": "320",
                }],
            })
        else:
            # No ffmpeg: download best audio stream as-is (m4a/webm).
            common["format"] = "bestaudio[ext=m4a]/bestaudio/best"
    else:  # mp4
        if HAS_FFMPEG:
            common["format"] = (
                f"bestvideo{h_filter}[ext=mp4]+bestaudio[ext=m4a]/"
                f"best{h_filter}[ext=mp4]/best"
            )
            common["merge_output_format"] = "mp4"
        else:
            # Single-file mp4 (contains both video+audio), no ffmpeg needed.
            # Fallback chain so we always pick an available single-file format.
            common["format"] = (
                f"best{h_filter}[ext=mp4]/best[ext=mp4]{h_filter}/"
                f"best[ext=mp4]/best{h_filter}/best"
            )

    return common


@app.route("/")
def index():
    return render_template("index.html", has_ffmpeg=HAS_FFMPEG)


@app.route("/api/info", methods=["GET"])
def api_info():
    url = request.args.get("url", "").strip()
    if not url:
        return jsonify({"error": "No URL provided"}), 400

    video_id = extract_video_id(url)
    if not video_id:
        return jsonify({"error": "Invalid YouTube URL"}), 400

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "noplaylist": True,
        "skip_download": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as e:
        return jsonify({"error": f"Failed to fetch video info: {str(e)}"}), 500

    formats = info.get("formats") or []
    # Determine which heights are actually available for mp4
    available_heights = set()
    has_audio_only = False
    for f in formats:
        h = f.get("height")
        if h and f.get("vcodec") != "none":
            available_heights.add(h)
        if f.get("vcodec") == "none" and f.get("acodec") != "none":
            has_audio_only = True

    def height_available(limit):
        if limit is None:
            return True
        return any(h <= limit for h in available_heights) or bool(available_heights)

    qualities = []
    for label, limit in [("best", None), ("1080p", 1080), ("720p", 720), ("480p", 480), ("360p", 360)]:
        if HAS_FFMPEG or height_available(limit):
            qualities.append({"label": label, "value": limit if limit else "best"})

    return jsonify({
        "video_id": video_id,
        "title": info.get("title", "YouTube Video"),
        "thumbnail": info.get("thumbnail"),
        "duration": info.get("duration"),
        "uploader": info.get("uploader"),
        "view_count": info.get("view_count"),
        "qualities": qualities,
        "has_ffmpeg": HAS_FFMPEG,
        "has_audio": has_audio_only,
    })


@app.route("/api/download", methods=["POST"])
def api_download():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()
    fmt = data.get("format", "mp4")  # mp4 or mp3
    quality = data.get("quality", "best")

    if not url:
        return jsonify({"error": "No URL provided"}), 400
    if not extract_video_id(url):
        return jsonify({"error": "Invalid YouTube URL"}), 400
    if fmt not in ("mp4", "mp3"):
        return jsonify({"error": "Invalid format"}), 400

    file_id = str(uuid.uuid4())
    ydl_opts = build_ydl_opts(fmt, quality, file_id)

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
    except Exception as e:
        return jsonify({"error": f"Download failed: {str(e)}"}), 500

    # Locate the downloaded file
    downloaded = None
    for fname in os.listdir(DOWNLOAD_FOLDER):
        if fname.startswith(file_id + "."):
            downloaded = os.path.join(DOWNLOAD_FOLDER, fname)
            break

    if not downloaded or not os.path.exists(downloaded):
        return jsonify({"error": "Download completed but file not found"}), 500

    # Determine extension + mime
    ext = os.path.splitext(downloaded)[1].lower().lstrip(".")
    mime = "audio/mpeg" if ext == "mp3" else "video/mp4"
    download_name = f"{file_id}.{ext}"

    # Read into memory, then delete the server copy immediately so nothing
    # is stored long-term (and to avoid Windows file-handle locks).
    with open(downloaded, "rb") as fh:
        file_bytes = fh.read()
    try:
        os.remove(downloaded)
    except Exception:
        pass

    return Response(
        file_bytes,
        mimetype=mime,
        headers={"Content-Disposition": f'attachment; filename="{download_name}"'},
    )


if __name__ == "__main__":
    print(f"FFmpeg available: {HAS_FFMPEG}")
    app.run(host="127.0.0.1", port=5000, debug=True)
