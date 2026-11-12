// ToolWalla Download Server — worldwide (host outside the US, e.g. Germany / Finland / Singapore)
// Node.js + Express + yt-dlp. No files stored: video is streamed straight through.
// Platforms: YouTube, Instagram, Facebook, TikTok, X/Twitter, Vimeo, Dailymotion, SoundCloud, RedNote links are rejected (no public extractor).
// Usage: npm install && npm start   (yt-dlp + ffmpeg must be on PATH)
// Endpoints:
//   GET /                          -> health
//   GET /api/info?url=...          -> { title, thumbnail, duration, formats: [{quality, ext, size}] }
//   GET /api/download?url=...&quality=1080|720|480|360&format=mp4|mp3 -> file download (streamed)

const express = require('express');
const { spawn } = require('child_process');
const { URL } = require('url');

// yt-dlp via `python3 -m yt_dlp` — works whether the binary is on PATH or only
// installed as a Python package (pip). In Docker both work.
function spawnYtDlp(args, opts) {
  return spawn('python3', ['-m', 'yt_dlp', ...args], opts);
}

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_URL_LEN = 2048;

// CORS: ToolWalla (any origin) may call this server from any country.
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const ALLOWED_HOSTS = [
  'youtube.com', 'www.youtube.com', 'youtu.be', 'music.youtube.com',
  'instagram.com', 'www.instagram.com',
  'facebook.com', 'www.facebook.com', 'fb.watch', 'www.fb.watch',
  'tiktok.com', 'www.tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com',
  'x.com', 'www.x.com', 'twitter.com', 'www.twitter.com',
  'vimeo.com', 'www.vimeo.com',
  'dailymotion.com', 'www.dailymotion.com', 'dai.ly',
  'soundcloud.com', 'www.soundcloud.com',
  'reddit.com', 'www.reddit.com', 'old.reddit.com',
  'pinterest.com', 'www.pinterest.com',
  'snapchat.com', 'www.snapchat.com',
];

function validateUrl(raw) {
  if (!raw || typeof raw !== 'string' || raw.length > MAX_URL_LEN) return null;
  let u;
  try { u = new URL(raw.trim()); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  const host = u.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.includes(host) && !ALLOWED_HOSTS.some(h => host.endsWith('.' + h))) return null;
  return u.toString();
}

// Simple in-memory rate limit: 30 requests / 10 min per IP (prevents abuse).
const hits = new Map();
app.use((req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter(t => now - t < 10 * 60 * 1000);
  arr.push(now);
  hits.set(ip, arr);
  if (arr.length > 30) return res.status(429).json({ error: 'Too many requests, try again in a few minutes.' });
  next();
});

app.get('/', (req, res) => res.json({ ok: true, service: 'ToolWalla Download Server', platforms: ALLOWED_HOSTS }));

app.get('/api/info', (req, res) => {
  const url = validateUrl(req.query.url);
  if (!url) return res.status(400).json({ error: 'Invalid or unsupported link. Paste a public YouTube / Instagram / Facebook / TikTok / X / Vimeo / Dailymotion / SoundCloud link.' });
  const args = ['-J', '--no-playlist', '--no-warnings', '--user-agent', 'Mozilla/5.0', url];
  const p = spawnYtDlp(args, { timeout: 45000 });
  let out = '', err = '', done = false;
  p.stdout.on('data', d => { out += d; if (out.length > 2_000_000) p.kill(); });
  p.stderr.on('data', d => { err += d; });
  p.on('error', () => { if (!done) { done = true; res.status(500).json({ error: 'yt-dlp is not installed on this server.' }); } });
  p.on('close', code => {
    if (done) return; done = true;
    if (code !== 0) return res.status(502).json({ error: 'Could not read this link. The post may be private, deleted, or blocked for anonymous visitors.', detail: err.slice(0, 300) });
    try {
      const j = JSON.parse(out);
      const seen = new Map();
      (j.formats || []).forEach(f => {
        if (!f.height || f.vcodec === 'none') return;
        const q = f.height >= 1080 ? '1080' : f.height >= 720 ? '720' : f.height >= 480 ? '480' : '360';
        if (!seen.has(q)) seen.set(q, { quality: q + 'p', ext: 'mp4', height: f.height });
      });
      const formats = [...seen.values()].sort((a, b) => b.height - a.height);
      if (!formats.length) formats.push({ quality: '360p', ext: 'mp4', height: 360 });
      res.json({ title: j.title || 'Video', uploader: j.uploader || j.channel || '', duration: j.duration || 0, thumbnail: j.thumbnail || '', formats });
    } catch { res.status(502).json({ error: 'Could not parse video info.' }); }
  });
});

app.get('/api/download', (req, res) => {
  const url = validateUrl(req.query.url);
  if (!url) return res.status(400).json({ error: 'Invalid or unsupported link.' });
  const quality = ['1080', '720', '480', '360'].includes(String(req.query.quality)) ? String(req.query.quality) : '720';
  const format = req.query.format === 'mp3' ? 'mp3' : 'mp4';
  const filename = `toolwalla-${quality}p.${format}`.replace(/[^a-z0-9.\-]/gi, '_');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', format === 'mp3' ? 'audio/mpeg' : 'video/mp4');

  let args;
  if (format === 'mp3') {
    args = ['-x', '--audio-format', 'mp3', '--audio-quality', '0', '-o', '-', '--no-playlist', '--no-warnings', '--user-agent', 'Mozilla/5.0', url];
  } else {
    const sel = `bestvideo[height<=${quality}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=${quality}]+bestaudio/best[height<=${quality}]`;
    args = ['-f', sel, '--remux-video', 'mp4', '-o', '-', '--no-playlist', '--no-warnings', '--user-agent', 'Mozilla/5.0', url];
  }
  const p = spawnYtDlp(args, { timeout: 120000 });
  p.stdout.pipe(res);
  let err = '';
  p.stderr.on('data', d => { err += d; });
  p.on('error', () => { if (!res.headersSent) { try { res.status(500).json({ error: 'yt-dlp is not installed on this server.' }); } catch {} } });
  p.on('close', code => {
    if (code !== 0 && !res.writableEnded && res.headersSent) {
      try { res.end(); } catch {}
    }
  });
});

app.listen(PORT, () => console.log(`ToolWalla Download Server listening on :${PORT}`));
