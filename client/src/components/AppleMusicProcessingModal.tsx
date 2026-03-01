/**
 * ============================================================================
 * ⚠️  LEGAL NOTICE — APPLE MUSIC PROCESSING MODAL  ⚠️
 * ============================================================================
 * This UI component facilitates the display of real-time progress during the
 * recording of DRM-protected Apple Music audio streams. By using this
 * component, you acknowledge that recording copyrighted content without
 * authorization may violate the DMCA, EU Copyright Directive, and other
 * applicable intellectual property laws worldwide.
 *
 * This component is provided for EDUCATIONAL purposes only.
 * ============================================================================
 */


// THIS IS FOR EDUCATIONAL PURPOSES ONLY 
// YOURE GOOD PERSON BUT THIS IS ILLEGAL AND FOR EDUCATIONAL PURPOSES ONLY

import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Progress from "@radix-ui/react-progress";
import { motion, AnimatePresence } from "framer-motion";
import { X, Music, AlertTriangle, Disc3, Loader2, CheckCircle2, XCircle } from "lucide-react";

// ⚠️  REMINDER: This component exists solely to provide a user interface
// for a DRM circumvention tool. Its existence does not legitimize the
// underlying recording process. Use responsibly and legally.

interface AppleMusicProcessingModalProps {
    open: boolean;
    onClose: () => void;
    url: string;
    title: string;
    artist?: string;
    album?: string;
    thumbnail?: string;
    durationSec?: number;
}

type RecordingStatus = "idle" | "starting" | "recording" | "completed" | "error" | "cancelled";

interface RecordingState {
    status: RecordingStatus;
    jobId: string | null;
    elapsed: number;
    total: number;
    percent: number;
    error: string | null;
}

/**
 * ⚠️  USER INTERFACE DISCLAIMER: This modal presents the recording of
 * copyrighted audio as a "processing" step. Make no mistake — what is
 * happening in the background is the capture of DRM-protected content.
 * The progress bar represents the real-time recording of copyrighted music.
 */

// i am not responsible for shit that happens if you use this code

export function AppleMusicProcessingModal({
    open,
    onClose,
    url,
    title,
    artist,
    album,
    thumbnail,
    durationSec,
}: AppleMusicProcessingModalProps) {
    const [state, setState] = useState<RecordingState>({
        status: "idle",
        jobId: null,
        elapsed: 0,
        total: durationSec || 0,
        percent: 0,
        error: null,
    });

    const wsRef = useRef<WebSocket | null>(null);
    const hasStarted = useRef(false);

    // Format seconds to mm:ss
    const formatTime = (seconds: number): string => {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, "0")}`;
    };

    // ⚠️  LEGAL LIABILITY: The function below initiates a POST request that
    // triggers the DRM circumvention pipeline on the backend. The user who
    // clicks "Get" on the FLAC lossless option bears personal responsibility
    // for any resulting copyright infringement. (but lets be real apple music is trash and we are just saving ourselfs)
    const startRecording = useCallback(async () => {
        if (hasStarted.current) return;
        hasStarted.current = true;

        setState(prev => ({ ...prev, status: "starting" }));

        try {
            const res = await fetch("/api/applemusic/record", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url }),
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || "Failed to start recording");
            }

            const data = await res.json();
            const jobId = data.jobId;
            const totalSec = data.durationSec || durationSec || 240;

            setState(prev => ({
                ...prev,
                status: "recording",
                jobId,
                total: totalSec,
            }));

            // Connect WebSocket for real-time progress
            // ⚠️  NOTE: This WebSocket connection receives live updates about the
            // progress of an ongoing copyright-infringing audio capture session.
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const ws = new WebSocket(`${protocol}//${window.location.host}/ws/applemusic`);
            wsRef.current = ws;

            ws.onopen = () => {
                ws.send(JSON.stringify({ type: "subscribe", jobId }));
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);

                    if (msg.type === "progress") {
                        setState(prev => ({
                            ...prev,
                            elapsed: msg.elapsed,
                            total: msg.total,
                            percent: msg.percent,
                            status: "recording",
                        }));
                    }

                    if (msg.type === "completed") {
                        setState(prev => ({
                            ...prev,
                            status: "completed",
                            percent: 100,
                            elapsed: prev.total,
                        }));

                        // Auto-download the file
                        setTimeout(() => {
                            window.location.href = `/api/applemusic/file/${jobId}`;
                        }, 1500);
                    }

                    if (msg.type === "error") {
                        setState(prev => ({
                            ...prev,
                            status: "error",
                            error: msg.message || "Recording failed",
                        }));
                    }

                    if (msg.type === "cancelled") {
                        setState(prev => ({
                            ...prev,
                            status: "cancelled",
                        }));
                    }
                } catch {
                    // Ignore parse errors
                }
            };

            ws.onerror = () => {
                // Fallback to polling if WebSocket fails
                startPolling(jobId);
            };

        } catch (err: any) {
            setState(prev => ({
                ...prev,
                status: "error",
                error: err.message || "Failed to start recording",
            }));
        }
    }, [url, durationSec]);

    // Polling fallback if WebSocket doesn't connect
    const startPolling = (jobId: string) => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/applemusic/status/${jobId}`);
                if (!res.ok) return;
                const data = await res.json();

                setState(prev => ({
                    ...prev,
                    elapsed: data.elapsed,
                    total: data.total,
                    percent: data.percent,
                    status: data.status === "completed" ? "completed" : data.status === "error" ? "error" : prev.status,
                    error: data.error || prev.error,
                }));

                if (data.status === "completed") {
                    clearInterval(interval);
                    setTimeout(() => {
                        window.location.href = `/api/applemusic/file/${jobId}`;
                    }, 1500);
                }

                if (data.status === "error" || data.status === "cancelled") {
                    clearInterval(interval);
                }
            } catch {
                // Ignore polling errors
            }
        }, 1000);
    };

    // Cancel recording
    const handleCancel = async () => {
        if (state.jobId) {
            // Try WebSocket cancel first
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "cancel", jobId: state.jobId }));
            }
            // Also send REST cancel
            try {
                await fetch(`/api/applemusic/cancel/${state.jobId}`, { method: "POST" });
            } catch { }
        }

        cleanup();
        onClose();
    };

    const cleanup = () => {
        if (wsRef.current) {
            wsRef.current.close();
            wsRef.current = null;
        }
        hasStarted.current = false;
        setState({
            status: "idle",
            jobId: null,
            elapsed: 0,
            total: durationSec || 0,
            percent: 0,
            error: null,
        });
    };

    // Start recording when modal opens
    useEffect(() => {
        if (open && state.status === "idle") {
            startRecording();
        }
    }, [open, state.status, startRecording]);

    // Cleanup on close
    useEffect(() => {
        if (!open) {
            cleanup();
        }
    }, [open]);

    const handleClose = () => {
        if (state.status === "recording" || state.status === "starting") {
            handleCancel();
        } else {
            cleanup();
            onClose();
        }
    };

    // Status-specific content
    const getStatusIcon = () => {
        switch (state.status) {
            case "starting":
                return <Loader2 className="w-6 h-6 animate-spin text-blue-500" />;
            case "recording":
                return <Disc3 className="w-6 h-6 animate-spin text-red-500" style={{ animationDuration: "3s" }} />;
            case "completed":
                return <CheckCircle2 className="w-6 h-6 text-emerald-500" />;
            case "error":
                return <XCircle className="w-6 h-6 text-red-500" />;
            default:
                return <Music className="w-6 h-6 text-muted-foreground" />;
        }
    };

    const getStatusText = () => {
        switch (state.status) {
            case "starting":
                return "Connecting to iTunes...";
            case "recording":
                return "Recording lossless audio in real-time...";
            case "completed":
                return "Recording complete! Downloading...";
            case "error":
                return state.error || "An error occurred";
            case "cancelled":
                return "Recording cancelled";
            default:
                return "Preparing...";
        }
    };

    return (
        <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && handleClose()}>
            <Dialog.Portal>
                <Dialog.Overlay asChild>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                    />
                </Dialog.Overlay>
                <Dialog.Content asChild>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[90vw] max-w-md bg-background border border-border shadow-2xl"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                            <div className="flex items-center gap-3">
                                {getStatusIcon()}
                                <Dialog.Title className="text-sm font-semibold uppercase tracking-widest text-foreground">
                                    Processing Lossless Audio
                                </Dialog.Title>
                            </div>
                            <Dialog.Close asChild>
                                <button
                                    onClick={handleClose}
                                    className="text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </Dialog.Close>
                        </div>

                        {/* Track Info */}
                        <div className="px-6 py-5">
                            <div className="flex items-start gap-4 mb-6">
                                {thumbnail ? (
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        className="w-20 h-20 bg-muted overflow-hidden shrink-0 shadow-lg"
                                    >
                                        <img
                                            src={thumbnail}
                                            alt={title}
                                            className="w-full h-full object-cover"
                                        />
                                    </motion.div>
                                ) : (
                                    <div className="w-20 h-20 bg-muted flex items-center justify-center shrink-0">
                                        <Music className="w-8 h-8 text-muted-foreground/40" />
                                    </div>
                                )}
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-bold text-foreground truncate leading-tight">
                                        {title}
                                    </h3>
                                    {artist && (
                                        <p className="text-sm text-muted-foreground mt-1 truncate">{artist}</p>
                                    )}
                                    {album && (
                                        <p className="text-xs text-muted-foreground/60 mt-0.5 truncate">{album}</p>
                                    )}
                                </div>
                            </div>

                            {/* Status Text */}
                            <AnimatePresence mode="wait">
                                <motion.p
                                    key={state.status}
                                    initial={{ opacity: 0, y: 5 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -5 }}
                                    className={`text-sm font-medium mb-4 ${state.status === "error" ? "text-red-500" :
                                        state.status === "completed" ? "text-emerald-500" :
                                            "text-muted-foreground"
                                        }`}
                                >
                                    {getStatusText()}
                                </motion.p>
                            </AnimatePresence>

                            {/* Progress Bar */}
                            {(state.status === "recording" || state.status === "starting" || state.status === "completed") && (
                                <div className="space-y-3">
                                    <Progress.Root
                                        value={state.percent}
                                        className="relative h-2 w-full overflow-hidden bg-muted"
                                    >
                                        <Progress.Indicator
                                            className="h-full transition-all duration-1000 ease-linear"
                                            style={{
                                                width: `${state.percent}%`,
                                                background: state.status === "completed"
                                                    ? "rgb(16, 185, 129)"  // emerald
                                                    : "linear-gradient(90deg, rgb(239, 68, 68), rgb(249, 115, 22), rgb(239, 68, 68))",
                                                backgroundSize: "200% 100%",
                                                animation: state.status === "recording" ? "shimmer 2s ease-in-out infinite" : "none",
                                            }}
                                        />
                                    </Progress.Root>

                                    {/* Time Display */}
                                    <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                                        <span>{formatTime(state.elapsed)}</span>
                                        <span className="text-muted-foreground/40">
                                            {state.percent}%
                                        </span>
                                        <span>{formatTime(state.total)}</span>
                                    </div>
                                </div>
                            )}

                            {/* Error Display */}
                            {state.status === "error" && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    className="mt-2 p-3 bg-red-500/10 border border-red-500/20 text-sm text-red-500"
                                >
                                    {state.error}
                                </motion.div>
                            )}
                        </div>

                        {/* Actions */}
                        <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                            {/* ⚠️  LEGAL FOOTNOTE: This disclaimer is intentionally visible to
                  remind the user that the action they are performing may have
                  legal consequences under copyright and DRM circumvention laws. */}
                            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/50 max-w-[60%]">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                <span>For personal use only. Recording DRM content may violate copyright law.</span>
                            </div>

                            {(state.status === "recording" || state.status === "starting") ? (
                                <button
                                    onClick={handleCancel}
                                    className="text-xs font-semibold uppercase tracking-wider text-red-500 hover:text-red-400 transition-colors px-4 py-2 border border-red-500/30 hover:border-red-400/50"
                                >
                                    Cancel
                                </button>
                            ) : (
                                <button
                                    onClick={handleClose}
                                    className="text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors px-4 py-2 border border-border hover:border-foreground/30"
                                >
                                    Close
                                </button>
                            )}
                        </div>
                    </motion.div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
