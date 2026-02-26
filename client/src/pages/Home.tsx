import { useState } from "react";
import { useExtract } from "@/hooks/use-downloader";
import { FormatList } from "@/components/FormatList";
import { ImageGallery } from "@/components/ImageGallery";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Download, Search } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Home() {
  const [url, setUrl] = useState("");
  const { mutate: extract, data: result, isPending, reset } = useExtract();

  const handleExtract = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    extract({ url });
  };

  const handleReset = () => {
    setUrl("");
    reset();
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-slate-900 selection:text-white">
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="border-b border-slate-100 bg-white/80 backdrop-blur-md sticky top-0 z-50"
      >
        <div className="max-w-5xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 font-semibold text-xl tracking-tight">
            <div className="w-10 h-10 bg-slate-900 flex items-center justify-center">
              <Download className="w-5 h-5 text-white" />
            </div>
            <span>MediaPort</span>
          </div>
        </div>
      </motion.nav>

      <main className="max-w-2xl mx-auto px-6 pt-32 pb-24">
        <div className="relative">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <h1 className="text-5xl font-bold mb-6 tracking-tighter text-slate-900 leading-tight">
              Streamline your <br />media workflow.
            </h1>
            <p className="text-slate-500 text-lg mb-12 max-w-md leading-relaxed">
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
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Search className="w-5 h-5" />
                </div>
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste URL to process..."
                  className="h-16 pl-12 bg-slate-50 border-slate-200 focus:border-slate-900 focus:ring-0 rounded-none text-lg transition-all"
                  disabled={isPending}
                />
              </div>
              <Button
                size="lg"
                type="submit"
                disabled={isPending || !url}
                className="w-full h-16 rounded-none bg-slate-900 hover:bg-slate-800 text-white font-medium text-lg transition-all overflow-hidden group"
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
              className="mt-24 border-t border-slate-100 pt-16"
            >
              <div className="space-y-12">
                <div className="flex flex-col sm:flex-row gap-8 items-start">
                  {result.thumbnail && (
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="w-full sm:w-56 aspect-video bg-slate-100 overflow-hidden shrink-0 shadow-2xl"
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
                      className="text-2xl font-bold text-slate-900 mb-4 leading-tight tracking-tight"
                    >
                      {result.title}
                    </motion.h2>
                    <button
                      onClick={handleReset}
                      className="text-sm font-bold uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors border-b-2 border-slate-100 hover:border-slate-900 pb-1"
                    >
                      New Extraction
                    </button>
                  </div>
                </div>

                {/* Conditionally render based on media type */}
                {result.mediaType === "video" || !result.mediaType ? (
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
    </div>
  );
}

