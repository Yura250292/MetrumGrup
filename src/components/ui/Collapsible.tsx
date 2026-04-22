"use client";

import { useEffect, useState } from "react";

/**
 * CSS-grid-rows animated collapsible. Smooth height transition without
 * JS measurement, works in all modern browsers. Respects
 * prefers-reduced-motion via a CSS media query in globals.css.
 */
export function Collapsible({
  open,
  children,
  duration = 280,
  className,
}: {
  open: boolean;
  children: React.ReactNode;
  duration?: number;
  className?: string;
}) {
  // Render children only after first `open=true` to keep DOM lighter,
  // but keep them mounted once opened so closing animates smoothly.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  return (
    <div
      className={className}
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: `grid-template-rows ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
      }}
      aria-hidden={!open}
    >
      <div style={{ overflow: "hidden", minHeight: 0 }}>
        {mounted ? children : null}
      </div>
    </div>
  );
}
