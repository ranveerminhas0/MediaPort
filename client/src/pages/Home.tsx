import { useState, useEffect } from "react";
import { useExtract } from "@/hooks/use-downloader";
import { FormatList } from "@/components/FormatList";
import { ImageGallery } from "@/components/ImageGallery";
import { AudioFormats } from "@/components/AudioFormats";
import { PlaylistTracks } from "@/components/PlaylistTracks";
import { PlaylistConfigModal } from "@/components/PlaylistConfigModal";
import type { PlaylistConfig } from "@/components/PlaylistConfigModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Loader2, Download, Search, Settings } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [url, setUrl] = useState("");
  const { mutate: extract, data: result, isPending, reset } = useExtract();

  // YouTube playlist config state
  const [playlistConfig, setPlaylistConfig] = useState<PlaylistConfig>({
    mode: "video",
    resolution: "1080",
    audioFormat: "mp3",
  });
  const [configModalOpen, setConfigModalOpen] = useState(false);

  const handleExtract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    extract({ url });
  };

  const handleReset = () => {
    setUrl("");
    reset();
  };

  const isYouTubePlaylist = result?.mediaType === "playlist" && result?.extractor === "youtube";

  // Automatically switch config mode based on URL
  useEffect(() => {
    if (result && isYouTubePlaylist) {
      if (url.includes("music.youtube.com") || url.includes("music.youtube")) {
        setPlaylistConfig(prev => ({ ...prev, mode: "audio" }));
      } else {
        setPlaylistConfig(prev => ({ ...prev, mode: "video" }));
      }
    }
  }, [result, isYouTubePlaylist, url]);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary selection:text-primary-foreground">
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b border-border bg-background/80 backdrop-blur-md sticky top-0 z-50"
      >
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 font-semibold text-xl tracking-tight">
            <div className="w-10 h-10 bg-primary flex items-center justify-center">
              <Download className="w-5 h-5 text-primary-foreground" />
            </div>
            <span>MediaPort</span>
          </div>
          <ThemeToggle />
        </div>
      </motion.nav>

      <main className="max-w-2xl mx-auto px-6 pt-32 pb-24">
        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-5xl font-bold mb-6 tracking-tighter text-foreground leading-tight">
              Streamline your <br />media workflow.
            </h1>
            <p className="text-muted-foreground text-lg mb-12 max-w-md leading-relaxed">
              Professional-grade extraction for high-quality video, audio, and image assets.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <form onSubmit={handleExtract} className="space-y-4">
              <div className="relative group">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  <Search className="w-5 h-5" />
                </div>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste URL to process..."
                  className="h-16 pl-12 bg-muted/30 border-border focus:border-primary focus:ring-0 rounded-none text-lg transition-all"
                  disabled={isPending}
                />
              </div>
              <Button
                size="lg"
                type="submit"
                disabled={isPending || !url}
                className="w-full h-16 rounded-none bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-lg transition-all overflow-hidden group"
              >
                <AnimatePresence mode="wait">
                  {isPending ? (
                    <motion.div
                      key="loading"
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -20, opacity: 0 }}
                    >
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </motion.div>
                  ) : (
                    <motion.span
                      key="text"
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: -20, opacity: 0 }}
                      className="inline-flex items-center"
                    >
                      Process Media
                    </motion.span>
                  )}
                </AnimatePresence>
              </Button>
            </form>
          </motion.div>
        </div>

        <AnimatePresence mode="wait">
          {result && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              className="mt-24 border-t border-border pt-16"
            >
              <div className="space-y-12">
                <div className="flex flex-col sm:flex-row gap-8 items-start">
                  {result.thumbnail && (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="w-full sm:w-56 aspect-video bg-muted overflow-hidden shrink-0 shadow-2xl"
                    >
                      <img
                        src={result.thumbnail}
                        alt={result.title}
                        className="w-full h-full object-cover grayscale hover:grayscale-0 transition-all duration-700 ease-out"
                      />
                    </motion.div>
                  )}
                  <div className="flex-1">
                    <motion.h2
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="text-2xl font-bold text-foreground mb-4 leading-tight tracking-tight"
                    >
                      {result.title}
                    </motion.h2>
                    <button
                      onClick={handleReset}
                      className="text-sm font-bold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors border-b-2 border-border hover:border-foreground pb-1"
                    >
                      New Extraction
                    </button>
                  </div>
                </div>

                {/* YouTube Playlist: Configuration button */}
                {isYouTubePlaylist && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-4"
                  >
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 text-xs uppercase tracking-wider font-semibold"
                      onClick={() => setConfigModalOpen(true)}
                    >
                      <Settings className="w-4 h-4" />
                      Configuration
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {playlistConfig.mode === "video"
                        ? `MP4 · ${playlistConfig.resolution}p`
                        : `${playlistConfig.audioFormat.toUpperCase()} · Audio Only`
                      }
                    </span>
                  </motion.div>
                )}

                {/* Conditionally render based on media type */}
                {result.mediaType === "playlist" && result.tracks && result.tracks.length > 0 ? (
                  <PlaylistTracks
                    tracks={result.tracks}
                    playlistTitle={result.title}
                    extractor={result.extractor}
                    playlistConfig={isYouTubePlaylist ? playlistConfig : undefined}
                  />
                ) : result.mediaType === "audio" && result.audioFormats && result.audioFormats.length > 0 ? (
                  <AudioFormats
                    audioFormats={result.audioFormats}
                    title={result.title}
                    url={url}
                    artist={result.artist}
                    album={result.album}
                    year={result.year}
                    extractor={result.extractor}
                    thumbnail={result.thumbnail}
                    duration={result.duration}
                  />
                ) : result.mediaType === "video" || !result.mediaType ? (
                  <FormatList formats={result.formats} title={result.title} url={url} />
                ) : (
                  result.images && result.images.length > 0 && (
                    <ImageGallery images={result.images} title={result.title} />
                  )
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* YouTube Playlist Config Modal */}
      <PlaylistConfigModal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onSave={setPlaylistConfig}
        currentConfig={playlistConfig}
      />
    </div>
  );
}
