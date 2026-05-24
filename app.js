/**
 * InstaCart — Frontend Application Logic
 *
 * Connects to the FastAPI backend to:
 *   1. Fetch media metadata (/api/info)
 *   2. Stream downloads to the user's browser (/api/download)
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const API_BASE = "http://127.0.0.1:8000";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentFormat = "mp4";       // "mp4" | "mp3"
let mediaInfo = null;            // response from /api/info
let selectedFormatId = null;     // the format_id the user picked

// ---------------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------------
const $urlInput      = document.getElementById("url-input");
const $btnFetch      = document.getElementById("btn-fetch");
const $statusMsg     = document.getElementById("status-msg");
const $resultCard    = document.getElementById("result-card");
const $thumbImg      = document.getElementById("thumb-img");
const $resultTitle   = document.getElementById("result-title");
const $resultDuration= document.getElementById("result-duration");
const $resultSource  = document.getElementById("result-source");
const $qualityChips  = document.getElementById("quality-chips");
const $qualitySection= document.getElementById("quality-section");
const $progressRow   = document.getElementById("progress-row");
const $progressFill  = document.getElementById("progress-fill");
const $progressPct   = document.getElementById("progress-pct");
const $progressLabel = document.getElementById("progress-label");
const $btnFinalize   = document.getElementById("btn-finalize");

// ---------------------------------------------------------------------------
// Format toggle
// ---------------------------------------------------------------------------
function setFormat(btn) {
    document.querySelectorAll(".format-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentFormat = btn.dataset.format;

    // If we already have results, re-render the quality chips for the new format
    if (mediaInfo) {
        renderQualityChips();
    }
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------
function showStatus(text, type = "loading") {
    $statusMsg.textContent = text;
    $statusMsg.className = `status-msg visible ${type}`;
}

function hideStatus() {
    $statusMsg.className = "status-msg";
}

// ---------------------------------------------------------------------------
// Fetch media info
// ---------------------------------------------------------------------------
async function fetchMediaInfo() {
    const url = $urlInput.value.trim();
    if (!url) {
        showStatus("Please paste a valid link first.", "error");
        return;
    }

    // Reset UI
    $resultCard.classList.remove("visible");
    $progressRow.classList.remove("visible");
    selectedFormatId = null;
    mediaInfo = null;

    // Disable button
    $btnFetch.disabled = true;
    $btnFetch.innerHTML = '<span class="spinner"></span> Fetching…';

    showStatus("Connecting to server and extracting media info…", "loading");

    try {
        const res = await fetch(`${API_BASE}/api/info?url=${encodeURIComponent(url)}`);
        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.detail || "Server error");
        }

        mediaInfo = data;
        renderResults();
        hideStatus();
        showStatus("Media found! Select your quality and hit Download.", "success");

    } catch (err) {
        showStatus(err.message || "Failed to fetch media. Check your URL.", "error");
        $resultCard.classList.remove("visible");
    } finally {
        $btnFetch.disabled = false;
        $btnFetch.innerHTML =
            '<span class="material-symbols-outlined" style="font-size:20px;">download</span> Download';
    }
}

// ---------------------------------------------------------------------------
// Render results
// ---------------------------------------------------------------------------
function renderResults() {
    if (!mediaInfo) return;

    // Thumbnail
    if (mediaInfo.thumbnail) {
        $thumbImg.src = mediaInfo.thumbnail;
        $thumbImg.alt = mediaInfo.title || "Thumbnail";
    } else {
        $thumbImg.src = "";
    }

    // Title
    $resultTitle.textContent = mediaInfo.title || "Untitled";

    // Duration
    if (mediaInfo.duration) {
        const mins = Math.floor(mediaInfo.duration / 60);
        const secs = String(Math.floor(mediaInfo.duration % 60)).padStart(2, "0");
        $resultDuration.textContent = `${mins}:${secs}`;
        $resultDuration.style.display = "inline-block";
    } else {
        $resultDuration.style.display = "none";
    }

    // Source
    try {
        const hostname = new URL($urlInput.value.trim()).hostname;
        $resultSource.textContent = `Source: ${hostname}`;
    } catch {
        $resultSource.textContent = "";
    }

    // Quality chips
    renderQualityChips();

    // Show card
    $resultCard.classList.add("visible");
}

// ---------------------------------------------------------------------------
// Render quality chips (depends on currentFormat)
// ---------------------------------------------------------------------------
function renderQualityChips() {
    $qualityChips.innerHTML = "";
    selectedFormatId = null;

    let formats = [];
    if (currentFormat === "mp4") {
        formats = mediaInfo.video_formats || [];
        $qualitySection.querySelector("h4").textContent = "Select Quality";
    } else {
        formats = mediaInfo.audio_formats || [];
        $qualitySection.querySelector("h4").textContent = "Select Audio Quality";
    }

    if (formats.length === 0) {
        $qualityChips.innerHTML =
            '<span style="font-size:12px;color:var(--on-surface-variant);">No separate formats found — a default will be used.</span>';
        // If there are no separate formats, we can still try a "best" download
        return;
    }

    formats.forEach((fmt, i) => {
        const chip = document.createElement("button");
        chip.className = "quality-chip";
        chip.textContent = currentFormat === "mp4"
            ? fmt.resolution
            : fmt.quality;

        if (fmt.filesize) {
            const mb = (fmt.filesize / (1024 * 1024)).toFixed(1);
            chip.textContent += ` (${mb} MB)`;
        }

        chip.dataset.formatId = fmt.format_id;

        chip.addEventListener("click", () => {
            document.querySelectorAll(".quality-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            selectedFormatId = fmt.format_id;
        });

        // Auto-select the last (highest quality)
        if (i === formats.length - 1) {
            chip.classList.add("active");
            selectedFormatId = fmt.format_id;
        }

        $qualityChips.appendChild(chip);
    });
}

async function startDownload() {
    if (!mediaInfo) {
        showStatus("Fetch media info first!", "error");
        return;
    }

    if (!selectedFormatId) {
        showStatus("Please select a quality option.", "error");
        return;
    }

    const url = $urlInput.value.trim();
    const title = encodeURIComponent(mediaInfo.title || "instacart_download");
    const downloadUrl =
        `${API_BASE}/api/download?url=${encodeURIComponent(url)}&format_id=${selectedFormatId}&title=${title}`;

    // Disable button briefly to prevent accidental double clicks
    $btnFinalize.disabled = true;
    $btnFinalize.innerHTML = '<span class="spinner"></span> Streaming...';

    // Show progress bar
    $progressRow.classList.add("visible");
    $progressLabel.textContent = "Connecting to CDN stream…";
    $progressPct.textContent = "0%";
    $progressFill.style.width = "0%";

    // Animate progress smoothly
    let pct = 0;
    const progressInterval = setInterval(() => {
        if (pct < 98) {
            pct += Math.random() * 8;
            if (pct > 98) pct = 98;
        }
        $progressFill.style.width = `${Math.floor(pct)}%`;
        $progressPct.textContent = `${Math.floor(pct)}%`;
        $progressLabel.textContent = "Streaming media to browser downloads…";
    }, 300);

    // Trigger the browser's native download
    try {
        const link = document.createElement("a");
        link.href = downloadUrl;
        link.download = ""; // Trust the server's Content-Disposition header
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showStatus("Download started! Check your browser's download manager/bar.", "success");

        // Complete the progress animation after 4 seconds
        setTimeout(() => {
            clearInterval(progressInterval);
            $progressFill.style.width = "100%";
            $progressPct.textContent = "100%";
            $progressLabel.textContent = "Download initialized successfully!";
            $btnFinalize.disabled = false;
            $btnFinalize.innerHTML = '<span class="material-symbols-outlined" style="font-size:20px;">cloud_download</span> Download File';
        }, 4000);

    } catch (err) {
        clearInterval(progressInterval);
        showStatus("Failed to trigger browser download. Try again.", "error");
        $progressLabel.textContent = "Error";
        $btnFinalize.disabled = false;
        $btnFinalize.innerHTML = '<span class="material-symbols-outlined" style="font-size:20px;">cloud_download</span> Download File';
    }
}

// ---------------------------------------------------------------------------
// Enter key support
// ---------------------------------------------------------------------------
$urlInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
        fetchMediaInfo();
    }
});
