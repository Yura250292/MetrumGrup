"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  SCENES,
  getSceneOpacityByTime,
  getSceneTransformByTime,
} from "./scenes";
import { ScrollSceneOverlay } from "./ScrollSceneOverlay";
import {
  useMediaQuery,
  useReducedMotion,
} from "../three/hooks/useReducedMotion";

/**
 * ScrollVideoHero — wheel-hijacked cinematic.
 *
 * Pattern (Apple AirPods/Mac Studio launch pages):
 *   • The section is exactly 100vh — does NOT lengthen the document.
 *   • While the section is in viewport AND the video isn't fully scrubbed,
 *     we hijack wheel + touchmove events with preventDefault — the page does
 *     not scroll, only the video advances.
 *   • Once virtualProgress reaches 1.0 (user has "scrolled through" the whole
 *     video), the lock releases and native page scroll resumes — the user
 *     scrolls past the cinematic into Trust Bar / Portfolio / etc.
 *   • If the user later scrolls back up to the cinematic, it just shows the
 *     last frame — no re-lock.
 */

type Props = {
  desktopVideoSrc?: string;
  mobileVideoSrc?: string;
  posterSrc?: string;
};

// How sensitive scrubbing is to wheel + touch input.
const WHEEL_SENSITIVITY = 0.00045; // deltaY pixels → fraction of full video
// Touch scrub is normalised against viewport height at runtime so that one
// full-screen swipe scrubs ~TOUCH_FULL_SWIPE_FRACTION of the video, regardless
// of phone size. 0.38 ≈ ~2.5 swipes to traverse the whole cinematic.
const TOUCH_FULL_SWIPE_FRACTION = 0.38;

// Touch-release momentum: after the user lifts the finger, the video keeps
// drifting in the last swipe direction until they touch again (or it reaches
// a boundary). Lower = faster. 28s ≈ slightly faster than natural 33.6s
// playback — feels like the cinematic is gently "playing itself".
const MOMENTUM_TRAVERSAL_SECONDS = 28;

const DEBUG_HUD = false;

// Served from Cloudflare R2 — long-cache immutable, range requests supported.
const R2_BASE = "https://pub-5a3b46357b004b00a737ee06f5ca9ad2.r2.dev/cinematic/v2";

export default function ScrollVideoHero({
  desktopVideoSrc = `${R2_BASE}/building-flythrough-desktop.mp4`,
  mobileVideoSrc = `${R2_BASE}/building-flythrough-mobile.mp4`,
  posterSrc = "/images/building-flythrough-poster.jpg",
}: Props) {
  // DOM refs
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const sceneRefs = useRef<Array<HTMLDivElement | null>>([]);
  const debugRef = useRef<HTMLDivElement>(null);

  // Scrub state — driven by wheel/touch events, not native scroll
  const virtualProgressRef = useRef(0); // 0..1 across the full video duration
  const rafRef = useRef<number | null>(null);
  const durationRef = useRef(0);
  const lastSeekRef = useRef(-1);
  const lastActiveSceneRef = useRef(-1);
  // Touch-release momentum: keeps the video drifting after the finger lifts.
  const momentumRef = useRef<{ active: boolean; dir: 1 | -1 }>({
    active: false,
    dir: 1,
  });
  const tickCountRef = useRef(0);

  const [mounted, setMounted] = useState(false);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoError, setVideoError] = useState(false);
  const [activeLabel, setActiveLabel] = useState(SCENES[0].eyebrow);
  // When true: wheel hijack released, page scrolls normally.
  const [unlocked, setUnlocked] = useState(false);
  // When true: enough of the video is buffered for smooth scrub.
  const [videoReady, setVideoReady] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0); // 0..1
  const videoReadyRef = useRef(false);

  const isMobileViewport = useMediaQuery("(max-width: 768px)");
  const reducedMotion = useReducedMotion();

  // Pick mobile vs desktop video src after mount (cheap one-time pick)
  useEffect(() => {
    setMounted(true);
    const matchesMobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 768px)").matches;
    setVideoSrc(matchesMobile ? mobileVideoSrc : desktopVideoSrc);
  }, [desktopVideoSrc, mobileVideoSrc]);

  // Single rAF tick that applies virtualProgress to video + overlays.
  const tick = useCallback(() => {
    rafRef.current = null;

    // Momentum: if the user released their finger mid-cinematic, slowly drift
    // in the last swipe direction. Runs ~60fps, so divide the per-second
    // increment by 60 to get the per-frame step.
    const mo = momentumRef.current;
    if (mo.active && videoReadyRef.current) {
      const perFrame = 1 / (MOMENTUM_TRAVERSAL_SECONDS * 60);
      const next = virtualProgressRef.current + perFrame * mo.dir;
      if (next >= 1) {
        virtualProgressRef.current = 1;
        mo.active = false;
        setUnlocked((prev) => (prev ? prev : true));
      } else if (next <= 0) {
        virtualProgressRef.current = 0;
        mo.active = false;
      } else {
        virtualProgressRef.current = next;
      }
    }

    const p = virtualProgressRef.current;
    const video = videoRef.current;

    // Late-pickup of duration (Safari doesn't always fire loadedmetadata).
    if (video && durationRef.current === 0 && video.duration && Number.isFinite(video.duration)) {
      durationRef.current = video.duration;
    }
    const duration = durationRef.current;
    const time = p * (duration || 0);

    // 1. Video scrub
    if (video && duration > 0) {
      const t = p * duration;
      if (Math.abs(t - lastSeekRef.current) > 1 / 60) {
        try {
          video.currentTime = t;
          lastSeekRef.current = t;
        } catch {
          /* not seekable yet */
        }
      }
    }

    // 2. Scene overlay opacity/transform
    for (let i = 0; i < SCENES.length; i++) {
      const el = sceneRefs.current[i];
      if (!el) continue;
      const s = SCENES[i];
      const sceneEnd = Number.isFinite(s.videoEnd) ? s.videoEnd : duration;
      const op = getSceneOpacityByTime(time, s.videoStart, sceneEnd, s.fadeIn, s.fadeOut);
      const { y, blur } = getSceneTransformByTime(time, s.videoStart, sceneEnd);
      el.style.opacity = String(op);
      el.style.transform = `translate3d(0, ${y}px, 0)`;
      el.style.filter = blur > 0 ? `blur(${blur}px)` : "blur(0px)";
      el.style.pointerEvents = op > 0.5 ? "auto" : "none";
    }

    // 3. Progress bar
    if (progressBarRef.current) {
      progressBarRef.current.style.transform = `scaleX(${p})`;
    }

    // 4. Active scene label
    let activeIdx = -1;
    for (let i = 0; i < SCENES.length; i++) {
      const s = SCENES[i];
      const sceneEnd = Number.isFinite(s.videoEnd) ? s.videoEnd : duration;
      if (time >= s.videoStart && time < sceneEnd) {
        activeIdx = i;
        break;
      }
    }
    if (activeIdx === -1) activeIdx = SCENES.length - 1;
    if (activeIdx !== lastActiveSceneRef.current) {
      lastActiveSceneRef.current = activeIdx;
      setActiveLabel(SCENES[activeIdx].eyebrow);
    }

    // 5. Debug HUD
    tickCountRef.current++;
    if (DEBUG_HUD && debugRef.current) {
      debugRef.current.textContent =
        `progress ${(p * 100).toFixed(1)}%  •  ` +
        `time ${time.toFixed(2)}s / ${duration.toFixed(1)}s  •  ` +
        `scene ${activeIdx + 1}/${SCENES.length}  •  ` +
        `vt ${video?.currentTime?.toFixed(2) ?? "–"}  •  ` +
        `ticks ${tickCountRef.current}  •  ` +
        `${unlocked ? "UNLOCKED" : "LOCKED"}`;
    }

    // 6. Self-schedule next frame if momentum is still drifting.
    if (momentumRef.current.active) {
      if (rafRef.current == null) {
        rafRef.current = requestAnimationFrame(tick);
      }
    }
  }, [unlocked]);

  const schedule = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(tick);
  }, [tick]);

  // Stable ref to schedule — so the wheel hijack effect can call the latest
  // `schedule` without re-registering when it changes (which it does whenever
  // `tick`/`unlocked` flip). Without this, effect cleanup cancels in-flight
  // rAF and the scrub silently freezes at unlock.
  const scheduleRef = useRef(schedule);
  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  // Wheel + touch hijack — registered ONCE on mount with stable refs.
  // Re-registering on every `unlocked`/`schedule` change races with in-flight
  // rAF: cleanup would cancel the rAF before tick runs, so the scrub would
  // silently freeze at the moment of unlock.
  useEffect(() => {
    if (!mounted || reducedMotion) return;

    const isCinematicActive = () => {
      const section = sectionRef.current;
      if (!section) return false;
      const rect = section.getBoundingClientRect();
      return rect.top <= 0 && rect.bottom > window.innerHeight * 0.3;
    };

    const advance = (deltaProgress: number) => {
      // Block scrub until the video is buffered enough that seeks won't stall.
      // We still preventDefault on wheel/touch so the page doesn't drift.
      if (!videoReadyRef.current) return;
      const next = Math.min(1, Math.max(0, virtualProgressRef.current + deltaProgress));
      virtualProgressRef.current = next;
      scheduleRef.current();
      if (next >= 0.998) {
        // Functional setState so we don't depend on the stale `unlocked` value.
        setUnlocked((prev) => (prev ? prev : true));
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!isCinematicActive()) return;
      const goingForward = e.deltaY > 0;
      const p = virtualProgressRef.current;
      // Boundary pass-through:
      //   • forward at the end → let the page scroll down
      //   • backward at the start → let the page scroll up (usually a no-op)
      if (goingForward && p >= 0.999) return;
      if (!goingForward && p <= 0.001) return;
      e.preventDefault();
      advance(e.deltaY * WHEEL_SENSITIVITY);
    };

    let touchY = 0;
    let lastTouchDir: 1 | -1 = 1;
    let userActivated = false;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0].clientY;
      // Touching cancels any drifting momentum — user takes back control.
      momentumRef.current.active = false;
      // First touch: poke the video so iOS Safari finally streams real bytes.
      // Without a user gesture, iOS often shows only the poster.
      if (!userActivated) {
        userActivated = true;
        const v = videoRef.current;
        if (v) {
          v.play().then(() => v.pause()).catch(() => {});
        }
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isCinematicActive()) return;
      const y = e.touches[0].clientY;
      const delta = touchY - y; // positive = swipe up = scrub forward
      touchY = y;
      if (delta !== 0) lastTouchDir = delta > 0 ? 1 : -1;
      const p = virtualProgressRef.current;
      if (delta > 0 && p >= 0.999) return;
      if (delta < 0 && p <= 0.001) return;
      e.preventDefault();
      // Normalise against viewport height so sensitivity is device-independent.
      const vh = window.innerHeight || 800;
      advance((delta / vh) * TOUCH_FULL_SWIPE_FRACTION);
    };
    const onTouchEnd = () => {
      // Continue drifting in the last swipe direction until the user touches
      // again or we hit a boundary. Only kick in if the cinematic is still in
      // view and the video is buffered enough to scrub smoothly.
      if (!isCinematicActive() || !videoReadyRef.current) return;
      const p = virtualProgressRef.current;
      if (lastTouchDir > 0 && p >= 0.999) return;
      if (lastTouchDir < 0 && p <= 0.001) return;
      momentumRef.current.active = true;
      momentumRef.current.dir = lastTouchDir;
      scheduleRef.current();
    };

    const onKey = (e: KeyboardEvent) => {
      if (!isCinematicActive()) return;
      const map: Record<string, number> = {
        ArrowDown: 0.04,
        ArrowUp: -0.04,
        PageDown: 0.12,
        PageUp: -0.12,
        " ": 0.06,
      };
      const d = map[e.key];
      if (d === undefined) return;
      const p = virtualProgressRef.current;
      if (d > 0 && p >= 0.999) return;
      if (d < 0 && p <= 0.001) return;
      e.preventDefault();
      advance(d);
    };

    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: false });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    window.addEventListener("keydown", onKey);

    schedule();

    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
      window.removeEventListener("keydown", onKey);
    };
  }, [mounted, reducedMotion]);

  // Cancel any pending rAF when the component fully unmounts.
  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Pin the page at scroll=0 while video isn't done. Once unlocked, let go so
  // the user can scroll into Portfolio / Reviews / Contacts.
  useEffect(() => {
    if (!mounted) return;
    const handler = () => {
      if (virtualProgressRef.current < 0.999 && window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    };
    handler();
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, [mounted]);

  // Attach native event listeners directly to the video element. React's
  // synthetic events sometimes don't fire reliably for media events in Safari,
  // so we bypass them. Also poll readyState as a fallback.
  useEffect(() => {
    if (!mounted || reducedMotion) return;
    const v = videoRef.current;
    if (!v) return;

    const captureDuration = () => {
      const d = v.duration;
      if (d && Number.isFinite(d) && d > 0) {
        durationRef.current = d;
        scheduleRef.current();
      }
    };

    const onCanPlay = () => {
      captureDuration();
      // Kick autoplay+pause once so Safari finishes decoding the first GOP
      // and lets us seek freely.
      v.play().then(() => v.pause()).catch(() => {});
    };

    // Track how much of the video is buffered. Only enable scrub once the
    // whole thing is downloaded — otherwise each new seek triggers a slow
    // range request and scrubbing feels glitchy.
    const updateBuffered = () => {
      const dur = durationRef.current;
      if (!dur || dur <= 0) return;
      let bufferedEnd = 0;
      for (let i = 0; i < v.buffered.length; i++) {
        const end = v.buffered.end(i);
        if (end > bufferedEnd) bufferedEnd = end;
      }
      const ratio = Math.min(1, bufferedEnd / dur);
      setLoadProgress(ratio);
      // Threshold: 92% buffered is enough. canplaythrough is a stronger signal
      // when fired, but iOS Safari sometimes never fires it for large files.
      if (ratio >= 0.92 && !videoReadyRef.current) {
        videoReadyRef.current = true;
        setVideoReady(true);
      }
    };

    const onCanPlayThrough = () => {
      if (!videoReadyRef.current) {
        videoReadyRef.current = true;
        setVideoReady(true);
        setLoadProgress(1);
      }
    };

    v.addEventListener("loadedmetadata", captureDuration);
    v.addEventListener("durationchange", captureDuration);
    v.addEventListener("loadeddata", captureDuration);
    v.addEventListener("canplay", onCanPlay);
    v.addEventListener("progress", updateBuffered);
    v.addEventListener("canplaythrough", onCanPlayThrough);

    // Immediate attempt in case events already fired before this effect ran.
    captureDuration();

    // Fallback poll: every 250ms check if duration arrived. Bail after 12s.
    let elapsed = 0;
    const poll = setInterval(() => {
      elapsed += 250;
      if (durationRef.current > 0 || elapsed > 12000) {
        clearInterval(poll);
        return;
      }
      captureDuration();
    }, 250);

    return () => {
      v.removeEventListener("loadedmetadata", captureDuration);
      v.removeEventListener("durationchange", captureDuration);
      v.removeEventListener("loadeddata", captureDuration);
      v.removeEventListener("canplay", onCanPlay);
      v.removeEventListener("progress", updateBuffered);
      v.removeEventListener("canplaythrough", onCanPlayThrough);
      clearInterval(poll);
    };
  }, [mounted, reducedMotion, videoSrc]);

  // Reduced motion: static poster + headline
  if (mounted && reducedMotion) {
    return (
      <section className="relative bg-[#0A0A0A] min-h-[90vh] flex items-center overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center opacity-60"
          style={{ backgroundImage: `url(${posterSrc})` }}
          aria-hidden
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/40 to-transparent" />
        <div className="relative mx-auto max-w-7xl px-6 sm:px-12 py-24">
          <p className="font-mono text-[11px] tracking-[0.32em] text-primary/85 uppercase mb-5">
            {SCENES[0].eyebrow}
          </p>
          <h2
            className="font-cinematic text-white whitespace-pre-line text-balance"
            style={{ fontSize: "clamp(2.25rem, 6vw, 5rem)", lineHeight: 0.96 }}
          >
            {SCENES[0].title}
          </h2>
          <p className="mt-6 max-w-xl text-white/70 text-lg">
            {SCENES[0].description}
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      ref={sectionRef}
      id="cinematic-hero"
      aria-label="Metrum cinematic showcase"
      className="relative bg-[#0A0A0A] h-screen w-full overflow-hidden"
    >
      {/* Video */}
      {videoSrc && !videoError ? (
        <video
          ref={videoRef}
          src={videoSrc}
          poster={posterSrc}
          muted
          playsInline
          autoPlay
          preload="auto"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...({ "webkit-playsinline": "true", "x-webkit-airplay": "deny" } as any)}
          onError={() => setVideoError(true)}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ pointerEvents: "none" }}
          aria-hidden
        />
      ) : (
        <div
          className="absolute inset-0 w-full h-full bg-center bg-cover"
          style={{ backgroundImage: `url(${posterSrc})` }}
          aria-hidden
        />
      )}

      {/* Vignette */}
      <div
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.10) 22%, rgba(10,10,10,0) 50%, rgba(10,10,10,0.35) 72%, rgba(10,10,10,0.92) 100%)",
        }}
      />

      {/* Scene overlays */}
      {SCENES.map((scene, i) => (
        <ScrollSceneOverlay
          key={scene.id}
          scene={scene}
          ref={(el: HTMLDivElement | null) => {
            sceneRefs.current[i] = el;
          }}
        />
      ))}

      {/* Bottom HUD — active label + progress */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex items-center justify-between px-6 sm:px-10 lg:px-12 pb-6 sm:pb-8 pointer-events-none">
        <p className="font-mono text-[10px] sm:text-[11px] tracking-[0.32em] text-white/60 uppercase">
          {activeLabel}
        </p>
        <div className="relative h-px w-24 sm:w-40 bg-white/12 overflow-hidden">
          <div
            ref={progressBarRef}
            className="absolute left-0 top-0 h-full w-full bg-primary origin-left"
            style={{ transform: "scaleX(0)" }}
          />
        </div>
      </div>

      {/* Top label */}
      <div className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between px-6 sm:px-10 lg:px-12 pt-20 sm:pt-24 pointer-events-none">
        <p className="font-mono text-[10px] tracking-[0.32em] text-white/45 uppercase">
          Cinematic Tour · METRUM
        </p>
        <p className="hidden md:block font-mono text-[10px] tracking-[0.32em] text-white/35 uppercase">
          {unlocked ? "↓ скрол для продовження" : "Скрол ↓ керує камерою"}
        </p>
      </div>

      {/* Intro overlay — cinematic 3-beat reveal while the video buffers.
          Each line fades in sequentially over the first 3 seconds. Once the
          video is sufficiently buffered, the whole overlay fades out. */}
      {!videoReady && (
        <div
          aria-live="polite"
          className="cinematic-intro pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
          style={{
            background:
              "linear-gradient(180deg, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.30) 50%, rgba(10,10,10,0.75) 100%)",
          }}
        >
          <div className="flex flex-col items-center gap-6 text-center px-6">
            {["This is 3D.", "Just scroll.", "Enjoy."].map((line, i) => (
              <p
                key={line}
                className="font-cinematic cinematic-intro-line"
                style={{
                  fontSize: "clamp(2rem, 5vw, 4.5rem)",
                  fontWeight: 300,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  background:
                    "linear-gradient(180deg, #F5E6CE 0%, #EFD7B5 60%, #E2C39A 100%)",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                  textShadow: "0 24px 60px rgba(0,0,0,0.55)",
                  animationDelay: `${i * 0.9}s`,
                }}
              >
                {line}
              </p>
            ))}

            {/* Subtle progress bar — anchored well below the headlines */}
            <div className="mt-10 flex flex-col items-center gap-3 opacity-80">
              <div className="relative h-px w-40 sm:w-56 overflow-hidden bg-white/10">
                <div
                  className="absolute left-0 top-0 h-full origin-left"
                  style={{
                    transform: `scaleX(${loadProgress})`,
                    background:
                      "linear-gradient(90deg, #FFB070 0%, #FF8400 100%)",
                    transition: "transform 250ms ease",
                    width: "100%",
                  }}
                />
              </div>
              <p
                className="font-mono text-[9px] uppercase"
                style={{
                  letterSpacing: "0.34em",
                  color: "rgba(255,255,255,0.35)",
                }}
              >
                {Math.round(loadProgress * 100)}%
              </p>
            </div>
          </div>
        </div>
      )}

      {/* DEBUG HUD */}
      {DEBUG_HUD && (
        <div
          ref={debugRef}
          className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 z-50 rounded-full border border-primary/40 bg-black/70 px-4 py-1.5 font-mono text-[11px] text-primary backdrop-blur-md whitespace-nowrap"
        >
          initializing…
        </div>
      )}
    </section>
  );
}
