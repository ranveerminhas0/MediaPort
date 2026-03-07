import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Monitor, Music, Check } from "lucide-react";
import { Button } from "./ui/button";

export interface PlaylistConfig {
    mode: "video" | "audio";
    resolution: string;
    audioFormat: string;
}

interface PlaylistConfigModalProps {
    open: boolean;
    onClose: () => void;
    onSave: (config: PlaylistConfig) => void;
    currentConfig: PlaylistConfig;
}

const VIDEO_RESOLUTIONS = [
    { value: "360", label: "360p", desc: "Low" },
    { value: "480", label: "480p", desc: "SD" },
    { value: "720", label: "720p", desc: "HD" },
    { value: "1080", label: "1080p", desc: "Full HD" },
    { value: "1440", label: "1440p", desc: "2K" },
    { value: "2160", label: "2160p", desc: "4K" },
];

const AUDIO_FORMATS = [
    { value: "mp3", label: "MP3", desc: "320kbps" },
    { value: "m4a", label: "M4A", desc: "256kbps" },
    { value: "wav", label: "WAV", desc: "Lossless" },
    { value: "flac", label: "FLAC", desc: "Lossless" },
    { value: "opus", label: "Opus", desc: "256kbps" },
];

export function PlaylistConfigModal({ open, onClose, onSave, currentConfig }: PlaylistConfigModalProps) {
    const [mode, setMode] = useState<"video" | "audio">(currentConfig.mode);
    const [resolution, setResolution] = useState(currentConfig.resolution);
    const [audioFormat, setAudioFormat] = useState(currentConfig.audioFormat);

    const handleSave = () => {
        onSave({ mode, resolution, audioFormat });
        onClose();
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                        className="fixed inset-0 z-50 flex items-center justify-center p-4"
                    >
                        <div className="bg-background border border-border w-full max-w-lg rounded-lg shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                                <h2 className="text-lg font-bold tracking-tight">Download Configuration</h2>
                                <button
                                    onClick={onClose}
                                    className="p-1 hover:bg-muted rounded transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="px-6 py-6 space-y-6">
                                {/* Download Mode Toggle */}
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">
                                        Download Type
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        <button
                                            onClick={() => setMode("video")}
                                            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border text-sm font-semibold transition-all ${mode === "video"
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border text-muted-foreground hover:border-muted-foreground/40"
                                                }`}
                                        >
                                            <Monitor className="w-4 h-4" />
                                            Video (MP4)
                                        </button>
                                        <button
                                            onClick={() => setMode("audio")}
                                            className={`flex items-center justify-center gap-2 py-3 px-4 rounded-lg border text-sm font-semibold transition-all ${mode === "audio"
                                                    ? "border-primary bg-primary/10 text-primary"
                                                    : "border-border text-muted-foreground hover:border-muted-foreground/40"
                                                }`}
                                        >
                                            <Music className="w-4 h-4" />
                                            Audio Only
                                        </button>
                                    </div>
                                </div>

                                {/* Video Quality (shown in video mode) */}
                                {mode === "video" && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                    >
                                        <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">
                                            Video Quality
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {VIDEO_RESOLUTIONS.map(res => (
                                                <button
                                                    key={res.value}
                                                    onClick={() => setResolution(res.value)}
                                                    className={`relative py-2.5 px-3 rounded-lg border text-center transition-all ${resolution === res.value
                                                            ? "border-primary bg-primary/10"
                                                            : "border-border hover:border-muted-foreground/40"
                                                        }`}
                                                >
                                                    <span className={`text-sm font-bold ${resolution === res.value ? "text-primary" : "text-foreground"}`}>
                                                        {res.label}
                                                    </span>
                                                    <span className="block text-[10px] text-muted-foreground mt-0.5">{res.desc}</span>
                                                    {resolution === res.value && (
                                                        <div className="absolute top-1 right-1">
                                                            <Check className="w-3 h-3 text-primary" />
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {/* Audio Format (shown in audio mode) */}
                                {mode === "audio" && (
                                    <motion.div
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        exit={{ opacity: 0, height: 0 }}
                                    >
                                        <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">
                                            Audio Format
                                        </label>
                                        <div className="grid grid-cols-3 gap-2">
                                            {AUDIO_FORMATS.map(fmt => (
                                                <button
                                                    key={fmt.value}
                                                    onClick={() => setAudioFormat(fmt.value)}
                                                    className={`relative py-2.5 px-3 rounded-lg border text-center transition-all ${audioFormat === fmt.value
                                                            ? "border-primary bg-primary/10"
                                                            : "border-border hover:border-muted-foreground/40"
                                                        }`}
                                                >
                                                    <span className={`text-sm font-bold ${audioFormat === fmt.value ? "text-primary" : "text-foreground"}`}>
                                                        {fmt.label}
                                                    </span>
                                                    <span className="block text-[10px] text-muted-foreground mt-0.5">{fmt.desc}</span>
                                                    {audioFormat === fmt.value && (
                                                        <div className="absolute top-1 right-1">
                                                            <Check className="w-3 h-3 text-primary" />
                                                        </div>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}

                                {/* Summary */}
                                <div className="bg-muted/30 rounded-lg px-4 py-3 border border-border">
                                    <p className="text-xs text-muted-foreground">
                                        {mode === "video"
                                            ? `Each video will download as MP4 at up to ${VIDEO_RESOLUTIONS.find(r => r.value === resolution)?.label || resolution + "p"} quality.`
                                            : `Each track will download as ${audioFormat.toUpperCase()} at ${AUDIO_FORMATS.find(f => f.value === audioFormat)?.desc || "best"} quality.`
                                        }
                                    </p>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-border flex justify-end gap-3">
                                <Button variant="outline" size="sm" onClick={onClose}>
                                    Cancel
                                </Button>
                                <Button size="sm" onClick={handleSave} className="gap-2">
                                    <Check className="w-4 h-4" />
                                    Save Configuration
                                </Button>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
