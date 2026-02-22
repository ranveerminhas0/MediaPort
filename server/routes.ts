import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { exec, spawn } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post(api.extract.path, async (req, res) => {
    try {
      const input = api.extract.input.parse(req.body);
      
      const { stdout } = await execAsync(`yt-dlp --dump-json --no-playlist -f "bestvideo+bestaudio/best" "${input.url}"`);
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

  app.post("/api/download", async (req, res) => {
    try {
      const { videoUrl, audioUrl, title } = req.body;
      if (!videoUrl || !audioUrl) {
        return res.status(400).json({ message: "Missing video or audio URL." });
      }
      
      const safeTitle = (title || 'video').replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `${safeTitle}.mp4`;
      
      console.log(`Streaming merged video and audio: ${filename}`);
      
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', 'video/mp4');

      const ffmpegProcess = spawn('ffmpeg', [
        '-i', videoUrl,
        '-i', audioUrl,
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-map', '0:v:0',
        '-map', '1:a:0',
        '-f', 'mp4',
        '-movflags', 'frag_keyframe+empty_moov',
        'pipe:1'
      ]);

      ffmpegProcess.stdout.pipe(res);

      ffmpegProcess.stderr.on('data', (data) => {
        // Log stderr for debugging but don't break the stream
        // console.log(`ffmpeg stderr: ${data}`);
      });

      ffmpegProcess.on('close', (code) => {
        if (code !== 0) {
          console.error(`ffmpeg process exited with code ${code}`);
          if (!res.headersSent) {
            res.status(500).json({ message: "Failed to merge video and audio." });
          }
        }
      });

      req.on('close', () => {
        ffmpegProcess.kill();
      });

    } catch (err) {
      console.error("Download error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to process video." });
      }
    }
  });

  return httpServer;
}