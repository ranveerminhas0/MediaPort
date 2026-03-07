import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check } from "lucide-react";
import { Button } from "./ui/button";

export interface AppleMusicConfig {
    audioFormat: string;
}

interface AppleMusicConfigModalProps {
    open: boolean;
    onClose: () => void;
    onSave: (config: AppleMusicConfig) => void;
    currentConfig: AppleMusicConfig;
}

const AUDIO_FORMATS = [
    { value: "wav", label: "WAV", desc: "Lossless (~9000kbps)" },
    { value: "mp3", label: "MP3", desc: "320kbps (High Quality)" },
    { value: "m4a", label: "M4A", desc: "256kbps (Standard)" },
    { value: "opus", label: "Opus", desc: "256kbps" },
];

export function AppleMusicConfigModal({ open, onClose, onSave, currentConfig }: AppleMusicConfigModalProps) {
    // Determine initial format. Default to 'wav' if not in standard list or if it's 'flac' (which is locked)
    const initialFormat = AUDIO_FORMATS.find(f => f.value === currentConfig.audioFormat) ? currentConfig.audioFormat : "wav";
    const [audioFormat, setAudioFormat] = useState(initialFormat);

    const handleSave = () => {
        onSave({ audioFormat });
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
                                <h2 className="text-lg font-bold tracking-tight">Apple Music Configuration</h2>
                                <button
                                    onClick={onClose}
                                    className="p-1 hover:bg-muted rounded transition-colors"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="px-6 py-6 space-y-6">
                                {/* Informational Banner */}
                                <div className="bg-primary/5 text-primary rounded-lg px-4 py-3 border border-primary/20 text-sm">
                                    <p>
                                        <strong>Information:</strong> Apple Music playlists are fetched at the highest available studio quality from matching streams to ensure fast batch processing.
                                    </p>
                                </div>

                                {/* Audio Format */}
                                <div>
                                    <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">
                                        Audio Format
                                    </label>
                                    <div className="grid grid-cols-2 gap-2">
                                        {AUDIO_FORMATS.map(fmt => (
                                            <button
                                                key={fmt.value}
                                                onClick={() => setAudioFormat(fmt.value)}
                                                className={`relative py-3 px-4 rounded-lg border text-left transition-all flex flex-col items-start ${audioFormat === fmt.value
                                                    ? "border-primary bg-primary/10"
                                                    : "border-border hover:border-muted-foreground/40 text-muted-foreground"
                                                    }`}
                                            >
                                                <span className={`text-sm font-bold ${audioFormat === fmt.value ? "text-primary" : "text-foreground"}`}>
                                                    {fmt.label}
                                                </span>
                                                <span className="text-[11px] mt-0.5 opacity-80">{fmt.desc}</span>
                                                {audioFormat === fmt.value && (
                                                    <div className="absolute top-3 right-3">
                                                        <Check className="w-4 h-4 text-primary" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}

                                        {/* Locked FLAC Option */}
                                        <div
                                            className="relative py-3 px-4 rounded-lg border border-border/50 bg-muted/20 text-left opacity-60 cursor-not-allowed flex flex-col items-start col-span-2 mt-2"
                                            title="Real-time capture is only available for single track URLs due to length constraints."
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <span className="text-sm font-bold text-foreground">
                                                    FLAC ✦ (Real-Time Lossless)
                                                </span>
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground px-2 py-0.5 rounded border border-border/50">
                                                    Locked
                                                </span>
                                            </div>
                                            <span className="text-[11px] mt-1 text-muted-foreground">
                                                Real-time capture is only available for single track URLs due to length constraints.
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Footer */}
                            <div className="px-6 py-4 border-t border-border flex justify-end gap-3 bg-muted/10">
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
