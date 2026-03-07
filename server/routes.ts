import type { Express } from "express";
import type { Server } from "http";
import { api } from "@shared/routes";
import { z } from "zod";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import path from "path";
import os from "os";
import fs from "fs";
import https from "https";
import http from "http";

const execFileAsync = promisify(execFile);

// Simple in-memory job queue for downloads
const jobs = new Map<string, { status: "processing" | "completed" | "error", filePath?: string, fileName?: string, error?: string }>();

// Platform Detection

export type Platform = "youtube" | "youtube_music" | "instagram" | "twitter" | "pinterest" | "tiktok" | "reddit" | "tumblr" | "flickr" | "spotify" | "soundcloud" | "bandcamp" | "apple_music" | "generic";

export function detectPlatform(url: string): Platform {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace("www.", "");

    // Audio-first platforms (check before generic youtube)
    if (hostname.includes("music.apple.com")) return "apple_music";
    if (hostname.includes("open.spotify.com") || hostname.includes("spotify.com")) return "spotify";
    if (hostname.includes("soundcloud.com")) return "soundcloud";
    if (hostname.includes("bandcamp.com")) return "bandcamp";
    if (hostname.includes("music.youtube.com")) return "youtube_music";

    // Video/image platforms
    if (hostname.includes("youtube.com") || hostname.includes("youtu.be")) return "youtube";
    if (hostname.includes("instagram.com")) return "instagram";
    if (hostname.includes("twitter.com") || hostname.includes("x.com")) return "twitter";
    if (hostname.includes("pinterest.com") || hostname.includes("pin.it")) return "pinterest";
    if (hostname.includes("tiktok.com")) return "tiktok";
    if (hostname.includes("reddit.com") || hostname.includes("redd.it")) return "reddit";
    if (hostname.includes("tumblr.com")) return "tumblr";
    if (hostname.includes("flickr.com") || hostname.includes("flic.kr")) return "flickr";

    return "generic";
  } catch {
    return "generic";
  }
}

// Platforms where gallery-dl is the PRIMARY tool (image-first sites)
const GALLERY_DL_PRIMARY: Platform[] = ["pinterest", "tumblr", "flickr", "reddit"];

// Platforms where we try yt-dlp first, then fall back to gallery-dl
const MIXED_PLATFORMS: Platform[] = ["instagram", "twitter"];

// Platforms where yt-dlp is always used (video-only)
const YTDLP_ONLY: Platform[] = ["youtube", "tiktok"];

// Audio-first platforms
export const AUDIO_PLATFORMS: Platform[] = ["spotify", "soundcloud", "bandcamp", "youtube_music", "apple_music"];

// YouTube Playlist Detection
export function isYouTubePlaylist(url: string): boolean {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase().replace("www.", "");
    if (!hostname.includes("youtube.com") && !hostname.includes("youtu.be")) return false;
    // /playlist?list=... is always a playlist
    if (urlObj.pathname.startsWith("/playlist")) return true;
    // /watch?v=...&list=... is a video within a playlist — treat as playlist
    if (urlObj.searchParams.has("list")) return true;
    return false;
  } catch {
    return false;
  }
}

// Static audio output format options (capped at 320kbps)
const AUDIO_OUTPUT_FORMATS = [
  { format_id: "mp3", label: "MP3 320kbps", ext: "mp3", quality: "320kbps" },
  { format_id: "m4a", label: "M4A 256kbps", ext: "m4a", quality: "256kbps" },
  { format_id: "wav", label: "WAV Lossless", ext: "wav", quality: "Lossless" },
  { format_id: "flac", label: "FLAC (transcoded)", ext: "flac", quality: "~320kbps" },
  { format_id: "opus", label: "Opus 256kbps", ext: "opus", quality: "256kbps" },
];

// Cookie Args Helper

function getCookieArgs(platform: Platform): string[] {
  // Skip cookies for YouTube and YouTube Music to avoid n-sig challenge crashes
  if (platform === "youtube" || platform === "youtube_music") return [];

  return fs.existsSync(path.join(process.cwd(), "cookies.txt"))
    ? ["--cookies", path.join(process.cwd(), "cookies.txt")]
    : ["--cookies-from-browser", process.env.COOKIES_BROWSER || "chrome"];
}

// yt-dlp Extraction

async function extractWithYtDlp(url: string, cookieArgs: string[]) {
  let stdout = "";
  try {
    const result = await execFileAsync("yt-dlp", [
      "--dump-json",
      "--no-playlist",
      "--geo-bypass",
      "--js-runtimes", "node",
      ...cookieArgs,
      url
    ], { maxBuffer: 10 * 1024 * 1024 });
    stdout = result.stdout;
  } catch (execError: any) {
    // yt-dlp exits with code 1 if it can't find video/audio formats (like for a pure image)
    // BUT it often still prints the JSON metadata to stdout. We can salvage it!
    if (execError.stdout && execError.stdout.trim().startsWith('{')) {
      stdout = execError.stdout;
    } else {
      throw execError;
    }
  }

  const data = JSON.parse(stdout);

  let formats = (data.formats || []).map((f: any) => ({
    format_id: f.format_id?.toString() || "",
    ext: f.ext?.toString() || "",
    resolution: f.resolution?.toString() || f.format_note?.toString(),
    filesize: f.filesize ? Number(f.filesize) : undefined,
    url: f.url?.toString() || "",
    vcodec: f.vcodec?.toString(),
    acodec: f.acodec?.toString(),
    format_note: f.format_note?.toString()
  })).filter((f: any) => f.url);

  // Fallback for single-file posts (like images) that don't use a 'formats' array
  if (formats.length === 0 && data.url) {
    formats = [{
      format_id: data.format_id?.toString() || "default",
      ext: data.ext?.toString() || "unknown",
      resolution: data.resolution?.toString() || "Original",
      url: data.url.toString(),
      vcodec: "none",
      acodec: "none",
      format_note: "Original Quality"
    }];
  }

  // Determine if this has actual video content
  const hasVideo = formats.some((f: any) => f.vcodec && f.vcodec !== "none");

  return {
    id: data.id?.toString() || "unknown",
    title: data.title?.toString() || "Unknown Title",
    thumbnail: data.thumbnail?.toString(),
    extractor: data.extractor?.toString(),
    formats,
    hasVideo
  };
}

// yt-dlp Playlist Extraction (no track limit)

async function extractYtPlaylist(url: string, cookieArgs: string[]) {
  // Use --flat-playlist to get metadata for ALL videos without downloading anything
  const args = [
    "--flat-playlist",
    "--dump-json",
    "--geo-bypass",
    "--js-runtimes", "node",
    ...cookieArgs,
    url
  ];

  const result = await execFileAsync("yt-dlp", args, { maxBuffer: 50 * 1024 * 1024 });

  // Each line of stdout is a separate JSON object (one per video)
  const lines = result.stdout.trim().split("\n").filter(l => l.trim());

  let playlistTitle = "YouTube Playlist";
  let playlistThumbnail: string | undefined;
  let playlistId = "yt_playlist";

  const tracks = lines.map((line, index) => {
    try {
      const entry = JSON.parse(line);
      // Extract playlist-level metadata from the first entry
      if (index === 0) {
        playlistTitle = entry.playlist_title || entry.playlist || playlistTitle;
        playlistId = entry.playlist_id || playlistId;
      }

      const videoId = entry.id || entry.url || `video_${index}`;
      const videoUrl = entry.url
        ? (entry.url.startsWith("http") ? entry.url : `https://www.youtube.com/watch?v=${entry.id}`)
        : `https://www.youtube.com/watch?v=${videoId}`;

      return {
        id: videoId,
        title: entry.title || `Video ${index + 1}`,
        artist: entry.uploader || entry.channel || undefined,
        thumbnail: entry.thumbnails?.[0]?.url || entry.thumbnail || undefined,
        duration: entry.duration ? Number(entry.duration) : undefined,
        url: videoUrl,
      };
    } catch {
      return null;
    }
  }).filter(Boolean);

  // Use thumbnail from the first track if no playlist-level thumbnail
  if (!playlistThumbnail && tracks.length > 0) {
    playlistThumbnail = (tracks[0] as any)?.thumbnail;
  }

  console.log(`[extract] YouTube playlist extracted: ${tracks.length} videos from "${playlistTitle}"`);

  return {
    id: playlistId,
    title: playlistTitle,
    thumbnail: playlistThumbnail,
    tracks,
    videoCount: tracks.length,
  };
}

// gallery-dl Extraction

async function extractWithGalleryDl(url: string, cookieArgs: string[]) {
  // gallery-dl uses --cookies (same Netscape format), not --cookies-from-browser (fck it)
  const gdlCookieArgs: string[] = [];
  const cookiePath = path.join(process.cwd(), "cookies.txt");
  if (fs.existsSync(cookiePath)) {
    gdlCookieArgs.push("--cookies", cookiePath);
  }

  const result = await execFileAsync("gallery-dl", [
    "--dump-json",
    "--no-download",
    ...gdlCookieArgs,
    url
  ], { maxBuffer: 10 * 1024 * 1024 });

  // gallery-dl outputs a JSON array: [[2, dirMeta], [3, url, fileMeta], ...]
  const data = JSON.parse(result.stdout);

  const images: { url: string; width?: number; height?: number; filename?: string; ext: string }[] = [];
  let title = "Unknown Title";
  let thumbnail: string | undefined;
  let id = "unknown";

  for (const entry of data) {
    if (!Array.isArray(entry)) continue;

    // Type 2 = directory metadata
    if (entry[0] === 2 && entry[1]) {
      const meta = entry[1];
      title = meta.description || meta.title || meta.pin_title || meta.board?.name || title;
      id = meta.id?.toString() || meta.pin_id?.toString() || id;
      // Clean up title - trim to reasonable length
      if (title.length > 100) title = title.substring(0, 100) + "...";
    }

    // Type 3 = downloadable file entry: [3, url, metadata]
    if (entry[0] === 3 && typeof entry[1] === "string") {
      const fileUrl = entry[1];
      const meta = entry[2] || {};

      // Determine file extension from URL or metadata
      const urlPath = new URL(fileUrl).pathname;
      const ext = meta.extension || path.extname(urlPath).replace(".", "") || "jpg";

      // Only include actual image files
      const imageExts = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp", "svg"];
      if (imageExts.includes(ext.toLowerCase())) {
        images.push({
          url: fileUrl,
          width: meta.width ? Number(meta.width) : undefined,
          height: meta.height ? Number(meta.height) : undefined,
          filename: meta.filename || `image_${images.length + 1}`,
          ext: ext.toLowerCase()
        });

        // Use the first image as the thumbnail
        if (!thumbnail) thumbnail = fileUrl;
      }
    }
  }

  return { id, title, thumbnail, images };
}

// Routes

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  // Extract Endpoint
  app.post(api.extract.path, async (req, res) => {
    try {
      const input = api.extract.input.parse(req.body);
      const platform = detectPlatform(input.url);
      const cookieArgs = getCookieArgs(platform);

      console.log(`[extract] Platform detected: ${platform} for URL: ${input.url}`);

      // Strategy 0: Audio-first platforms (Spotify, SoundCloud, Bandcamp, YT Music, Apple Music)
      if (AUDIO_PLATFORMS.includes(platform)) {
        console.log(`[extract] Audio platform detected: ${platform}`);

        // Apple Music — return metadata with special FLAC lossless option
        if (platform === "apple_music") {
          console.log(`[extract] Apple Music detected, fetching metadata...`);

          let title = "Apple Music Track";
          let thumbnail: string | undefined;
          let artist: string | undefined;
          let album: string | undefined;
          let duration: number | undefined;
          let id = "apple_music";

          try {
            const { getTrackMetadata } = await import("./services/appleMusicService");
            const metadata = await getTrackMetadata(input.url);
            title = metadata.title;
            artist = metadata.artist;
            album = metadata.album;
            thumbnail = metadata.thumbnail;
            duration = metadata.durationSec;
            id = `am_${title.replace(/\s+/g, "_").substring(0, 30)}`;
          } catch (err) {
            console.error("[extract] Apple Music metadata failed:", err);
          }

          const displayTitle = artist && artist !== "Unknown Artist" ? `${artist} - ${title}` : title;

          // Apple Music specific audio formats — includes true FLAC lossless
          const appleMusicFormats = [
            ...AUDIO_OUTPUT_FORMATS,
            { format_id: "apple_flac_lossless", label: "FLAC Lossless (Apple Music)", ext: "flac", quality: "Lossless 48kHz/24-bit" },
          ];

          return res.status(200).json({
            id,
            title: displayTitle,
            thumbnail,
            extractor: "apple_music",
            mediaType: "audio",
            formats: [],
            audioFormats: appleMusicFormats,
            artist,
            album,
            duration,
          });
        }

        if (platform === "spotify") {
          let title = "Spotify Audio";
          let thumbnail: string | undefined;
          let artist: string | undefined;
          let album: string | undefined;
          let year: string | undefined;
          let id = "spotify";

          try {
            console.log(`[extract] Fetching Spotify data for: ${input.url}`);

            // Parse URL to get type and ID
            const urlObj = new URL(input.url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            const type = pathParts[0]; // 'playlist', 'album', or 'track'
            id = pathParts[1] || id;

            // Step 1: Fetch embed page and parse track data directly from HTML
            console.log(`[extract] Fetching Spotify embed page for ${type}/${id}...`);
            const embedUrl = `https://open.spotify.com/embed/${type}/${id}`;
            const embedRes = await fetch(embedUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
              }
            });
            const embedHtml = await embedRes.text();

            // Parse the __NEXT_DATA__ script to extract entity data
            let entity: any = null;
            const nextMatch = embedHtml.match(/<script\s+id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/);
            if (nextMatch) {
              try {
                const nextData = JSON.parse(nextMatch[1]);
                entity = nextData?.props?.pageProps?.state?.data?.entity;
              } catch (e) { /* parse error */ }
            }
            if (!entity) {
              // Try initial-state (base64)
              const stateMatch = embedHtml.match(/<script\s+id="initial-state"[^>]*>([^<]+)<\/script>/);
              if (stateMatch) {
                try {
                  const decoded = JSON.parse(Buffer.from(stateMatch[1], 'base64').toString());
                  entity = decoded?.data?.entity;
                } catch (e) { /* parse error */ }
              }
            }
            if (!entity) {
              // Try resource (base64)
              const resMatch = embedHtml.match(/<script\s+id="resource"[^>]*>([^<]+)<\/script>/);
              if (resMatch) {
                try { entity = JSON.parse(Buffer.from(resMatch[1], 'base64').toString()); } catch (e) { }
              }
            }

            if (!entity) throw new Error("Could not parse Spotify embed page data.");

            // Extract metadata
            title = entity.name || title;
            thumbnail = entity.coverArt?.sources?.[0]?.url || entity.images?.[0]?.url || thumbnail;
            artist = entity.subtitle || entity.artists?.map((a: any) => a.name).join(", ") || artist;
            if (entity.releaseDate) year = String(entity.releaseDate.isoString || entity.releaseDate).split("-")[0];

            // Handle single tracks
            if (entity.type === 'track' || type === 'track') {
              return res.status(200).json({
                id, title: artist ? `${artist} - ${title}` : title,
                thumbnail, extractor: "spotify", mediaType: "audio",
                formats: [], audioFormats: AUDIO_OUTPUT_FORMATS,
                artist, album, year
              });
            }

            // Handle playlists and albums — extract tracks from embed HTML
            const embedTracks: any[] = [];
            if (entity.trackList) {
              for (let i = 0; i < entity.trackList.length; i++) {
                const item = entity.trackList[i];
                if (item && item.title) {
                  const trackId = item.uri ? String(item.uri).split(':').pop() : `${id}_track_${i}`;
                  embedTracks.push({
                    id: trackId || `${id}_track_${i}`,
                    title: item.title,
                    artist: item.subtitle || artist,
                    album: undefined, thumbnail,
                    duration: item.duration ? Math.floor(Number(item.duration) / 1000) : undefined,
                    url: item.uri ? `https://open.spotify.com/track/${trackId}` : undefined
                  });
                }
              }
            }

            const totalInPlaylist = entity.trackCount || entity.tracks?.total || 0;
            console.log(`[extract] Embed page returned ${embedTracks.length} tracks. Total predicted: ${totalInPlaylist || 'Unknown'}`);

            // If we have a reliable total count and we met it, OR if it's less than 100 (not truncated), return now.
            // If we see exactly 100, we MUST assume there are more and run the scraper. (Spotify Piece of Shit)
            if ((totalInPlaylist > 0 && embedTracks.length >= totalInPlaylist) || (embedTracks.length < 100)) {
              console.log(`[extract] All ${embedTracks.length} tracks extracted from embed page (fast path).`);
              return res.status(200).json({
                id, title, thumbnail, extractor: "spotify", mediaType: "playlist",
                formats: [], audioFormats: AUDIO_OUTPUT_FORMATS,
                tracks: embedTracks, artist, album: entity.type === 'album' ? title : undefined, year
              });
            }

            // Step 2: Playlist is likely larger — use Puppeteer to scrape the full page
            const scrollLimit = totalInPlaylist > 0 ? totalInPlaylist : 5000; // Use 5000 as a safe upper bound if unknown
            console.log(`[extract] Playlist is large (${embedTracks.length}+ tracks). Launching browser scraper (target: ${totalInPlaylist || 'END'})...`);
            const puppeteer = await import('puppeteer');
            const browser = await puppeteer.default.launch({
              headless: true,
              args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
            });

            try {
              const page = await browser.newPage();
              await page.setViewport({ width: 1280, height: 900 });
              await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

              // Load environment for cookie
              const dotenv = (await import('dotenv')).default;
              dotenv.config();
              const spDcCookie = process.env.SPOTIFY_DC;
              if (spDcCookie) {
                await page.setCookie({
                  name: 'sp_dc',
                  value: spDcCookie,
                  domain: '.spotify.com',
                  path: '/',
                  httpOnly: true,
                  secure: true
                });
              }

              await page.goto(`https://open.spotify.com/${type}/${id}`, {
                waitUntil: 'domcontentloaded',
                timeout: 30000
              });

              // Wait for track rows to appear
              await page.waitForSelector('div[data-testid="tracklist-row"]', { timeout: 15000 })
                .catch(() => console.log("[extract] Timeout waiting for tracklist rows, continuing..."));

              // Detect total count from header specifically to avoid sidebar metrics like "Liked Songs"
              const detectedTotal = await page.evaluate(() => {
                const header = (document.querySelector('[data-testid="playlist-page"] header') ||
                  document.querySelector('div[role="contentinfo"]') ||
                  document.body) as HTMLElement;
                const match = header.innerText.match(/(\d{1,4})\s+songs/i);
                return match ? parseInt(match[1]) : 0;
              });

              const targetCount = detectedTotal > 0 ? detectedTotal : (totalInPlaylist > 0 ? totalInPlaylist : 300);
              console.log(`[extract] Target track count identified: ${targetCount}`);

              // Collection Loop
              const allTracksMap = new Map();

              // Move mouse to center of page to ensure scroll events target the right pane
              await page.mouse.move(800, 500);

              let lastTotal = 0;
              let staleCycles = 0;

              for (let i = 0; i < 150; i++) {
                const pageTracks = await page.evaluate(() => {
                  const rows = document.querySelectorAll('div[data-testid="tracklist-row"]');
                  const results: any[] = [];
                  rows.forEach((row) => {
                    const titleAnchor = row.querySelector('a[href*="/track/"]') as HTMLAnchorElement;
                    if (!titleAnchor) return;

                    const trackUrl = titleAnchor.href;
                    const trackId = trackUrl.split('/track/')[1]?.split('?')[0] || trackUrl;

                    // Filter: Only include tracks that have a valid numeric index in the first column.
                    // Legit playlist tracks have 1, 2, 3... Recommended tracks do not.
                    const indexEl = row.querySelector('[aria-colindex="1"]') as HTMLElement;
                    const indexText = indexEl?.innerText?.trim() || "";
                    if (!/^\d+$/.test(indexText)) return; // Skip if not a number

                    const titleText = titleAnchor.innerText || 'Unknown';
                    const artistEls = Array.from(row.querySelectorAll('a[href*="/artist/"]')) as HTMLElement[];
                    const artistText = artistEls.map(a => a.innerText).join(', ') || 'Unknown';
                    const albumEl = row.querySelector('a[href*="/album/"]') as HTMLElement;
                    const albumText = albumEl?.innerText;
                    const imgEl = row.querySelector('img') as HTMLImageElement;

                    // Duration from the last div with a colon
                    let duration: number | undefined;
                    const divs = Array.from(row.querySelectorAll('div[dir="auto"]')) as HTMLElement[];
                    for (const d of divs) {
                      const t = d.innerText;
                      if (t && /^\d+:\d+$/.test(t.trim())) {
                        const [m, s] = t.trim().split(':').map(Number);
                        duration = m * 60 + s;
                      }
                    }

                    results.push({
                      index: indexText,
                      id: trackId,
                      title: titleText,
                      artist: artistText,
                      album: albumText,
                      thumbnail: imgEl?.src,
                      duration,
                      url: `https://open.spotify.com/track/${trackId}`
                    });
                  });
                  return results;
                });

                pageTracks.forEach((t: any) => {
                  const compositeKey = `${t.index}_${t.id}`;
                  if (!allTracksMap.has(compositeKey)) allTracksMap.set(compositeKey, t);
                });

                if (allTracksMap.size >= targetCount) break;

                // Aggressive scroll simulation
                await page.mouse.wheel({ deltaY: 1000 });
                await new Promise(r => setTimeout(r, 600));

                if (allTracksMap.size === lastTotal) {
                  staleCycles++;
                  if (staleCycles > 15) break;
                } else {
                  staleCycles = 0;
                }
                lastTotal = allTracksMap.size;

                if (i % 10 === 0) console.log(`[extract] Scraped ${allTracksMap.size}/${targetCount} tracks...`);
              }

              const allTracks = Array.from(allTracksMap.values());
              await browser.close();

              console.log(`[extract] Puppeteer scraped ${allTracks.length} tracks from "${title}".`);

              // Use Puppeteer tracks if we got more, otherwise fallback to embed
              const finalTracks = allTracks.length > embedTracks.length ? allTracks : embedTracks;

              return res.status(200).json({
                id, title, thumbnail, extractor: "spotify", mediaType: "playlist",
                formats: [], audioFormats: AUDIO_OUTPUT_FORMATS,
                tracks: finalTracks, artist, album: entity.type === 'album' ? title : undefined, year
              });

            } catch (puppeteerErr) {
              await browser.close().catch(() => { });
              console.error("[extract] Puppeteer scraping failed:", puppeteerErr);
              // Return whatever we got from embed
              return res.status(200).json({
                id, title, thumbnail, extractor: "spotify", mediaType: "playlist",
                formats: [], audioFormats: AUDIO_OUTPUT_FORMATS,
                tracks: embedTracks, artist, album: entity.type === 'album' ? title : undefined, year
              });
            }

          } catch (spotifyErr) {
            console.error(`[extract] Spotify API failed:`, spotifyErr);
            return res.status(500).json({ message: "Failed to fetch Spotify information." });
          }
        }

        // YouTube Music, SoundCloud, Bandcamp — use yt-dlp to get metadata
        try {
          // Check if this is a YouTube Music playlist
          if (platform === "youtube_music" && isYouTubePlaylist(input.url)) {
            console.log(`[extract] YouTube Music playlist detected, extracting all tracks...`);
            const plResult = await extractYtPlaylist(input.url, cookieArgs);
            return res.status(200).json({
              id: plResult.id,
              title: plResult.title,
              thumbnail: plResult.thumbnail,
              extractor: "youtube", // Send back 'youtube' so frontend uses video-track/playlist config logic
              mediaType: "playlist",
              formats: [],
              tracks: plResult.tracks,
              playlistVideoCount: plResult.videoCount,
            });
          }

          const ytResult = await extractWithYtDlp(input.url, cookieArgs);

          return res.status(200).json({
            id: ytResult.id,
            title: ytResult.title,
            thumbnail: ytResult.thumbnail,
            extractor: ytResult.extractor || platform,
            mediaType: "audio",
            formats: [],
            audioFormats: AUDIO_OUTPUT_FORMATS,
          });
        } catch (ytErr) {
          console.error(`[extract] yt-dlp failed for audio platform ${platform}:`, ytErr);
          return res.status(500).json({ message: `Failed to extract audio info from ${platform}. The URL may be invalid or require authentication.` });
        }
      }

      // Strategy 1: yt-dlp only platforms (YouTube, TikTok, etc.)
      if (YTDLP_ONLY.includes(platform) || platform === "generic") {
        // Check if this is a YouTube playlist
        if (platform === "youtube" && isYouTubePlaylist(input.url)) {
          console.log(`[extract] YouTube playlist detected, extracting all videos...`);
          try {
            const plResult = await extractYtPlaylist(input.url, cookieArgs);
            return res.status(200).json({
              id: plResult.id,
              title: plResult.title,
              thumbnail: plResult.thumbnail,
              extractor: "youtube",
              mediaType: "playlist",
              formats: [],
              tracks: plResult.tracks,
              playlistVideoCount: plResult.videoCount,
            });
          } catch (plErr) {
            console.error(`[extract] YouTube playlist extraction failed:`, plErr);
            return res.status(500).json({ message: "Failed to extract YouTube playlist. The URL may be invalid or the playlist is private." });
          }
        }

        console.log(`[extract] Using yt-dlp (primary) for ${platform}`);
        const ytResult = await extractWithYtDlp(input.url, cookieArgs);

        return res.status(200).json({
          id: ytResult.id,
          title: ytResult.title,
          thumbnail: ytResult.thumbnail,
          extractor: ytResult.extractor,
          mediaType: "video",
          formats: ytResult.formats
        });
      }

      // Strategy 2: gallery-dl primary platforms (Pinterest, Tumblr, Flickr, Reddit)
      if (GALLERY_DL_PRIMARY.includes(platform)) {
        console.log(`[extract] Using gallery-dl (primary) for ${platform}`);
        try {
          const gdlResult = await extractWithGalleryDl(input.url, cookieArgs);
          if (gdlResult.images.length > 0) {
            return res.status(200).json({
              id: gdlResult.id,
              title: gdlResult.title,
              thumbnail: gdlResult.thumbnail,
              extractor: platform,
              mediaType: gdlResult.images.length > 1 ? "gallery" : "image",
              formats: [],
              images: gdlResult.images
            });
          }
        } catch (gdlErr) {
          console.log(`[extract] gallery-dl failed for ${platform}, trying yt-dlp fallback...`);
        }

        // Fallback to yt-dlp for video content on these platforms
        const ytResult = await extractWithYtDlp(input.url, cookieArgs);
        return res.status(200).json({
          id: ytResult.id,
          title: ytResult.title,
          thumbnail: ytResult.thumbnail,
          extractor: ytResult.extractor,
          mediaType: "video",
          formats: ytResult.formats
        });
      }

      // Strategy 3: Mixed platforms (Instagram, Twitter) - try yt-dlp first for video
      if (MIXED_PLATFORMS.includes(platform)) {
        console.log(`[extract] Trying yt-dlp first for mixed platform: ${platform}`);

        try {
          const ytResult = await extractWithYtDlp(input.url, cookieArgs);

          // If yt-dlp found actual video formats, use it
          if (ytResult.hasVideo && ytResult.formats.length > 0) {
            console.log(`[extract] yt-dlp found video content for ${platform}`);
            return res.status(200).json({
              id: ytResult.id,
              title: ytResult.title,
              thumbnail: ytResult.thumbnail,
              extractor: ytResult.extractor,
              mediaType: "video",
              formats: ytResult.formats
            });
          }
        } catch (ytErr) {
          console.log(`[extract] yt-dlp failed for ${platform}, trying gallery-dl...`);
        }

        // Fall back to gallery-dl for image/carousel content
        console.log(`[extract] Trying gallery-dl for ${platform} (image/carousel)`);
        try {
          const gdlResult = await extractWithGalleryDl(input.url, cookieArgs);
          if (gdlResult.images.length > 0) {
            return res.status(200).json({
              id: gdlResult.id,
              title: gdlResult.title,
              thumbnail: gdlResult.thumbnail,
              extractor: platform,
              mediaType: gdlResult.images.length > 1 ? "gallery" : "image",
              formats: [],
              images: gdlResult.images
            });
          }
        } catch (gdlErr) {
          console.log(`[extract] gallery-dl also failed for ${platform}`);
        }

        // Both failed
        return res.status(500).json({ message: `Could not extract media from this ${platform} post. It may be a private post or require authentication.` });
      }

      // Default fallback — shouldn't reach here but just in case
      const ytResult = await extractWithYtDlp(input.url, cookieArgs);
      return res.status(200).json({
        id: ytResult.id,
        title: ytResult.title,
        thumbnail: ytResult.thumbnail,
        extractor: ytResult.extractor,
        mediaType: "video",
        formats: ytResult.formats
      });

    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error("Extraction error:", err);
      res.status(500).json({ message: "Failed to extract media information. The URL may be invalid or unsupported." });
    }
  });

  // Video Download (existing yt-dlp pipeline)
  app.post("/api/download", async (req, res) => {
    try {
      const { url, formatId, title } = req.body;
      if (!url || !formatId) {
        return res.status(400).json({ message: "Missing url or formatId." });
      }

      const safeTitle = (title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeTitle}.mp4`;

      const jobId = crypto.randomUUID();
      const outTemplate = path.join(os.tmpdir(), `${jobId}.%(ext)s`);

      jobs.set(jobId, { status: "processing" });
      res.status(200).json({ jobId });

      const platform = detectPlatform(url);
      const cookieArgs = getCookieArgs(platform);

      const args = [
        "-f", formatId,
        "--merge-output-format", "mp4",
        "--js-runtimes", "node",
        ...cookieArgs,
        "-o", outTemplate,
        url
      ];

      const ytProcess = spawn("yt-dlp", args);

      ytProcess.on('close', (code) => {
        if (code === 0) {
          const dir = os.tmpdir();
          const files = fs.readdirSync(dir);
          const downloadedFile = files.find(f => f.startsWith(jobId));

          if (downloadedFile) {
            jobs.set(jobId, {
              status: "completed",
              filePath: path.join(dir, downloadedFile),
              fileName: filename
            });
          } else {
            jobs.set(jobId, { status: "error", error: "File not found after processing." });
          }
        } else {
          jobs.set(jobId, { status: "error", error: `yt-dlp exited with code ${code}` });
        }
      });
    } catch (err) {
      console.error("Download start error:", err);
      res.status(500).json({ message: "Failed to start download process." });
    }
  });

  app.get("/api/download/status/:jobId", (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }
    res.json({ status: job.status, error: job.error });
  });

  app.get("/api/download/file/:jobId", (req, res) => {
    const job = jobs.get(req.params.jobId);
    if (!job || job.status !== "completed" || !job.filePath) {
      return res.status(404).json({ message: "File not ready or job not found." });
    }

    res.download(job.filePath, job.fileName || "video.mp4", (err) => {
      // Clean up after download completes or fails
      if (fs.existsSync(job.filePath!)) {
        fs.unlinkSync(job.filePath!);
      }
      jobs.delete(req.params.jobId);
    });
  });

  // Audio Download Endpoint
  app.post("/api/download/audio", async (req, res) => {
    try {
      const { url, format, title, artist, album, year } = req.body;
      if (!url || !format) {
        return res.status(400).json({ message: "Missing url or format." });
      }

      // Guard: apple_flac_lossless uses its own dedicated recording pipeline
      if (format === "apple_flac_lossless") {
        return res.status(400).json({ message: "FLAC Lossless uses the Apple Music recording pipeline. Use /api/applemusic/record instead." });
      }

      const platform = detectPlatform(url);

      // Guard: yt-dlp does not support Apple Music URLs at all
      if (platform === "apple_music") {
        return res.status(400).json({ message: "Apple Music URLs are not supported by the standard audio download pipeline. Use the FLAC Lossless option." });
      }

      const jobId = crypto.randomUUID();
      const filename = `${(title || 'audio').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.${format}`;
      const tmpDir = os.tmpdir();

      jobs.set(jobId, { status: "processing" });
      res.status(200).json({ jobId });

      const outTemplate = path.join(tmpDir, `${jobId}.%(ext)s`);
      const cookieArgs = getCookieArgs(platform);

      // Build the actual yt-dlp target URL
      //   - Spotify: search YouTube for the track title
      //   - Everything else: use the URL directly
      let targetUrl: string;
      if (platform === "spotify") {
        // title is already "Artist - Song" from the extract endpoint
        // Append "audio" to bias YouTube search towards music, not random videos
        const searchQuery = `ytsearch1:${title || "unknown track"} audio`;
        targetUrl = searchQuery;
        console.log(`[audio-dl] Spotify detected, searching YouTube: ${searchQuery}`);
      } else {
        targetUrl = url;
      }

      // Format-specific quality values
      // --audio-quality accepts kbps values like "320K" for CBR, or "0" for VBR best
      const qualityMap: Record<string, string> = {
        mp3: "320K",  // True 320kbps CBR
        m4a: "256K",
        opus: "256K",
        flac: "0",     // Best quality (lossless, bitrate doesn't matter)
        wav: "0",
      };
      const audioQuality = qualityMap[format] || "0";

      // Formats that support embedded thumbnails and rich metadata tags
      const supportsRichMeta = ["mp3", "m4a", "opus"].includes(format);

      // Metadata tagging via ffmpeg postprocessor args
      // Only for formats that support it — WAV/FLAC will be corrupted by this
      const metadataArgs: string[] = [];
      if (supportsRichMeta && (title || artist || album || year)) {
        let ffArgs = "ffmpeg:";
        if (title) ffArgs += ` -metadata title=${JSON.stringify(title)}`;
        if (artist) ffArgs += ` -metadata artist=${JSON.stringify(artist)}`;
        if (album) ffArgs += ` -metadata album=${JSON.stringify(album)}`;
        if (year) ffArgs += ` -metadata date=${JSON.stringify(year)}`;
        metadataArgs.push("--postprocessor-args", ffArgs);
      }

      const args = [
        "-x",
        "--audio-format", format,
        "--audio-quality", audioQuality,
        "--no-playlist",
        "--socket-timeout", "30",
        "--retries", "2",
        // Only embed thumbnail + metadata for formats that support them
        ...(supportsRichMeta ? ["--embed-thumbnail", "--add-metadata"] : []),
        "--js-runtimes", "node",
        ...metadataArgs,
        // Skip cookies for ytsearch (can worsen n-challenge); use them for direct URLs
        ...(platform === "spotify" ? [] : cookieArgs),
        "-o", outTemplate,
        targetUrl
      ];

      console.log(`[audio-dl] Spawning yt-dlp:`, args.join(" "));
      const dlProcess = spawn("yt-dlp", args);

      // yt-dlp logs mostly to stdout, collect both
      let stdoutOutput = "";
      let stderrOutput = "";
      dlProcess.stdout.on("data", (chunk: Buffer) => { stdoutOutput += chunk.toString(); });
      dlProcess.stderr.on("data", (chunk: Buffer) => { stderrOutput += chunk.toString(); });

      // Kill after 3 minutes to prevent infinite hangs
      const killTimeout = setTimeout(() => {
        dlProcess.kill("SIGKILL");
        jobs.set(jobId, { status: "error", error: "Download timed out after 3 minutes." });
        console.error(`[audio-dl] Job ${jobId} timed out and was killed.`);
      }, 3 * 60 * 1000);

      dlProcess.on("close", (code) => {
        clearTimeout(killTimeout);

        const files = fs.readdirSync(tmpDir);
        const downloadedFile = files.find(f => f.startsWith(jobId));

        // code 0 is success. code 1 is often a warning but the file might be fine.
        if (code === 0 || (code === 1 && downloadedFile)) {
          if (downloadedFile) {
            jobs.set(jobId, {
              status: "completed",
              filePath: path.join(tmpDir, downloadedFile),
              fileName: filename
            });
            if (code === 1) console.log(`[audio-dl] Job ${jobId} finished with warnings (code 1) but file exists.`);
          } else {
            console.error(`[audio-dl] File not found in tmpDir after exit code ${code}. stdout:\n${stdoutOutput}`);
            jobs.set(jobId, { status: "error", error: "File not found after processing." });
          }
        } else {
          const errMsg = (stderrOutput || stdoutOutput).trim().split("\n").slice(-5).join(" ").substring(0, 300);
          console.error(`[audio-dl] yt-dlp failed (code ${code}). Last output:\n${errMsg}`);
          jobs.set(jobId, { status: "error", error: `Download failed: ${errMsg || `exit code ${code}`}` });
        }
      });

    } catch (err) {
      console.error("Audio download error:", err);
      res.status(500).json({ message: "Failed to start audio download." });
    }
  });

  // Video Track Download Endpoint (for YouTube playlist items)
  app.post("/api/download/video-track", async (req, res) => {
    try {
      const { url, resolution, audioFormat, title } = req.body;
      if (!url) {
        return res.status(400).json({ message: "Missing video URL." });
      }

      const isAudioOnly = audioFormat && ["mp3", "m4a", "wav", "flac", "opus"].includes(audioFormat);
      const jobId = crypto.randomUUID();
      const tmpDir = os.tmpdir();
      const safeTitle = (title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const ext = isAudioOnly ? audioFormat : "mp4";
      const filename = `${safeTitle}.${ext}`;
      const outTemplate = path.join(tmpDir, `${jobId}.%(ext)s`);

      const platform = detectPlatform(url);
      const cookieArgs = getCookieArgs(platform);

      jobs.set(jobId, { status: "processing" });
      res.status(200).json({ jobId });

      let args: string[];

      if (isAudioOnly) {
        // Audio extraction mode
        const qualityMap: Record<string, string> = {
          mp3: "320K", m4a: "256K", opus: "256K", flac: "0", wav: "0",
        };
        const audioQuality = qualityMap[audioFormat] || "0";
        const supportsRichMeta = ["mp3", "m4a", "opus"].includes(audioFormat);

        args = [
          "-x",
          "--audio-format", audioFormat,
          "--audio-quality", audioQuality,
          "--no-playlist",
          "--socket-timeout", "30",
          "--retries", "2",
          ...(supportsRichMeta ? ["--embed-thumbnail", "--add-metadata"] : []),
          "--js-runtimes", "node",
          ...cookieArgs,
          "-o", outTemplate,
          url
        ];
      } else {
        // Video download mode with resolution selection
        const res_height = resolution || "1080";
        args = [
          "-f", `bestvideo[height<=${res_height}]+bestaudio/best[height<=${res_height}]`,
          "--merge-output-format", "mp4",
          "--postprocessor-args", "ffmpeg:-c:a aac -b:a 256k",
          "--no-playlist",
          "--socket-timeout", "30",
          "--retries", "2",
          "--js-runtimes", "node",
          ...cookieArgs,
          "-o", outTemplate,
          url
        ];
      }

      console.log(`[video-track-dl] Spawning yt-dlp:`, args.join(" "));
      const dlProcess = spawn("yt-dlp", args);

      let stderrOutput = "";
      let stdoutOutput = "";
      dlProcess.stdout.on("data", (chunk: Buffer) => { stdoutOutput += chunk.toString(); });
      dlProcess.stderr.on("data", (chunk: Buffer) => { stderrOutput += chunk.toString(); });

      // Kill after 5 minutes for video downloads
      const killTimeout = setTimeout(() => {
        dlProcess.kill("SIGKILL");
        jobs.set(jobId, { status: "error", error: "Download timed out after 5 minutes." });
        console.error(`[video-track-dl] Job ${jobId} timed out and was killed.`);
      }, 5 * 60 * 1000);

      dlProcess.on("close", (code) => {
        clearTimeout(killTimeout);

        const files = fs.readdirSync(tmpDir);
        const downloadedFile = files.find(f => f.startsWith(jobId));

        if (code === 0 || (code === 1 && downloadedFile)) {
          if (downloadedFile) {
            jobs.set(jobId, {
              status: "completed",
              filePath: path.join(tmpDir, downloadedFile),
              fileName: filename
            });
          } else {
            jobs.set(jobId, { status: "error", error: "File not found after processing." });
          }
        } else {
          const errMsg = (stderrOutput || stdoutOutput).trim().split("\n").slice(-5).join(" ").substring(0, 300);
          console.error(`[video-track-dl] yt-dlp failed (code ${code}). Last output:\n${errMsg}`);
          jobs.set(jobId, { status: "error", error: `Download failed: ${errMsg || `exit code ${code}`}` });
        }
      });

    } catch (err) {
      console.error("Video track download error:", err);
      res.status(500).json({ message: "Failed to start video track download." });
    }
  });

  // Image Proxy Download
  // Proxies image downloads through the server to avoid CORS issues
  app.get("/api/download/image", async (req, res) => {
    try {
      const imageUrl = req.query.url as string;
      const filename = (req.query.filename as string) || "image";
      const ext = (req.query.ext as string) || "jpg";

      if (!imageUrl) {
        return res.status(400).json({ message: "Missing image URL." });
      }

      const safeFilename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase();

      // Set download headers
      res.setHeader("Content-Disposition", `attachment; filename="${safeFilename}.${ext}"`);
      res.setHeader("Content-Type", `image/${ext === "jpg" ? "jpeg" : ext}`);

      // Pipe the image through our server
      const transport = imageUrl.startsWith("https") ? https : http;
      transport.get(imageUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      }, (proxyRes) => {
        if (proxyRes.statusCode && proxyRes.statusCode >= 300 && proxyRes.statusCode < 400 && proxyRes.headers.location) {
          // Handle redirects
          const redirectTransport = proxyRes.headers.location.startsWith("https") ? https : http;
          redirectTransport.get(proxyRes.headers.location, (redirectRes) => {
            redirectRes.pipe(res);
          }).on("error", (err) => {
            console.error("Redirect proxy error:", err);
            if (!res.headersSent) res.status(500).json({ message: "Failed to download image." });
          });
        } else {
          proxyRes.pipe(res);
        }
      }).on("error", (err) => {
        console.error("Image proxy error:", err);
        if (!res.headersSent) res.status(500).json({ message: "Failed to download image." });
      });
    } catch (err) {
      console.error("Image download error:", err);
      if (!res.headersSent) res.status(500).json({ message: "Failed to download image." });
    }
  });

  return httpServer;
}