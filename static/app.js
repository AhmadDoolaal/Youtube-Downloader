/* ========================================
   YTDownload — Frontend Logic
   ======================================== */
(() => {
    const els = {
        urlInput: document.getElementById("videoUrl"),
        pasteBtn: document.getElementById("pasteBtn"),
        fetchBtn: document.getElementById("fetchBtn"),
        changeBtn: document.getElementById("changeBtn"),
        videoPreview: document.getElementById("videoPreview"),
        selectorSection: document.getElementById("selectorSection"),
        downloadZone: document.getElementById("downloadZone"),
        progressOverlay: document.getElementById("progressOverlay"),
        previewThumb: document.getElementById("previewThumb"),
        previewTitle: document.getElementById("previewTitle"),
        previewChannel: document.getElementById("previewChannel"),
        previewDuration: document.getElementById("previewDuration"),
        previewMeta: document.getElementById("previewMeta"),
        downloadBtn: document.getElementById("downloadBtn"),
        qualityPills: document.getElementById("qualityPills"),
        qualityHint: document.getElementById("qualityHint"),
        qualityLabel: document.getElementById("reqStar"),
        fmtBtns: document.querySelectorAll(".fmt-btn"),
        recentSection: document.getElementById("recentSection"),
        recentList: document.getElementById("recentList"),
        clearRecent: document.getElementById("clearRecent"),
        navStatus: document.getElementById("navStatus"),
        ffmpegText: document.getElementById("ffmpegText"),
        ffmpegNote: document.getElementById("ffmpegNote"),

        // Progress
        progressTitle: document.getElementById("progressTitle"),
        progressFmt: document.getElementById("progressFmt"),
        ringFg: document.getElementById("ringFg"),
        ringPercent: document.getElementById("ringPercent"),
        detailStatus: document.getElementById("detailStatus"),
        detailSpeed: document.getElementById("detailSpeed"),
        detailEta: document.getElementById("detailEta"),
        cancelBtn: document.getElementById("cancelBtn"),
        downloadAgainBtn: document.getElementById("downloadAgainBtn"),
        openFolderBtn: document.getElementById("openFolderBtn"),
    };

    let state = {
        url: "",
        videoId: "",
        format: "mp4",
        quality: "best",
        title: "",
        thumbnail: "",
        duration: 0,
        hasFfmpeg: null,
        lastFileId: null,
        xhr: null,
    };

    // ---------- Init ----------
    async function init() {
        try {
            const res = await fetch("/api/info?url=" + encodeURIComponent("https://www.youtube.com/watch?v=dQw4w9WgXcQ"));
            const data = await res.json();
            state.hasFfmpeg = data.has_ffmpeg;
        } catch (e) {
            // ignore
        }
        updateFFmpegUI();

        // Load recent downloads from sessionStorage
        renderRecent();

        // URL input validation on change
        els.urlInput.addEventListener("input", debounce(onUrlInput, 400));
        els.urlInput.addEventListener("blur", () => validateUrl(els.urlInput.value.trim()));
    }

    function updateFFmpegUI() {
        const ok = state.hasFfmpeg === true;
        const dot = els.navStatus.querySelector(".dot");
        if (ok) {
            dot.classList.add("ok");
            els.ffmpegText.textContent = "FFmpeg ready — MP3 + up to 1080p MP4 supported";
        } else {
            dot.classList.remove("ok");
            els.ffmpegText.textContent = "FFmpeg missing — MP4 (single-file) & audio-only downloads only";
        }
        els.ffmpegNote.textContent = ok ? "" : "• FFmpeg not detected on server: MP3 conversion and merged 1080p MP4 require FFmpeg.";
    }

    // ---------- URL handling ----------
    function onUrlInput() {
        const val = els.urlInput.value.trim();
        if (!val) {
            els.urlInput.classList.remove("valid", "invalid");
            resetPreview();
            return;
        }
        validateUrl(val);
    }

    function validateUrl(val) {
        const id = extractVideoId(val);
        els.urlInput.classList.remove("valid", "invalid");
        if (!id) {
            els.urlInput.classList.add("invalid");
            return;
        }
        els.urlInput.classList.add("valid");
        state.url = val;
        state.videoId = id;
        fetchVideoInfo(val);
    }

    function extractVideoId(url) {
        const m = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([A-Za-z0-9_-]{11})/.exec(url);
        return m ? m[1] : null;
    }

    async function fetchVideoInfo(url) {
        setUILoading(true);
        try {
            const res = await fetch("/api/info?url=" + encodeURIComponent(url));
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            state.title = data.title;
            state.thumbnail = data.thumbnail;
            state.duration = data.duration || 0;

            // Preview
            els.previewThumb.src = data.thumbnail || "";
            els.previewTitle.textContent = data.title;
            els.previewChannel.textContent = data.uploader || "YouTube";
            const dur = formatDuration(data.duration || 0);
            els.previewDuration.textContent = dur;
            els.previewMeta.textContent = (data.view_count ? (data.view_count / 1000).toFixed(1) + "K views" : "0 views") + " • " + dur;

            // Qualities
            renderQualities(data.qualities || []);

            // Show sections
            els.videoPreview.style.display = "grid";
            els.selectorSection.style.display = "block";
            els.downloadZone.style.display = "block";
            els.recentSection.style.display = "block";

            // Enable download only if we have at least one quality
            updateDownloadBtn();
        } catch (err) {
            showToast("Error: " + err.message, "error");
        } finally {
            setUILoading(false);
        }
    }

    function renderQualities(qualities) {
        els.qualityPills.innerHTML = "";
        let defaultSelected = null;
        qualities.forEach(q => {
            const pill = document.createElement("button");
            pill.type = "button";
            pill.className = "quality-pill";
            pill.textContent = q.label === "best" ? "Best Available" : q.label;
            pill.dataset.value = q.value;
            pill.addEventListener("click", () => {
                document.querySelectorAll(".quality-pill").forEach(p => p.classList.remove("active"));
                pill.classList.add("active");
                state.quality = q.value;
                updateDownloadBtn();
            });
            els.qualityPills.appendChild(pill);
            if (q.label === "best") defaultSelected = pill;
        });
        if (defaultSelected) {
            defaultSelected.classList.add("active");
            state.quality = defaultSelected.dataset.value;
        }
        els.qualityHint.textContent = qualities.length
            ? "Pick the resolution. Higher quality = larger file."
            : "No suitable qualities detected.";
    }

    // ---------- Format toggle ----------
    els.fmtBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            els.fmtBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            state.format = btn.dataset.fmt;
            updateDownloadBtn();
        });
    });

    function updateDownloadBtn() {
        const hasQuality = state.quality != null;
        els.downloadBtn.disabled = !hasQuality;
        const fmt = state.format;
        const q = state.quality;
        els.downloadBtn.querySelector(".btn-label").textContent =
            hasQuality ? `Download ${fmt.toUpperCase()} ${q === "best" ? "" : q + "p"}` : "Pick quality first";
        els.qualityHint.textContent = hasQuality
            ? "Ready to download. Tap below to start."
            : "Select a quality to enable download.";
    }

    // ---------- Download ----------
    els.downloadBtn.addEventListener("click", async () => {
        if (!state.url || els.downloadBtn.disabled) return;

        // Hide download zone, show progress overlay (overlay covers the rest)
        els.downloadZone.style.display = "none";
        els.progressOverlay.style.display = "flex";

        // Start download via fetch (streaming). We'll poll because we can't easily stream progress over fetch file download.
        // Strategy: POST to /api/download returns file. To show progress we use yt-dlp progress via a separate socket-less approach:
        // We'll simply start the download and poll a lightweight status, but since Flask sends file on completion,
        // we show a simulated progress tied to request, then trigger download when response arrives.
        startDownload();
    });

    async function startDownload() {
        const payload = {
            url: state.url,
            format: state.format,
            quality: state.quality,
        };

        try {
            // Show initial progress
            setProgress(0, "Preparing...", "--", "--");

            // We cannot get real-time progress through a normal file-download response easily.
            // Instead, POST to a tiny "start" endpoint would be ideal, but to keep one endpoint,
            // we fire the download and animate progress toward completion while waiting.
            const start = Date.now();
            let animated = 0;
            const animate = setInterval(() => {
                const elapsed = Date.now() - start;
                animated = Math.min(animated + Math.random() * 12, 88);
                setProgress(animated, "Downloading from YouTube...", "--", "--");
            }, 300);

            const res = await fetch("/api/download", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            clearInterval(animate);
            setProgress(100, "Download complete!", "--", "--");

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || `HTTP ${res.status}`);
            }

            const blob = await res.blob();
            const filename = res.headers.get("content-disposition")?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
            const name = filename ? filename[1].replace(/['"]/g, "") : `download.${state.format === "mp3" ? "mp3" : "mp4"}`;
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Track recent
            addRecent({
                name,
                title: state.title,
                thumbnail: state.thumbnail,
                format: state.format,
                quality: state.quality,
                time: new Date().toISOString(),
            });
            renderRecent();

            // Show success actions
            setProgress(100, "Saved to downloads", "--", "--");
            els.downloadAgainBtn.style.display = "block";
            els.openFolderBtn.style.display = "none"; // client can't open server folder
            showToast("Download complete ✔", "success");
        } catch (err) {
            showToast("Download failed: " + err.message, "error");
            setProgress(0, "Download failed", "--", "--");
        }
    }

    els.cancelBtn.addEventListener("click", () => {
        resetProgressUI();
    });

    els.downloadAgainBtn.addEventListener("click", () => {
        resetProgressUI();
        if (!state.url) return;
        // Re-run download with same settings
        startDownload();
    });

    // ---------- Progress UI ----------
    function setProgress(pct, status, speed, eta) {
        const offset = 327 - (pct / 100) * 327;
        els.ringFg.style.strokeDashoffset = Math.max(0, offset);
        els.ringPercent.textContent = Math.round(pct) + "%";
        els.detailStatus.textContent = status;
        if (speed !== "--") els.detailSpeed.textContent = speed;
        if (eta !== "--") els.detailEta.textContent = eta;
    }

    function resetProgressUI() {
        els.progressOverlay.style.display = "none";
        els.downloadZone.style.display = "block";
        els.downloadAgainBtn.style.display = "none";
        els.openFolderBtn.style.display = "none";
        setProgress(0, "Preparing download...", "--", "--");
    }

    // ---------- Recent Downloads ----------
    function addRecent(item) {
        let recent = JSON.parse(sessionStorage.getItem("yt_downloads") || "[]");
        recent.unshift(item);
        recent = recent.slice(0, 8);
        sessionStorage.setItem("yt_downloads", JSON.stringify(recent));
    }

    function renderRecent() {
        let recent = [];
        try { recent = JSON.parse(sessionStorage.getItem("yt_downloads") || "[]"); } catch (e) {}
        els.recentList.innerHTML = "";
        recent.forEach((item, idx) => {
            const li = document.createElement("li");
            li.className = "recent-item";
            li.innerHTML = `
                <div class="thumb"><img src="${item.thumbnail || ''}" alt="thumb" onerror="this.style.display='none';this.parentElement.style.background='#0b1021'"></div>
                <div class="info">
                    <div class="name">${escapeHtml(item.title || item.name)}</div>
                    <div class="meta">${item.format.toUpperCase()} ${item.quality === "best" ? "" : item.quality}p • ${formatTimeAgo(item.time)}</div>
                </div>
                <div class="badge">${item.format.toUpperCase()}</div>
                <div class="actions">
                    <button class="dl-again" data-idx="${idx}">Download Again</button>
                </div>
            `;
            li.querySelector(".dl-again").addEventListener("click", () => {
                const r = recent[idx];
                state.url = `https://www.youtube.com/watch?v=${extractVideoIdFromRecent(r.title)}`;
                // We don't store URL in recent to keep it simple; instead refetch from title isn't possible.
                showToast("Paste the link again to re-download", "warning");
            });
            els.recentList.appendChild(li);
        });
    }

    function extractVideoIdFromRecent() { return ""; } // placeholder

    function clearRecentList() {
        sessionStorage.removeItem("yt_downloads");
        renderRecent();
    }
    els.clearRecent.addEventListener("click", clearRecentList);

    // ---------- Paste ----------
    els.pasteBtn.addEventListener("click", async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                els.urlInput.value = text;
                validateUrl(text);
            }
        } catch (e) {
            showToast("Could not access clipboard", "warning");
        }
    });

    els.changeBtn.addEventListener("click", () => {
        resetPreview();
        els.urlInput.focus();
    });

    function resetPreview() {
        els.videoPreview.style.display = "none";
        els.selectorSection.style.display = "none";
        els.downloadZone.style.display = "none";
        els.urlInput.classList.remove("valid", "invalid");
        state.url = "";
        state.videoId = "";
        state.title = "";
        state.thumbnail = "";
        state.duration = 0;
    }

    // ---------- Helpers ----------
    function setUILoading(loading) {
        els.fetchBtn.disabled = loading;
        els.fetchBtn.textContent = loading ? "Fetching..." : "Get Info";
    }

    function formatDuration(sec) {
        if (!sec) return "0:00";
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2,'0')}` : `${m}:${String(s).padStart(2,'0')}`;
    }

    function formatTimeAgo(iso) {
        if (!iso) return "";
        const d = new Date(iso);
        const now = new Date();
        const secs = Math.floor((now - d) / 1000);
        if (secs < 60) return "just now";
        const mins = Math.floor(secs / 60);
        if (mins < 60) return mins + "m ago";
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return hrs + "h ago";
        return Math.floor(hrs / 24) + "d ago";
    }

    function escapeHtml(t) {
        const d = document.createElement("div");
        d.textContent = t || "";
        return d.innerHTML;
    }

    function showToast(msg, type = "info") {
        // remove existing
        const old = document.querySelector(".toast");
        if (old) old.remove();
        const t = document.createElement("div");
        t.className = `toast ${type}`;
        t.innerHTML = `<div class="dot" style="width:7px;height:7px;border-radius:50%;background:${type==="success"?"var(--success)":type==="error"?"#f87171":"var(--accent)"}"></div><span>${escapeHtml(msg)}</span>`;
        document.body.appendChild(t);
        requestAnimationFrame(() => t.classList.add("show"));
        setTimeout(() => {
            t.classList.remove("show");
            setTimeout(() => t.remove(), 400);
        }, 3000);
    }

    // Expose for inline handlers if needed
    window.YTDL = { state };

    init();
})();
