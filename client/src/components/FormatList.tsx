import { Format } from "@shared/routes";
import { Download, Film, Music, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface FormatListProps {
  formats: Format[];
  title: string;
  url: string;
}

export function FormatList({ formats, title, url }: FormatListProps) {
  const { toast } = useToast();
  const [activeFormatId, setActiveFormatId] = useState<string | null>(null);

  const videoFormats = formats.filter(f => f.vcodec && f.vcodec !== 'none').sort((a, b) => (b.filesize || 0) - (a.filesize || 0));
  const audioFormats = formats.filter(f => !f.vcodec || f.vcodec === 'none').sort((a, b) => (b.filesize || 0) - (a.filesize || 0));

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
    mutationFn: async ({ formatId, combinedId }: { formatId: string; combinedId: string }) => {
      setActiveFormatId(formatId);
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, formatId: combinedId, title }),
      });
      if (!res.ok) throw new Error("Failed to start processing");

      const { jobId } = await res.json();

      toast({
        title: "Processing Started",
        description: "Downloading and merging your media on the server... this could take a moment.",
      });

      await checkStatus(jobId);

      window.location.href = `/api/download/file/${jobId}`;

      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your media is ready and downloading.",
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

  const formatSize = (bytes?: number) => {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const handleDownload = (format: Format) => {
    const isVideoOnly = format.vcodec && format.vcodec !== 'none' && (!format.acodec || format.acodec === 'none');

    if (isVideoOnly) {
      // Find the best audio format to merge with
      const bestAudio = audioFormats[0];
      if (bestAudio) {
        downloadMutation.mutate({ formatId: format.format_id, combinedId: `${format.format_id}+${bestAudio.format_id}` });
        return;
      }
    }

    // Fallback or audio-only
    downloadMutation.mutate({ formatId: format.format_id, combinedId: format.format_id });
  };

  return (
    <div className="space-y-12">
      {videoFormats.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Video</h3>
          <div className="grid gap-2">
            {videoFormats.slice(0, 5).map((f, i) => {
              const isProcessing = activeFormatId === f.format_id;
              return (
                <motion.div
                  key={`${f.format_id}-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-between group py-2"
                >
                  <div className="flex items-center gap-4">
                    <Film className="w-4 h-4 text-muted-foreground/40" />
                    <span className="text-sm font-medium text-foreground">
                      {f.resolution} {f.ext.toUpperCase()}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatSize(f.filesize)}</span>
                  </div>
                  <button
                    onClick={() => handleDownload(f)}
                    disabled={isProcessing}
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
      )}

      {audioFormats.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">Audio</h3>
          <div className="grid gap-2">
            {audioFormats.slice(0, 3).map((f, i) => (
              <motion.div
                key={`${f.format_id}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between group py-2"
              >
                <div className="flex items-center gap-4">
                  <Music className="w-4 h-4 text-muted-foreground/40" />
                  <span className="text-sm font-medium text-foreground">
                    {f.ext.toUpperCase()}
                  </span>
                  <span className="text-xs text-muted-foreground">{formatSize(f.filesize)}</span>
                </div>
                <button
                  onClick={() => handleDownload(f)}
                  className="text-xs font-semibold uppercase tracking-tighter text-muted-foreground hover:text-primary transition-colors"
                >
                  Get
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
