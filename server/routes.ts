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

type Platform = "youtube" | "instagram" | "twitter" | "pinterest" | "tiktok" | "reddit" | "tumblr" | "flickr" | "generic";

function detectPlatform(url: string): Platform {
  try {
    const hostname = new URL(url).hostname.toLowerCase().replace("www.", "");

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