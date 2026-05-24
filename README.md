# 🛒 InstaCart - Free Media Downloader

InstaCart is a lightning-fast, highly optimized media downloader web application. Download videos and audio from popular platforms like YouTube, Instagram, Facebook, TikTok, and more directly into your browser at maximum speed.

Built with a modern web frontend and a robust Python FastAPI backend, InstaCart utilizes HTTP Range Requests to efficiently proxy streams native to the browser's download manager, avoiding file corruption and high server disk usage.

---

## ✨ Features

- **🚀 Direct Browser Streaming:** Uses HTTP Range compliance to stream files directly from CDNs into your browser's native download manager.
- **⚡ High-Speed Downloads:** Downloads don't bottleneck on the server's disk storage and can be paused/resumed dynamically.
- **🎨 Interactive UI:** Sleek, modern, responsive frontend with beautiful aesthetics, dynamic components, and a smooth UX.
- **🌐 Cross-Platform Support:** Supports public content from YouTube, Instagram, TikTok, Facebook, etc. (powered by `yt-dlp`).
- **🎧 Multiple Formats:** Choose between various video resolutions (4K, 1080p, 720p) and audio formats.
- **🛡️ Privacy First:** No user data or downloaded files are stored on the server.

---

## 📸 Interactive UI Highlights

<details>
<summary><b>Click to expand and view the UI features</b></summary>

### 1. The Dashboard
The sleek homepage where you paste your media URL. It features dark mode support, subtle glassmorphism effects, and dynamic gradients.

### 2. Format Selection
Upon fetching a link, the UI dynamically extracts and displays available formats (Video / Audio) in a clean table. Select the format that suits your needs.

### 3. Native Download Manager Hook
When you hit download, the frontend smoothly triggers your browser's native download overlay, allowing you to track progress directly from your browser!

</details>

---

## 🛠️ Tech Stack

### Frontend
- **HTML5 & CSS3:** Custom styling with CSS variables and modern layout techniques.
- **Vanilla JavaScript:** Fast, dependency-free interactive logic (`app.js`).

### Backend
- **Python 3.9+**
- **[FastAPI](https://fastapi.tiangolo.com/):** High-performance backend framework.
- **[yt-dlp](https://github.com/yt-dlp/yt-dlp):** For extracting media metadata and stream URLs.
- **[HTTPX](https://www.python-httpx.org/):** For asynchronous streaming proxy requests.
- **[Uvicorn](https://www.uvicorn.org/):** ASGI server for running the FastAPI application.

---

## 🚀 Getting Started

Follow these instructions to get a copy of the project up and running on your local machine.

### Prerequisites

- Python 3.9 or higher
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/InstaCart.git
   cd InstaCart
   ```

2. **Setup the Backend**
   Navigate to the backend directory and install the required dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```

3. **Start the Backend Server**
   Run the FastAPI server using Uvicorn:
   ```bash
   python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
   ```
   *The backend will be available at `http://127.0.0.1:8000`.*

4. **Launch the Frontend**
   You can serve the frontend files using any static server, or simply open the `index.html` file in your browser:
   ```bash
   cd ../frontend
   # Optional: run a local server
   python -m http.server 3000
   ```
   *Open your browser and navigate to `http://localhost:3000` (or double click `index.html`).*

---

## 💡 How It Works Under the Hood

Unlike traditional media downloaders that download files entirely to the server before sending them to the client (which is slow, disk-heavy, and prone to timeouts), **InstaCart acts as an asynchronous streaming proxy.**

1. The frontend sends a media URL to the backend.
2. The backend uses `yt-dlp` in memory-only mode to extract direct CDN stream URLs.
3. The frontend triggers a download via the backend proxy endpoint (`/api/download`).
4. The backend establishes an asynchronous HTTP connection to the media CDN and pipes the binary stream directly back to the client.
5. Critical headers like `Accept-Ranges`, `Content-Length`, and `Content-Disposition` are preserved, ensuring the browser treats it as a native, resumable download.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
