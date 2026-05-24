"""
InstaCart Backend — FastAPI + yt-dlp media extraction server.

Endpoints:
  GET  /api/info?url=<link>         → extract metadata + available formats
  GET  /api/download?url=<link>&format_id=<id>&title=<name>  → stream file to client
"""

import re
import logging
import os
import threading
import uuid
from typing import Optional
from urllib.parse import quote

from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import yt_dlp
import httpx

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("instacart")

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(
    title="InstaCart API",
    description="Backend API for InstaCart media downloader",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
# Allowed URL patterns (public social‑media domains only)
ALLOWED_DOMAINS = re.compile(
    r"(youtube\.com|youtu\.be|instagram\.com|facebook\.com|fb\.watch"
    r"|tiktok\.com|twitter\.com|x\.com|reddit\.com|v\.redd\.it)",
    re.IGNORECASE,
)


def _sanitise_filename(name: str) -> str:
    """Remove filesystem-unsafe characters and non-ASCII chars for a safe HTTP header."""
    # Strip characters that are unsafe in filenames
    cleaned = re.sub(r'[\\/*?:"<>|]', "", name)
    # Strip non-ASCII to guarantee Latin-1 safety for the fallback filename
    ascii_safe = cleaned.encode("ascii", errors="ignore").decode("ascii").strip()
    return ascii_safe or "download"


def _validate_url(url: str) -> None:
    if not ALLOWED_DOMAINS.search(url):
        raise HTTPException(
            status_code=400,
            detail=(
                "Unsupported platform. InstaCart only supports YouTube, "
                "Instagram, Facebook, TikTok, Twitter/X, and Reddit."
            ),
        )


# ---------------------------------------------------------------------------
# /api/info — extract metadata
# ---------------------------------------------------------------------------
@app.get("/api/info")
async def get_info(url: str = Query(..., description="Public media URL")):
    """Return title, thumbnail, duration, and available download formats."""
    _validate_url(url)

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        # Don't post‑process; we just need metadata
        "extract_flat": False,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except yt_dlp.utils.DownloadError as exc:
        logger.error("yt-dlp DownloadError: %s", exc)
        raise HTTPException(
            status_code=400,
            detail=(
                "Could not extract info. Make sure the link is from a "
                "public/professional account."
            ),
        )

    raw_formats = info.get("formats") or []
    title = info.get("title", "Untitled")
    thumbnail = info.get("thumbnail", "")
    duration = info.get("duration")  # seconds

    # ----- build video format list (has both audio + video) -----
    video_formats = []
    seen_resolutions = set()
    for f in raw_formats:
        vcodec = f.get("vcodec", "none")
        acodec = f.get("acodec", "none")
        height = f.get("height")
        fmt_id = f.get("format_id")

        # Combined streams (audio+video in one container)
        if vcodec != "none" and acodec != "none" and height and fmt_id:
            label = f.get("format_note") or f"{height}p"
            if height not in seen_resolutions:
                seen_resolutions.add(height)
                video_formats.append(
                    {
                        "format_id": fmt_id,
                        "ext": f.get("ext", "mp4"),
                        "resolution": label,
                        "height": height,
                        "filesize": f.get("filesize") or f.get("filesize_approx"),
                    }
                )

    # Sort by resolution ascending
    video_formats.sort(key=lambda x: x.get("height", 0))

    # ----- build audio format list -----
    audio_formats = []
    for f in raw_formats:
        vcodec = f.get("vcodec", "none")
        acodec = f.get("acodec", "none")
        fmt_id = f.get("format_id")
        abr = f.get("abr")

        if vcodec == "none" and acodec != "none" and fmt_id:
            label = f"{int(abr)}kbps" if abr else (f.get("format_note") or "audio")
            audio_formats.append(
                {
                    "format_id": fmt_id,
                    "ext": f.get("ext", "m4a"),
                    "quality": label,
                    "abr": abr or 0,
                    "filesize": f.get("filesize") or f.get("filesize_approx"),
                }
            )

    audio_formats.sort(key=lambda x: x.get("abr", 0))

    return {
        "title": title,
        "thumbnail": thumbnail,
        "duration": duration,
        "video_formats": video_formats,
        "audio_formats": audio_formats,
    }


# ---------------------------------------------------------------------------
# /api/download — stream media via HTTP Range-compliant proxy
# ---------------------------------------------------------------------------
@app.get("/api/download")
async def download_media(
    request: Request,
    url: str = Query(...),
    format_id: str = Query(...),
    title: Optional[str] = Query(None),
):
    """
    Stream the requested format directly to the user's browser.
    Actively supports standard HTTP Range requests, enabling the browser
    to pause, resume, and avoid restarting download from 0% on drops.
    """
    _validate_url(url)

    # Use original title for Unicode safe name, and sanitised for fallback ASCII-only name
    raw_title = title or "instacart_download"
    unicode_safe_title = re.sub(r'[\\/*?:"<>|]', "", raw_title).strip()
    fallback_title = _sanitise_filename(raw_title)

    ydl_opts = {"quiet": True, "no_warnings": True}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
    except Exception as exc:
        logger.error("Failed to extract info for download: %s", exc)
        raise HTTPException(status_code=400, detail="Failed to resolve media.")

    selected = None
    for f in info.get("formats", []):
        if f.get("format_id") == format_id:
            selected = f
            break

    if not selected:
        raise HTTPException(status_code=404, detail="Requested format not found.")

    ext = selected.get("ext", "mp4")
    direct_url = selected.get("url")

    if not direct_url:
        raise HTTPException(
            status_code=500, detail="Could not obtain direct download link."
        )

    # Capture browser's Range request header
    range_header = request.headers.get("range")

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    if range_header:
        headers["Range"] = range_header

    # Request the CDN link
    client = httpx.AsyncClient(follow_redirects=True, timeout=None)
    try:
        cdn_response = await client.send(
            client.build_request("GET", direct_url, headers=headers),
            stream=True
        )
        cdn_response.raise_for_status()
    except Exception as exc:
        await client.aclose()
        logger.error("Failed to connect to platform CDN: %s", exc)
        raise HTTPException(status_code=502, detail="Failed to stream media from platform CDN.")

    # Formulate safe headers
    filename = f"{unicode_safe_title}.{ext}"
    fallback_filename = f"{fallback_title}.{ext}"
    encoded_filename = quote(filename)
    
    # RFC 5987 Content-Disposition enables proper unicode filenames
    content_disposition = f"attachment; filename=\"{fallback_filename}\"; filename*=UTF-8''{encoded_filename}"

    response_headers = {
        "Content-Disposition": content_disposition,
        "Accept-Ranges": "bytes",
    }

    # Map headers directly from CDN response
    if cdn_response.headers.get("Content-Length"):
        response_headers["Content-Length"] = cdn_response.headers["Content-Length"]
    if cdn_response.headers.get("Content-Range"):
        response_headers["Content-Range"] = cdn_response.headers["Content-Range"]
    if cdn_response.headers.get("Content-Type"):
        response_headers["Content-Type"] = cdn_response.headers["Content-Type"]

    async def stream_generator():
        try:
            async for chunk in cdn_response.aiter_bytes(chunk_size=65536):
                yield chunk
        finally:
            await cdn_response.aclose()
            await client.aclose()

    return StreamingResponse(
        stream_generator(),
        status_code=cdn_response.status_code,
        media_type=response_headers.get("Content-Type", "application/octet-stream"),
        headers=response_headers,
    )


# ---------------------------------------------------------------------------
# Health
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "InstaCart API"}
