"use client";

import { useEffect, useRef } from "react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

/**
 * Interactive 3D model viewer using Google's <model-viewer>.
 * Loads the web component from CDN on first mount.
 * User can rotate with mouse drag, zoom with scroll.
 */
export function Ai3DModelViewer({ src }: { src: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptLoaded = useRef(false);

  useEffect(() => {
    if (scriptLoaded.current) return;
    scriptLoaded.current = true;

    // Load model-viewer web component from CDN
    const script = document.createElement("script");
    script.type = "module";
    script.src = "https://ajax.googleapis.com/ajax/libs/model-viewer/4.0.0/model-viewer.min.js";
    document.head.appendChild(script);
  }, []);

  return (
    <div ref={containerRef} className="w-full aspect-[4/3] rounded-2xl overflow-hidden relative">
      {/* @ts-expect-error — model-viewer is a web component, not a React element */}
      <model-viewer
        src={src}
        auto-rotate=""
        camera-controls=""
        shadow-intensity="1"
        exposure="1.5"
        environment-image="neutral"
        style={{
          width: "100%",
          height: "100%",
          backgroundColor: T.panelElevated,
          borderRadius: "16px",
        }}
      >
        <div
          slot="progress-bar"
          className="absolute bottom-3 left-3 right-3 h-1 rounded-full overflow-hidden"
          style={{ backgroundColor: T.borderSoft }}
        >
          <div className="h-full rounded-full animate-pulse" style={{ backgroundColor: T.accentPrimary, width: "60%" }} />
        </div>
      {/* @ts-expect-error */}
      </model-viewer>
      <div
        className="absolute bottom-2 right-2 text-[10px] font-medium px-2 py-0.5 rounded-lg"
        style={{ backgroundColor: "rgba(0,0,0,0.5)", color: "white" }}
      >
        Крутіть мишкою
      </div>
    </div>
  );
}
