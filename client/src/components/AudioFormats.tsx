import { AudioFormat } from "@shared/routes";
import { Music, Loader2, Disc3 } from "lucide-react";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { AppleMusicProcessingModal } from "./AppleMusicProcessingModal";

interface AudioFormatsProps {
    audioFormats: AudioFormat[];
    title: string;
    url: string;
    artist?: string;
    album?: string;
    year?: string;
    extractor?: string;
    thumbnail?: string;
    duration?: number;
}

export function AudioFormats({ audioFormats, title, url, artist, album, year, extractor, thumbnail, duration }: AudioFormatsProps) {
    const { toast } = useToast();
    const [activeFormatId, setActiveFormatId] = useState<string | null>(null);

    // Apple Music FLAC lossless modal state
    const [appleMusicModalOpen, setAppleMusicModalOpen] = useState(false);

    const checkStatus = async (jobId: string) => {
        while (true) {
            const res = await fetch(`/api/download/status/${jobId}`);
            if (!res.ok) throw new Error("Failed to check status");
            const data = await res.json();

            if (data.status === "completed") {
                return true;
            } else if (data.status === "error") {
                throw new Error(data.error || "Unknown error during download");
            }

            // Wait before polling again
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    };

    const downloadMutation = useMutation({
        mutationFn: async ({ format }: { format: string }) => {
            setActiveFormatId(format);

            const res = await fetch("/api/download/audio", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url, format, title, artist, album, year }),
            });
            if (!res.ok) throw new Error("Failed to start audio processing");

            const { jobId } = await res.json();

            toast({
                title: "Processing Audio",
                description: "Downloading and converting your audio... this could take a moment.",
            });

            await checkStatus(jobId);

            window.location.href = `/api/download/file/${jobId}`;

            return { success: true };
        },
        onSuccess: () => {
            toast({
                title: "Success",
                description: "Your audio file is ready and downloading.",
            });
        },
        onError: (error) => {
            toast({
                title: "Download Failed",
                description: error.message,
                variant: "destructive",
            });
        },
        onSettled: () => {
            setActiveFormatId(null);
        }
    });

    const handleDownload = (format: AudioFormat) => {
        // If this is the Apple Music FLAC lossless option, open the special modal
        if (format.format_id === "apple_flac_lossless") {
            setAppleMusicModalOpen(true);
            return;
        }

        downloadMutation.mutate({ format: format.format_id });
    };

    // Format quality colors (minimalist professional style)
    const getQualityAccent = (quality: string) => {
        if (quality.includes("320")) return "bg-emerald-500/60";
        if (quality.includes("256")) return "bg-blue-500/60";
        if (quality.includes("Lossless")) return "bg-amber-500/80";
        return "bg-muted-foreground/30";
    };

    // Check if this is Apple Music
    const isAppleMusic = extractor === "apple_music";

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <Disc3 className="w-5 h-5 text-muted-foreground" />
                <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                    Audio Formats
                </h3>
            </div>

            <p className="text-xs text-muted-foreground -mt-2">
                {isAppleMusic
                    ? "Select your preferred format. High-Resolution records directly from Apple Music in real-time."
                    : "Select your preferred audio format. High-fidelity streams available."
                }
            </p>

            <div className="grid gap-1.5">
                {audioFormats
                    .filter(af => !isAppleMusic || af.format_id === "apple_flac_lossless")
                    .map((af, i) => {
                        const isProcessing = activeFormatId === af.format_id;
                        const isAppleFLAC = af.format_id === "apple_flac_lossless";
                        return (
                            <motion.div
                                key={`${af.format_id}-${i}`}
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className={`flex items-center justify-between group py-3 px-5 transition-all hover:bg-muted/30 border-l-2 border-transparent hover:border-primary/20 ${isAppleFLAC ? "bg-card/30" : "bg-card/30"
                                    }`}
                            >
                                <div className="flex items-center gap-6">
                                    <div className="flex flex-col">
                                        <span className={`text-[10px] uppercase tracking-[0.2em] font-bold mb-0.5 ${isAppleFLAC ? "text-foreground/50" : "text-muted-foreground/50"}`}>
                                            Format
                                        </span>
                                        <span className={`text-sm font-black uppercase tracking-tight ${isAppleFLAC ? "text-foreground" : "text-foreground"}`}>
                                            {isAppleFLAC ? "FLAC ✦" : af.ext}
                                        </span>
                                    </div>

                                    <div className="h-8 w-[1px] bg-border/50 mx-1" />

                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground/50 mb-0.5">
                                            Quality
                                        </span>
                                        <div className="flex items-center gap-2">
                                            <div className={`w-1 h-3 rounded-full ${isAppleFLAC ? "bg-primary/80" : getQualityAccent(af.quality)}`} />
                                            <span className="text-xs font-semibold tracking-wide text-foreground/80">
                                                {af.quality}
                                            </span>
                                            {isAppleFLAC && (
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold ml-1">
                                                    RECORD
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleDownload(af)}
                                    disabled={isProcessing || downloadMutation.isPending}
                                    className={`relative px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all overflow-hidden ${isAppleFLAC
                                        ? "text-primary hover:bg-primary/10"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
                                        }`}
                                >
                                    <span className="relative z-10">
                                        {isProcessing ? (
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="w-3 h-3 animate-spin" />
                                                BUSY
                                            </div>
                                        ) : (
                                            "Get"
                                        )}
                                    </span>
                                </button>
                            </motion.div>
                        );
                    })}
            </div>

            {/* Apple Music FLAC Lossless Processing Modal */}
            <AppleMusicProcessingModal
                open={appleMusicModalOpen}
                onClose={() => setAppleMusicModalOpen(false)}
                url={url}
                title={title}
                artist={artist}
                album={album}
                thumbnail={thumbnail}
                durationSec={duration}
            />
        </div>
    );
}
