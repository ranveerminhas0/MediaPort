import { AudioFormat } from "@shared/routes";
import { Music, Loader2, Disc3 } from "lucide-react";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface AudioFormatsProps {
    audioFormats: AudioFormat[];
    title: string;
    url: string;
    artist?: string;
    album?: string;
    year?: string;
}

export function AudioFormats({ audioFormats, title, url, artist, album, year }: AudioFormatsProps) {
    const { toast } = useToast();
    const [activeFormatId, setActiveFormatId] = useState<string | null>(null);

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
        downloadMutation.mutate({ format: format.format_id });
    };

    // Format quality badge colors
    const getQualityColor = (quality: string) => {
        if (quality.includes("320")) return "text-emerald-500 bg-emerald-500/10";
        if (quality.includes("256")) return "text-blue-500 bg-blue-500/10";
        if (quality.includes("Lossless")) return "text-purple-500 bg-purple-500/10";
        return "text-muted-foreground bg-muted";
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <Disc3 className="w-5 h-5 text-muted-foreground" />
                <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
                    Audio Formats
                </h3>
            </div>

            <p className="text-xs text-muted-foreground -mt-2">
                Select your preferred audio format. Max quality: 320kbps.
            </p>

            <div className="grid gap-2">
                {audioFormats.map((af, i) => {
                    const isProcessing = activeFormatId === af.format_id;
                    return (
                        <motion.div
                            key={`${af.format_id}-${i}`}
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex items-center justify-between group py-3 px-4 hover:bg-muted/50 transition-colors"
                        >
                            <div className="flex items-center gap-4">
                                <Music className="w-4 h-4 text-muted-foreground/40" />
                                <span className="text-sm font-semibold text-foreground uppercase tracking-wide">
                                    {af.ext}
                                </span>
                                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${getQualityColor(af.quality)}`}>
                                    {af.quality}
                                </span>
                            </div>
                            <button
                                onClick={() => handleDownload(af)}
                                disabled={isProcessing || downloadMutation.isPending}
                                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-tighter text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Processing...
                                    </>
                                ) : (
                                    "Get"
                                )}
                            </button>
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
