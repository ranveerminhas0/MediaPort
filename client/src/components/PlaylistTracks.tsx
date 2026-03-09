import { TrackItem } from "@shared/routes";
import { Music, Loader2, ListMusic, Download, Film } from "lucide-react";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Button } from "./ui/button";
import type { PlaylistConfig } from "./PlaylistConfigModal";
import type { AppleMusicConfig } from "./AppleMusicConfigModal";

interface PlaylistTracksProps {
    tracks: TrackItem[];
    playlistTitle: string;
    extractor?: string;
    playlistConfig?: PlaylistConfig;
    appleMusicConfig?: AppleMusicConfig;
}

export function PlaylistTracks({ tracks, playlistTitle, extractor, playlistConfig, appleMusicConfig }: PlaylistTracksProps) {
    const { toast } = useToast();
    const [downloadingTracks, setDownloadingTracks] = useState<Set<string>>(new Set());
    const [completedTracks, setCompletedTracks] = useState<Set<string>>(new Set());

    const isYouTube = extractor === "youtube";
    const isAppleMusic = extractor === "apple_music_playlist";
    const config = playlistConfig || { mode: "video", resolution: "1080", audioFormat: "mp3" };

    const checkStatus = async (jobId: string, trackId: string) => {
        while (true) {
            const res = await fetch(`/api/download/status/${jobId}`);
            if (!res.ok) throw new Error("Failed to check status");
            const data = await res.json();

            if (data.status === "completed") {
                setDownloadingTracks(prev => {
                    const next = new Set(prev);
                    next.delete(trackId);
                    return next;
                });
                setCompletedTracks(prev => new Set(prev).add(trackId));
                return true;
            } else if (data.status === "error") {
                setDownloadingTracks(prev => {
                    const next = new Set(prev);
                    next.delete(trackId);
                    return next;
                });
                throw new Error(data.error || "Unknown error during download");
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    };

    const downloadMutation = useMutation({
        mutationFn: async ({ track }: { track: TrackItem }) => {
            setDownloadingTracks(prev => new Set(prev).add(track.id));

            let endpoint: string;
            let body: Record<string, any>;

            if (isYouTube) {
                // YouTube playlist: use the video-track endpoint with config
                endpoint = "/api/download/video-track";
                if (config.mode === "audio") {
                    body = {
                        url: track.url,
                        audioFormat: config.audioFormat,
                        title: track.title,
                        duration: track.duration,
                    };
                } else {
                    body = {
                        url: track.url,
                        resolution: config.resolution,
                        title: track.title,
                        duration: track.duration,
                    };
                }
            } else if (isAppleMusic) {
                // Apple Music playlist: fallback to audio endpoint search
                const finalFormat = appleMusicConfig?.audioFormat || "wav";

                endpoint = "/api/download/audio";
                body = {
                    url: track.url,
                    format: finalFormat,
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    duration: track.duration,
                };
            } else {
                // Spotify playlist: use the audio endpoint
                endpoint = "/api/download/audio";
                body = {
                    url: track.url || "https://open.spotify.com/track/placeholder",
                    format: "mp3",
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    duration: track.duration,
                };
            }

            const res = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) throw new Error(`Failed to start download for ${track.title}`);

            const { jobId } = await res.json();

            toast({
                title: "Processing Track",
                description: `Downloading ${track.title}...`,
            });

            await checkStatus(jobId, track.id);

            // Trigger actual download
            const link = document.createElement("a");
            link.href = `/api/download/file/${jobId}`;
            link.download = "";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            return { success: true };
        },
        onError: (error, variables) => {
            toast({
                title: "Download Failed",
                description: `Failed to download ${variables.track.title}: ${error.message}`,
                variant: "destructive",
            });
            setDownloadingTracks(prev => {
                const next = new Set(prev);
                next.delete(variables.track.id);
                return next;
            });
        }
    });

    const handleDownloadTrack = (track: TrackItem) => {
        if (downloadingTracks.has(track.id) || completedTracks.has(track.id)) return;
        downloadMutation.mutate({ track });
    };

    const handleDownloadAll = async () => {
        // Download sequentially to avoid overwhelming the server / IP blocks
        for (const track of tracks) {
            if (!completedTracks.has(track.id) && !downloadingTracks.has(track.id)) {
                try {
                    await downloadMutation.mutateAsync({ track });
                } catch (e) {
                    console.error("Batch download error for track", track.title, e);
                }
            }
        }
    };

    // Determine button label based on extractor and config
    const getFormatLabel = () => {
        if (isAppleMusic) {
            return appleMusicConfig?.audioFormat.toUpperCase() || "WAV";
        }
        if (isYouTube) {
            return config.mode === "audio" ? config.audioFormat.toUpperCase() : "MP4";
        }
        return "MP3";
    };

    const formatLabel = getFormatLabel();

    // Format duration helper
    const formatDuration = (seconds?: number) => {
        if (!seconds) return null;
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <ListMusic className="w-5 h-5 text-muted-foreground" />
                    <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                        {isYouTube ? "Playlist Videos" : "Playlist Tracks"} ({tracks.length})
                    </h3>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs uppercase tracking-wider font-semibold"
                    onClick={handleDownloadAll}
                    disabled={downloadingTracks.size > 0 || completedTracks.size === tracks.length}
                >
                    <Download className="w-4 h-4" />
                    {completedTracks.size === tracks.length ? "All Downloaded" : `Download All (${formatLabel})`}
                </Button>
            </div>

            <div className="grid gap-2 max-h-[500px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {tracks.map((track, i) => {
                    const isProcessing = downloadingTracks.has(track.id);
                    const isDone = completedTracks.has(track.id);
                    const duration = formatDuration(track.duration);

                    return (
                        <motion.div
                            key={track.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(i * 0.05, 1) }}
                            className="flex items-center gap-3 group py-3 px-4 hover:bg-muted/50 transition-colors border border-transparent hover:border-border rounded-lg overflow-hidden"
                        >
                            {/* Thumbnail — fixed width */}
                            <div className="flex-shrink-0">
                                {track.thumbnail ? (
                                    <img src={track.thumbnail} alt={track.title} className={`rounded shadow-sm object-cover ${isYouTube ? 'w-16 h-10' : 'w-10 h-10'}`} />
                                ) : (
                                    <div className={`rounded bg-muted flex items-center justify-center shadow-sm ${isYouTube ? 'w-16 h-10' : 'w-10 h-10'}`}>
                                        {isYouTube ? (
                                            <Film className="w-4 h-4 text-muted-foreground/40" />
                                        ) : (
                                            <Music className="w-4 h-4 text-muted-foreground/40" />
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Title + artist — takes remaining space, truncates */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate text-foreground">
                                    {track.title}
                                </p>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground truncate">
                                        {track.artist || "Unknown Artist"}
                                    </span>
                                    {duration && (
                                        <span className="text-xs text-muted-foreground/60 flex-shrink-0">
                                            {duration}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Download button — always visible */}
                            <button
                                onClick={() => handleDownloadTrack(track)}
                                disabled={isProcessing || isDone}
                                className={`flex-shrink-0 flex items-center gap-2 text-xs font-semibold uppercase tracking-tighter transition-colors px-3 py-1.5 rounded-full
                                    ${isDone
                                        ? "bg-emerald-500/10 text-emerald-500 cursor-default"
                                        : isProcessing
                                            ? "bg-muted text-muted-foreground cursor-wait"
                                            : "bg-primary/5 text-primary hover:bg-primary hover:text-primary-foreground"
                                    }`}
                            >
                                {isProcessing ? (
                                    <><Loader2 className="w-3 h-3 animate-spin" /> Fetching</>
                                ) : isDone ? (
                                    "Done"
                                ) : (
                                    <><Download className="w-3.5 h-3.5" /> {formatLabel}</>
                                )}
                            </button>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
