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
  // Skip cookies for YouTube to avoid n-sig challenge crashes
  if (platform === "youtube") return [];

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
          let title = "Spotify Track";
          let thumbnail: string | undefined;
          let artist: string | undefined;
          let album: string | undefined;
          let year: string | undefined;
          let id = "spotify";

          // Helper: fetch a URL and return the body as a string
          const fetchText = (fetchUrl: string): Promise<string> => new Promise((resolve, reject) => {
            https.get(fetchUrl, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            }, (res2) => {
              // Follow redirects
              if (res2.statusCode && res2.statusCode >= 300 && res2.statusCode < 400 && res2.headers.location) {
                fetchText(res2.headers.location).then(resolve).catch(reject);
                return;
              }
              let body = "";
              res2.on("data", (chunk) => body += chunk);
              res2.on("end", () => resolve(body));
            }).on("error", reject);
          });

          // Step 1: oEmbed for title + thumbnail (fast, reliable)
          try {
            const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(input.url)}`;
            const oembedBody = await fetchText(oembedUrl);
            const oembedData = JSON.parse(oembedBody);

            if (oembedData.title) title = oembedData.title;
            if (oembedData.thumbnail_url) thumbnail = oembedData.thumbnail_url;
            console.log(`[extract] Spotify oEmbed: title="${title}"`);
          } catch (oembedErr) {
            console.log(`[extract] Spotify oEmbed failed:`, oembedErr);
          }

          // Step 2: Fetch the actual Spotify track page to extract artist from HTML meta tags
          try {
            const cleanUrl = input.url.split("?")[0]; // Remove query params
            const pageHtml = await fetchText(cleanUrl);

            const ogDescMatch = pageHtml.match(/<meta\s+(?:property|name)="og:description"\s+content="([^"]+)"/i);
            if (ogDescMatch) {
              const parts = ogDescMatch[1].split("·").map((s: string) => s.trim());
              // Format: "Artist1, Artist2 · Album · Song · Year" OR "Artist · Song · Type · Year"
              if (parts.length >= 2 && !parts[0].toLowerCase().includes("listen")) {
                artist = parts[0];
                console.log(`[extract] Got artist from og:description: "${artist}"`);

                // If 4 parts: [Artist, Album, Song/Type, Year]
                if (parts.length >= 4) {
                  album = parts[1];
                  year = parts[3];
                } else if (parts.length === 3) {
                  // [Artist, Title/Album, Year]
                  year = parts[2];
                }
              }
            }

            if (!artist) {
              const titleMatch = pageHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
              if (titleMatch) {
                const byMatch = titleMatch[1].match(/by\s+(.+?)(?:\s*\|)/i);
                if (byMatch) {
                  artist = byMatch[1].trim();
                  console.log(`[extract] Got artist from <title>: "${artist}"`);
                }
              }
            }

            // Try to get track ID from URL
            try {
              const urlPath = new URL(input.url).pathname;
              const segments = urlPath.split("/").filter(Boolean);
              if (segments.length >= 2) id = segments[segments.length - 1];
            } catch { }

          } catch (pageErr) {
            console.log(`[extract] Spotify page fetch failed:`, pageErr);
          }

          const displayTitle = artist ? `${artist} - ${title}` : title;
          console.log(`[extract] Spotify final: "${displayTitle}"`);

          return res.status(200).json({
            id,
            title: displayTitle,
            thumbnail,
            extractor: "spotify",
            mediaType: "audio",
            formats: [],
            audioFormats: AUDIO_OUTPUT_FORMATS,
            artist,
            album,
            year
          });
        }

        // YouTube Music, SoundCloud, Bandcamp — use yt-dlp to get metadata
        try {
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
          return res.status(500).json({ message: `Failed to extract audio info from ${platform}. The URL may be invalid.` });
        }
      }

      // Strategy 1: yt-dlp only platforms (YouTube, TikTok, etc.)
      if (YTDLP_ONLY.includes(platform) || platform === "generic") {
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