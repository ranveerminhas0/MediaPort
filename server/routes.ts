import type { Express } from "express";
import type { Server } from "http";
// import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { execFile, spawn } from "child_process";
import { promisify } from "util";
import crypto from "crypto";
import path from "path";
import os from "os";
import fs from "fs";

const execFileAsync = promisify(execFile);

// Simple in-memory job queue for downloads
const jobs = new Map<string, { status: "processing" | "completed" | "error", filePath?: string, fileName?: string, error?: string }>();

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post(api.extract.path, async (req, res) => {
    try {
      const input = api.extract.input.parse(req.body);

      // Phase 1 Fix: No shell interpolation.
      const { stdout } = await execFileAsync("yt-dlp", ["--dump-json", "--no-playlist", "-f", "bestvideo+bestaudio/best", input.url]);
      const data = JSON.parse(stdout);

      const formats = (data.formats || []).map((f: any) => ({
        format_id: f.format_id?.toString() || "",
        ext: f.ext?.toString() || "",
        resolution: f.resolution?.toString() || f.format_note?.toString(),
        filesize: f.filesize ? Number(f.filesize) : undefined,
        url: f.url?.toString() || "",
        vcodec: f.vcodec?.toString(),
        acodec: f.acodec?.toString(),
        format_note: f.format_note?.toString()
      })).filter((f: any) => f.url);

      const result = {
        id: data.id?.toString() || "unknown",
        title: data.title?.toString() || "Unknown Title",
        thumbnail: data.thumbnail?.toString(),
        extractor: data.extractor?.toString(),
        formats: formats
      };

      res.status(200).json(result);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
          message: err.errors[0].message,
          field: err.errors[0].path.join('.'),
        });
      }
      console.error("Extraction error:", err);
      res.status(500).json({ message: "Failed to extract video information." });
    }
  });

  // Phase 2 Fix: Safe downloading through yt-dlp server-side instead of unreliable ffmpeg piping.
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

      const args = [
        "-f", formatId,
        "--merge-output-format", "mp4",
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

  return httpServer;
}