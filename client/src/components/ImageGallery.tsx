import { ImageItem } from "@shared/routes";
import { Download, Image, Images, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import useEmblaCarousel from "embla-carousel-react";

interface ImageGalleryProps {
    images: ImageItem[];
    title: string;
}

export function ImageGallery({ images, title }: ImageGalleryProps) {
    const { toast } = useToast();
    const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
    const [downloadingAll, setDownloadingAll] = useState(false);
    const [currentSlide, setCurrentSlide] = useState(0);

    const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true });

    const scrollPrev = useCallback(() => {
        if (emblaApi) {
            emblaApi.scrollPrev();
            setCurrentSlide(emblaApi.selectedScrollSnap());
        }
    }, [emblaApi]);

    const scrollNext = useCallback(() => {
        if (emblaApi) {
            emblaApi.scrollNext();
            setCurrentSlide(emblaApi.selectedScrollSnap());
        }
    }, [emblaApi]);

    const scrollTo = useCallback((index: number) => {
        if (emblaApi) {
            emblaApi.scrollTo(index);
            setCurrentSlide(index);
        }
    }, [emblaApi]);

    // Listen for slide changes from user swipes
    const onSelect = useCallback(() => {
        if (!emblaApi) return;
        setCurrentSlide(emblaApi.selectedScrollSnap());
    }, [emblaApi]);

    // Register the select callback
    useState(() => {
        if (emblaApi) emblaApi.on("select", onSelect);
    });

    const downloadImage = async (image: ImageItem, index: number) => {
        setDownloadingIndex(index);
        try {
            const safeTitle = (title || "image").replace(/[^a-z0-9]/gi, "_").toLowerCase();
            const filename = images.length > 1
                ? `${safeTitle}_${index + 1}`
                : safeTitle;

            const res = await fetch(
                `/api/download/image?url=${encodeURIComponent(image.url)}&filename=${encodeURIComponent(filename)}&ext=${image.ext}`
            );

            if (!res.ok) throw new Error("Download failed");

            const blob = await res.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = `${filename}.${image.ext}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(downloadUrl);

            toast({
                title: "Downloaded",
                description: `Image ${images.length > 1 ? `${index + 1} of ${images.length}` : ""} saved.`,
            });
        } catch (err: any) {
            toast({
                title: "Download Failed",
                description: err.message || "Could not download the image.",
                variant: "destructive",
            });
        } finally {
            setDownloadingIndex(null);
        }
    };

    const downloadAll = async () => {
        setDownloadingAll(true);
        toast({
            title: "Downloading All",
            description: `Starting download of ${images.length} images...`,
        });

        for (let i = 0; i < images.length; i++) {
            await downloadImage(images[i], i);
            // Small delay between downloads to not overwhelm
            if (i < images.length - 1) {
                await new Promise((r) => setTimeout(r, 500));
            }
        }

        setDownloadingAll(false);
        toast({
            title: "Complete",
            description: `All ${images.length} images downloaded.`,
        });
    };

    const isCarousel = images.length > 1;

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium uppercase tracking-widest text-slate-400 flex items-center gap-2">
                    {isCarousel ? (
                        <>
                            <Images className="w-4 h-4" />
                            Carousel · {images.length} images
                        </>
                    ) : (
                        <>
                            <Image className="w-4 h-4" />
                            Image
                        </>
                    )}
                </h3>

                {isCarousel && (
                    <button
                        onClick={downloadAll}
                        disabled={downloadingAll}
                        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-tighter bg-slate-900 text-white px-4 py-2 hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        {downloadingAll ? (
                            <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Downloading...
                            </>
                        ) : (
                            <>
                                <Download className="w-3 h-3" />
                                Get All
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* Carousel / Single Image Preview */}
            {isCarousel ? (
                <div className="relative group">
                    <div ref={emblaRef} className="overflow-hidden">
                        <div className="flex">
                            {images.map((img, i) => (
                                <div key={i} className="flex-[0_0_100%] min-w-0">
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        className="relative aspect-square bg-slate-50 overflow-hidden"
                                    >
                                        <img
                                            src={img.url}
                                            alt={`${title} - Image ${i + 1}`}
                                            className="w-full h-full object-contain"
                                            loading="lazy"
                                        />
                                        {/* Per-image download button overlay */}
                                        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => downloadImage(img, i)}
                                                disabled={downloadingIndex === i}
                                                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-tighter text-white hover:text-slate-200 transition-colors disabled:opacity-50"
                                            >
                                                {downloadingIndex === i ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Download className="w-3 h-3" />
                                                )}
                                                {downloadingIndex === i ? "Saving..." : `Get Image ${i + 1}`}
                                            </button>
                                        </div>
                                    </motion.div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Navigation Arrows */}
                    <button
                        onClick={scrollPrev}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                    >
                        <ChevronLeft className="w-5 h-5 text-slate-900" />
                    </button>
                    <button
                        onClick={scrollNext}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 shadow-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white"
                    >
                        <ChevronRight className="w-5 h-5 text-slate-900" />
                    </button>

                    {/* Dot Indicators */}
                    <div className="flex justify-center gap-2 mt-4">
                        {images.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => scrollTo(i)}
                                className={`w-2 h-2 rounded-full transition-all ${i === currentSlide
                                        ? "bg-slate-900 w-6"
                                        : "bg-slate-300 hover:bg-slate-400"
                                    }`}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                /* Single Image */
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="relative group"
                >
                    <div className="aspect-auto max-h-[500px] bg-slate-50 overflow-hidden flex items-center justify-center">
                        <img
                            src={images[0].url}
                            alt={title}
                            className="max-w-full max-h-[500px] object-contain"
                        />
                    </div>
                    {images[0].width && images[0].height && (
                        <p className="text-xs text-slate-400 mt-2">
                            {images[0].width} × {images[0].height}
                        </p>
                    )}
                </motion.div>
            )}

            {/* Image List */}
            <div className="space-y-2">
                {images.map((img, i) => {
                    const isProcessing = downloadingIndex === i;
                    return (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: i * 0.05 }}
                            className="flex items-center justify-between py-2"
                        >
                            <div className="flex items-center gap-4">
                                <Image className="w-4 h-4 text-slate-300" />
                                <span className="text-sm font-medium text-slate-600">
                                    {isCarousel ? `Image ${i + 1}` : "Original"}
                                    {" "}{img.ext.toUpperCase()}
                                </span>
                                {img.width && img.height && (
                                    <span className="text-xs text-slate-400">
                                        {img.width}×{img.height}
                                    </span>
                                )}
                            </div>
                            <button
                                onClick={() => downloadImage(img, i)}
                                disabled={isProcessing}
                                className="flex items-center gap-2 text-xs font-semibold uppercase tracking-tighter text-slate-400 hover:text-slate-900 transition-colors disabled:opacity-50"
                            >
                                {isProcessing ? (
                                    <>
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Saving...
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
