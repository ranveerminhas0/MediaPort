import { motion } from "framer-motion";

interface FeatureCardProps {
    imageSrc: string;
    topCorner: string;
    topCornerTitle: React.ReactNode;
    title: string;
    subtitle: string;
    bottomLeftValue: string;
    bottomLeftLabel: string;
    bottomRight: string;
    delay?: number;
}

const FeatureCard = ({
    imageSrc,
    topCorner,
    topCornerTitle,
    title,
    subtitle,
    bottomLeftValue,
    bottomLeftLabel,
    bottomRight,
    delay = 0,
}: FeatureCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full rounded-[36px] overflow-hidden bg-[#F4F4EB] dark:bg-[#1A1A1A] shadow-lg border border-border/5 text-foreground flex flex-col group min-h-[420px]"
        >
            {/* The Image Background Group */}
            <div className="relative h-[220px] w-full overflow-hidden bg-black">
                <img
                    src={imageSrc}
                    alt={title}
                    className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                />
                <div className="absolute top-6 right-7 text-right text-white font-medium z-10 drop-shadow-lg">
                    <div className="text-sm opacity-90 tracking-wide">{topCorner}</div>
                    <div className="text-xl font-bold leading-tight mt-1">{topCornerTitle}</div>
                </div>
            </div>

            {/* The Folder Tab overlapping the image */}
            <div className="absolute top-[130px] left-0 w-[60%] sm:w-[55%] h-[90px] bg-[#F4F4EB] dark:bg-[#1A1A1A] rounded-tr-[36px] z-10 flex flex-col justify-end px-7 pb-2 transition-colors">
                {/* Inner Curve to bridge the right edge of the tab to the horizontal edge at h-[220px] */}
                <div className="absolute bottom-0 -right-[24px] w-[24px] h-[24px]">
                    {/* Light Mode Inner Curve */}
                    <div
                        className="w-full h-full dark:hidden"
                        style={{
                            backgroundImage: "radial-gradient(circle at 100% 0, transparent 24px, #F4F4EB 24.5px)",
                        }}
                    />
                    {/* Dark Mode Inner Curve */}
                    <div
                        className="w-full h-full hidden dark:block"
                        style={{
                            backgroundImage: "radial-gradient(circle at 100% 0, transparent 24px, #1A1A1A 24.5px)",
                        }}
                    />
                </div>

                <h3 className="text-2xl font-bold tracking-tight">{title}</h3>
            </div>

            {/* Main Content Area (Below the image) */}
            <div className="flex-1 px-7 pt-2 pb-8 flex flex-col relative z-20">
                <p className="text-muted-foreground text-[17px] font-medium leading-relaxed max-w-[85%]">
                    {subtitle}
                </p>

                <div className="mt-auto pt-10 flex justify-between items-end">
                    <div className="flex items-baseline">
                        <span className="text-6xl font-black tracking-tighter">{bottomLeftValue}</span>
                        <span className="text-muted-foreground ml-2 font-semibold text-lg">{bottomLeftLabel}</span>
                    </div>
                    <div className="text-lg font-bold tracking-tight pb-2">{bottomRight}</div>
                </div>
            </div>
        </motion.div>
    );
};

export const Features = () => {
    return (
        <section className="py-24">
            <div className="flex items-center gap-4 mb-16">
                <h2 className="text-3xl font-bold tracking-tighter">Why MediaPort?</h2>
                <div className="h-[1px] flex-1 bg-border/50"></div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <FeatureCard
                    imageSrc="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1000&auto=format&fit=crop"
                    topCorner="MediaPort Engine"
                    topCornerTitle={
                        <>
                            Universal
                            <br />
                            Extractor
                        </>
                    }
                    title="Core System"
                    subtitle="YouTube, Apple Music, Spotify & 100+ native integrations."
                    bottomLeftValue="01"
                    bottomLeftLabel="Base"
                    bottomRight="100+ Platforms"
                    delay={0}
                />

                <FeatureCard
                    imageSrc="https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1000&auto=format&fit=crop"
                    topCorner="Lossless Audio"
                    topCornerTitle={
                        <>
                            Studio-Grade
                            <br />
                            Downloads
                        </>
                    }
                    title="High Fidelity"
                    subtitle="Extract pure FLAC, WAV, and crystal clear 4K MP4 videos."
                    bottomLeftValue="02"
                    bottomLeftLabel="Qual"
                    bottomRight="Up to 9000kbps"
                    delay={0.15}
                />

                <FeatureCard
                    imageSrc="https://images.unsplash.com/photo-1523821741446-edb2b68bb7a0?q=80&w=1000&auto=format&fit=crop"
                    topCorner="Direct Access"
                    topCornerTitle={
                        <>
                            Zero Wait
                            <br />
                            Times
                        </>
                    }
                    title="Fast & Secure"
                    subtitle="Ad-free, streamlined workflows. No middleman, no delays."
                    bottomLeftValue="03"
                    bottomLeftLabel="Spd"
                    bottomRight="Instant Process"
                    delay={0.3}
                />
            </div>
        </section>
    );
};
