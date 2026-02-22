import { Format } from "@shared/routes";
import { Download, Film, Music, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";

interface FormatListProps {
  formats: Format[];
  title: string;
}

export function FormatList({ formats, title }: FormatListProps) {
  const { toast } = useToast();
  const [activeFormatId, setActiveFormatId] = useState<string | null>(null);
  
  const videoFormats = formats.filter(f => f.vcodec && f.vcodec !== 'none').sort((a, b) => (b.filesize || 0) - (a.filesize || 0));
  const audioFormats = formats.filter(f => !f.vcodec || f.vcodec === 'none').sort((a, b) => (b.filesize || 0) - (a.filesize || 0));

  const downloadMutation = useMutation({
    mutationFn: async ({ videoUrl, audioUrl, formatId }: { videoUrl: string; audioUrl: string; formatId: string }) => {
      setActiveFormatId(formatId);
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrl, audioUrl, title }),
      });
      if (!res.ok) throw new Error("Failed to process video");
      
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      return { success: true };
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Your merged video has been downloaded.",
      });
    },
    onError: (error) => {
      toast({
        title: "Merge Failed",
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
        downloadMutation.mutate({ videoUrl: format.url, audioUrl: bestAudio.url, formatId: format.format_id });
        return;
      }
    }
    
    // Fallback or audio-only: direct download link
    window.open(format.url, '_blank');
  };

  return (
    <div className="space-y-12">
      {videoFormats.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium uppercase tracking-widest text-slate-400">Video</h3>
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
                    <Film className="w-4 h-4 text-slate-300" />
                    <span className="text-sm font-medium text-slate-600">
                      {f.resolution} {f.ext.toUpperCase()}
                    </span>
                    <span className="text-xs text-slate-400">{formatSize(f.filesize)}</span>
                  </div>
                  <button 
                    onClick={() => handleDownload(f)}
                    disabled={isProcessing}
                    className="flex items-center gap-2 text-xs font-semibold uppercase tracking-tighter text-slate-400 hover:text-slate-900 transition-colors disabled:opacity-50"
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
          <h3 className="text-sm font-medium uppercase tracking-widest text-slate-400">Audio</h3>
          <div className="grid gap-2">
            {audioFormats.slice(0, 3).map((f, i) => (
              <motion.div 
                key={`${f.format_id}-${i}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between group py-2"
              >
                <div className="flex items-center gap-4">
                  <Music className="w-4 h-4 text-slate-300" />
                  <span className="text-sm font-medium text-slate-600">
                    {f.ext.toUpperCase()}
                  </span>
                  <span className="text-xs text-slate-400">{formatSize(f.filesize)}</span>
                </div>
                <button 
                  onClick={() => handleDownload(f)}
                  className="text-xs font-semibold uppercase tracking-tighter text-slate-400 hover:text-slate-900 transition-colors"
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
