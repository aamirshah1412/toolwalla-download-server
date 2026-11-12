# ToolWalla Download Server — worldwide

This is the server that makes ToolWalla's downloaders **really download** the video file
(MP4 1080 / 720 / 480 / 360 + MP3), for YouTube, Instagram, Facebook, TikTok, X/Twitter,
Vimeo, Dailymotion, SoundCloud, Reddit, Pinterest and Snapchat links.

The ToolWalla website itself is only a static file — it cannot fetch video files.
This server does the fetching (with yt-dlp) and streams the file straight to the visitor.
Nothing is stored on the server.

## Why this is worldwide, not US-only

SaveFrom stopped its US service in 2020 because of US copyright holders.
Host this server **outside the US** — e.g. Germany, Finland or Singapore —
and it serves Pakistan and the whole world. Suggested hosts (all have a free or
cheap tier and let you pick the region):

- **Render** — pick region Frankfurt (Germany) or Singapore. Free tier works for testing.
- **Railway** — pick region Europe. Deploy from this folder with one click.
- **Hetzner / Contabo VPS** — Germany / Finland, ~€4–6/month, full control.

## Deploy in 5 minutes (Render, free)

1. Push this folder to a GitHub repo.
2. On render.com → New → Web Service → pick the repo.
3. Runtime: **Docker**. Region: **Frankfurt** (or Singapore).
4. Deploy. You get a URL like `https://toolwalla-dl.onrender.com`.
5. In ToolWalla, set the server URL (see below). Done — no code change needed later.

## Run locally (test)

```bash
npm install
npm start
# open http://localhost:3000/
# test: http://localhost:3000/api/info?url=https://www.youtube.com/watch?v=jNQXAC9IVRw
```

Requires `yt-dlp` and `ffmpeg` on PATH (`pip install yt-dlp`).

## Connect ToolWalla to it

In the ToolWalla site code there is one setting:

```js
const DOWNLOAD_SERVER = "https://YOUR-SERVER-URL";
```

Set it to your deployed URL (no trailing slash). Every downloader then:

1. Pastes link → calls `GET /api/info?url=…` → shows the real title, thumbnail and
   available formats (1080 / 720 / 480 / 360 / MP3).
2. Clicking a format calls `GET /api/download?url=…&quality=720&format=mp4`
   → the real file downloads to the visitor's phone/computer.

If the server setting is empty, ToolWalla falls back to the old honest behaviour
(preview + the platform's own save steps), so the site never breaks.

## Honest warning about AdSense

Ads showing on another downloader site do **not** prove Google AdSense approved it —
many such sites use other ad networks. Google's own policy treats sites whose
main purpose is downloading copyrighted videos from other platforms as a risk for
AdSense approval. A real downloader may earn from other ad networks, but AdSense
approval is **not guaranteed** with it on the site. Keep the AdSense application
to the tools/blog pages, or accept that risk before applying.

## Limits

- Only **public** posts work. Private, deleted, age- or region-restricted posts fail.
- Instagram stories and private reels need a logged-in session — this server does
  not log in, by design.
- YouTube sometimes rate-limits anonymous downloads (HTTP 429). If that happens,
  wait and retry; a server with its own IP in the chosen region usually recovers.
- Rate limit built in: 30 requests / 10 min per visitor IP.
