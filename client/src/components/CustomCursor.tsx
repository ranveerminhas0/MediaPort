import { useEffect } from "react";

const LINE_COUNT = 6;

export function CustomCursor() {
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            const burst = document.createElement("div");
            burst.className = "click-burst";
            burst.style.left = `${e.clientX}px`;
            burst.style.top = `${e.clientY}px`;

            for (let i = 0; i < LINE_COUNT; i++) {
                const line = document.createElement("div");
                line.className = "click-burst-line";
                // Spread lines evenly around 360°, with a slight offset so they look natural
                const angle = (360 / LINE_COUNT) * i - 30;
                line.style.setProperty("--angle", `${angle}deg`);
                burst.appendChild(line);
            }

            document.body.appendChild(burst);

            // Clean up after animation completes
            setTimeout(() => burst.remove(), 450);
        };

        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    return null;
}
