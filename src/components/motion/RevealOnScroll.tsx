"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type CSSProperties,
  type ElementType,
} from "react";
import { cn } from "@/lib/utils";

interface RevealOnScrollProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  rootMargin?: string;
  as?: ElementType;
  once?: boolean;
}

export function RevealOnScroll({
  children,
  className,
  delay = 0,
  rootMargin = "-80px 0px",
  as: Tag = "div",
  once = true,
}: RevealOnScrollProps) {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      // No IntersectionObserver support — show immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setVisible(false);
          }
        }
      },
      { rootMargin, threshold: 0.05 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [rootMargin, once]);

  const style: CSSProperties = { transitionDelay: `${delay}ms` };
  return (
    <Tag
      ref={ref as React.Ref<HTMLElement>}
      className={cn("reveal-on-scroll", visible && "is-visible", className)}
      style={style}
    >
      {children}
    </Tag>
  );
}
