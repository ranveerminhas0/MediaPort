import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { flushSync } from "react-dom";
import { useRef, useEffect, useState } from "react";

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    const toggleRef = useRef<HTMLButtonElement>(null);
    const [mounted, setMounted] = useState(false);

    // next-themes needs to mount on the client before we can read the theme
    useEffect(() => setMounted(true), []);

    const toggleTheme = async (e: React.MouseEvent<HTMLButtonElement>) => {
        const isDark = resolvedTheme === "dark";
        const newTheme = isDark ? "light" : "dark";

        /**
         * Fallback for browsers that don't support View Transition API
         * or users who prefer reduced motion
         */
        if (
            !(document as any).startViewTransition ||
            window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ) {
            setTheme(newTheme);
            return;
        }

        // Get cursor position for the animation origin
        const x = e.clientX;
        const y = e.clientY;

        const endRadius = Math.hypot(
            Math.max(x, window.innerWidth - x),
            Math.max(y, window.innerHeight - y)
        );

        const transition = (document as any).startViewTransition(() => {
            flushSync(() => {
                setTheme(newTheme);
            });
        });

        await transition.ready;

        document.documentElement.animate(
            {
                clipPath: [
                    `circle(0px at ${x}px ${y}px)`,
                    `circle(${endRadius}px at ${x}px ${y}px)`,
                ],
            },
            {
                duration: 800,
                easing: "ease-in-out",
                pseudoElement: "::view-transition-new(root)",
            }
        );
    };

    if (!mounted) {
        // Avoid hydration mismatch — render a placeholder
        return (
            <Button
                variant="ghost"
                size="icon"
                className="w-10 h-10 rounded-none"
                disabled
            >
                <Sun className="h-[1.2rem] w-[1.2rem]" />
            </Button>
        );
    }

    return (
        <Button
            ref={toggleRef}
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            className="w-10 h-10 rounded-none hover:bg-muted transition-colors"
            title="Toggle theme"
        >
            {resolvedTheme === "dark" ? (
                <Sun className="h-[1.2rem] w-[1.2rem] transition-transform" />
            ) : (
                <Moon className="h-[1.2rem] w-[1.2rem] transition-transform" />
            )}
            <span className="sr-only">Toggle theme</span>
        </Button>
    );
}
