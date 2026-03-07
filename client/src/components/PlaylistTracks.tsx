import { TrackItem } from "@shared/routes";
import { Music, Loader2, ListMusic, Download } from "lucide-react";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Button } from "./ui/button";

interface PlaylistTracksProps {
    tracks: TrackItem[];
    playlistTitle: string;
}

export function PlaylistTracks({ tracks, playlistTitle }: PlaylistTracksProps) {
    const { toast } = useToast();
    const [downloadingTracks, setDownloadingTracks] = useState<Set<string>>(new Set());
    const [completedTracks, setCompletedTracks] = useState<Set<string>>(new Set());

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

            // Create target URL (Spotify single track DL actually searches YT)
            // But if it's Spotify, the backend uses `ytsearch1:Artist - Title audio`
            const res = await fetch("/api/download/audio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    url: track.url || "https://open.spotify.com/track/placeholder",
                    format: "mp3", // Default to MP3 320 for playlists
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                }),
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

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                    <ListMusic className="w-5 h-5 text-muted-foreground" />
                    <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                        Playlist Tracks ({tracks.length})
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
                    {completedTracks.size === tracks.length ? "All Downloaded" : "Download All (MP3)"}
                </Button>
            </div>

            <div className="grid gap-2 max-h-[500px] overflow-y-auto pr-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                {tracks.map((track, i) => {
                    const isProcessing = downloadingTracks.has(track.id);
                    const isDone = completedTracks.has(track.id);

                    return (
                        <motion.div
                            key={track.id}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(i * 0.05, 1) }}
                            className="flex items-center justify-between group py-3 px-4 hover:bg-muted/50 transition-colors border border-transparent hover:border-border rounded-lg"
                        >
                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                {track.thumbnail ? (
                                    <img src={track.thumbnail} alt={track.title} className="w-10 h-10 rounded shadow-sm object-cover" />
                                ) : (
                                    <div className="w-10 h-10 rounded bg-muted flex items-center justify-center shadow-sm">
                                        <Music className="w-4 h-4 text-muted-foreground/40" />
                                    </div>
                                )}

                                <div className="flex flex-col truncate pr-4">
                                    <span className="text-sm font-semibold truncate text-foreground">
                                        {track.title}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate">
                                        {track.artist || "Unknown Artist"}
                                    </span>
                                </div>
                            </div>

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
                                    <><Download className="w-3.5 h-3.5" /> MP3</>
                                )}
                            </button>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
