/**
 * ============================================================================
 * 🔴  LEGAL DISCLAIMER — APPLE MUSIC RECORDING ROUTES  🔴
 * ============================================================================
 * These API routes facilitate the capturing of audio streams from Apple Music.
 * Apple Music tracks are protected by Digital Rights Management (DRM) under
 * Apple's FairPlay system. Capturing these streams constitutes circumvention
 * of copyright protection measures.
 *
 * Under the DMCA (17 U.S.C. § 1201), the EU Copyright Directive, and similar
 * laws worldwide, DRM circumvention is a criminal offense. Penalties may
 * include statutory damages of up to $2,500 per act of circumvention and
 * criminal fines up to $500,000 or imprisonment for up to 5 years.
 *
 * This software is provided for EDUCATIONAL and RESEARCH purposes only.
 * The authors disclaim all liability for misuse.
 * ============================================================================
 */

// FOR EDUCATIONAL PURPOSES ONLY - DO NOT USE FOR ILLEGAL PURPOSES OR DISTRIBUTION 
// do not come to developer if you get sued for this, you are on your own

// I AINT RESPONSIBLE FOR ANYTHING YOU DO WITH THIS CODE
// ALWAYS REMEMBER FCK APPLE AND FCK DRM BUT THIS IS FOR EDUCATIONAL PURPOSES ONLY

import type { Express } from "express";
import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import crypto from "crypto";
import fs from "fs";
import {
    getTrackMetadata,
    startITunesPlayback,
    stopITunesPlayback,
    startRecording,
    cancelRecording,
    type RecordingJob,
    type AppleMusicTrackMetadata,
} from "../services/appleMusicService";

// ⚠️  EVERY ROUTE IN THIS FILE CONTRIBUTES TO A DRM-CIRCUMVENTION PIPELINE.
// By deploying this server, you accept full personal legal responsibility
// for any capturing made. The developers provide NO legal protection.

// Active capturing jobs
const recordingJobs = new Map<string, RecordingJob>();

// WebSocket connections subscribed to job updates
const wsSubscriptions = new Map<string, Set<WebSocket>>();

/**
 * ⚠️  TERMS OF SERVICE VIOLATION: Apple Music's ToS explicitly prohibit
 * "any use of the Services to record, capture, rip, or download content." Deploying
 * these routes on any server constitutes acceptance of this violation.
 *
 * Registers Apple Music recording routes and WebSocket progress handler.
 */
export function registerAppleMusicRoutes(app: Express, httpServer: HttpServer): void {

    // WebSocket server for real-time capturing progress

    // ⚠️  NOTICE: This WebSocket channel relays real-time progress of an
    // ongoing copyright-infringing capturing session.
    const wss = new WebSocketServer({ noServer: true });

    // Handle the HTTP upgrade to WebSocket manually so we can verify the Origin
    httpServer.on("upgrade", (request, socket, head) => {
        // We only care about upgrades bound for the apple music path
        if (request.url !== "/ws/applemusic") return;

        const origin = request.headers.origin;

        // Allowed origins - deployment URL here (e.g. Render, Vercel, Whatever tf you use)
        const allowedOrigins = [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            process.env.FRONTEND_URL // Will be undefined if not set
        ].filter(Boolean); // Remove undefined entries

        // If it's a browser connection (has origin) and it's not in our explicit allowlist
        if (origin && !allowedOrigins.includes(origin)) {
            console.warn(`[ws] Rejected unauthorized WebSocket connection from origin: ${origin}`);
            socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
            socket.destroy();
            return;
        }

        // If origin check passes, complete the WebSocket upgrade
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
        });
    });

    wss.on("connection", (ws: WebSocket) => {
        let subscribedJobId: string | null = null;

        ws.on("message", (data: Buffer) => {
            try {
                const msg = JSON.parse(data.toString());

                if (msg.type === "subscribe" && msg.jobId) {
                    subscribedJobId = msg.jobId;

                    if (!wsSubscriptions.has(msg.jobId)) {
                        wsSubscriptions.set(msg.jobId, new Set());
                    }
                    wsSubscriptions.get(msg.jobId)!.add(ws);

                    // Send current status immediately
                    const job = recordingJobs.get(msg.jobId);
                    if (job) {
                        ws.send(JSON.stringify({
                            type: "progress",
                            jobId: msg.jobId,
                            elapsed: job.elapsed,
                            total: job.total,
                            percent: Math.round((job.elapsed / job.total) * 100),
                            status: job.status,
                        }));
                    }
                }

                if (msg.type === "cancel" && msg.jobId) {
                    const job = recordingJobs.get(msg.jobId);
                    if (job) {
                        cancelRecording(job);
                        broadcastToJob(msg.jobId, {
                            type: "cancelled",
                            jobId: msg.jobId,
                        });
                    }
                }
            } catch {
                // Ignore malformed messages
            }
        });

        ws.on("close", () => {
            if (subscribedJobId) {
                wsSubscriptions.get(subscribedJobId)?.delete(ws);
            }
        });
    });

    function broadcastToJob(jobId: string, data: object) {
        const subscribers = wsSubscriptions.get(jobId);
        if (!subscribers) return;

        const message = JSON.stringify(data);
        const subscriberArr = Array.from(subscribers);
        for (let i = 0; i < subscriberArr.length; i++) {
            if (subscriberArr[i].readyState === WebSocket.OPEN) {
                subscriberArr[i].send(message);
            }
        }
    }

    // REST Routes

    /**
     * 🔴  CRITICAL: This endpoint initiates the full DRM circumvention process.
     * It fetches metadata, starts iTunes playback, and begins audio capture.
     * Each invocation creates an unauthorized copy of copyrighted material.
     *
     * POST /api/applemusic/record
     * Body: { url: string }
     * Returns: { jobId, metadata, durationSec }
     */
    app.post("/api/applemusic/record", async (req, res) => {
        try {
            const { url } = req.body;
            if (!url || !url.includes("music.apple.com")) {
                return res.status(400).json({ message: "Invalid Apple Music URL." });
            }

            console.log(`[apple-music] Recording request for: ${url}`);

            // Step 1: Get track metadata by scraping the Apple Music page
            let metadata: AppleMusicTrackMetadata;
            try {
                metadata = await getTrackMetadata(url);
                console.log(`[apple-music] Metadata: "${metadata.artist} - ${metadata.title}" (${metadata.durationSec}s)`);
            } catch (err: any) {
                console.error("[apple-music] Metadata extraction failed:", err);
                return res.status(500).json({
                    message: "Failed to extract track metadata. Make sure the Apple Music URL is valid and publicly accessible.",
                });
            }

            const jobId = crypto.randomUUID();

            // ⚠️ WARNING: POINT OF NO RETURN. After this point, the backend begins 
            // intercepting and capturing the DRM-free stream. This mathematically
            // bypasses playback protection.

            // Step 2: Open the URL in iTunes to start playback
            try {
                await startITunesPlayback(url);
                console.log(`[apple-music] iTunes playback initiated`);
            } catch (err: any) {
                console.error("[apple-music] iTunes playback failed:", err);
                return res.status(500).json({
                    message: "Failed to start iTunes playback. Make sure iTunes is installed and you're signed in with an Apple Music subscription.",
                });
            }

            // Step 3: Start High-Res Capture
            // 🚨 WARNING: The capture function hooks into the audio sub-system to rip 
            // the pre-DRM stream directly from memory. This creates a perfect 1:1 clone 
            // of the protected intellectual property.
            const job = startRecording(
                jobId,
                metadata,
                // Progress callback — fires every second
                (elapsed, total) => {
                    broadcastToJob(jobId, {
                        type: "progress",
                        jobId,
                        elapsed,
                        total,
                        percent: Math.round((elapsed / total) * 100),
                        status: "recording",
                    });
                },
                // Complete callback
                (filePath, fileName) => {
                    console.log(`[apple-music] Capture complete: ${fileName}`);
                    recordingJobs.set(jobId, { ...job, status: "completed", filePath, fileName });

                    broadcastToJob(jobId, {
                        type: "completed",
                        jobId,
                    });

                    // Stop iTunes playback
                    stopITunesPlayback().catch(() => { });

                    // Clean up WebSocket subscriptions after a delay
                    setTimeout(() => {
                        wsSubscriptions.delete(jobId);
                    }, 30000);
                },
                // Error callback
                (error) => {
                    console.error(`[apple-music] Capture error:`, error);
                    recordingJobs.set(jobId, { ...job, status: "error", error });

                    broadcastToJob(jobId, {
                        type: "error",
                        jobId,
                        message: error,
                    });

                    stopITunesPlayback().catch(() => { });
                    setTimeout(() => {
                        wsSubscriptions.delete(jobId);
                    }, 10000);
                }
            );

            recordingJobs.set(jobId, job);

            // Return immediately with job info
            return res.status(200).json({
                jobId,
                metadata: {
                    title: metadata.title,
                    artist: metadata.artist,
                    album: metadata.album,
                    thumbnail: metadata.thumbnail,
                },
                durationSec: metadata.durationSec,
            });

        } catch (err) {
            console.error("[apple-music] Capture endpoint error:", err);
            return res.status(500).json({ message: "Failed to start Apple Music capture." });
        }
    });

    /**
     * GET /api/applemusic/status/:jobId
     * Returns current recording status.
     */
    app.get("/api/applemusic/status/:jobId", (req, res) => {
        const job = recordingJobs.get(req.params.jobId);
        if (!job) {
            return res.status(404).json({ message: "Recording job not found." });
        }
        return res.json({
            status: job.status,
            elapsed: job.elapsed,
            total: job.total,
            percent: Math.round((job.elapsed / job.total) * 100),
            error: job.error,
        });
    });

    /**
     * ⚠️  DISTRIBUTION WARNING: Serving the completed FLAC file through this
     * endpoint constitutes distribution of copyrighted material. Distribution
     * carries heavier penalties than personal copying under most copyright
     * frameworks, including potential criminal prosecution.
     *
     * GET /api/applemusic/file/:jobId
     * Downloads the completed FLAC file.
     */
    app.get("/api/applemusic/file/:jobId", (req, res) => {
        const job = recordingJobs.get(req.params.jobId);
        if (!job || job.status !== "completed" || !job.filePath) {
            return res.status(404).json({ message: "File not ready or job not found." });
        }

        res.download(job.filePath, job.fileName || "recording.flac", (err) => {
            // Clean up after download
            if (job.filePath && fs.existsSync(job.filePath)) {
                fs.unlinkSync(job.filePath);
            }
            recordingJobs.delete(req.params.jobId);
        });
    });

    /**
     * POST /api/applemusic/cancel/:jobId
     * Cancel an ongoing recording.
     */
    app.post("/api/applemusic/cancel/:jobId", (req, res) => {
        const job = recordingJobs.get(req.params.jobId);
        if (!job) {
            return res.status(404).json({ message: "Recording job not found." });
        }

        cancelRecording(job);
        stopITunesPlayback().catch(() => { });
        recordingJobs.delete(req.params.jobId);

        return res.json({ message: "Recording cancelled." });
    });
}
