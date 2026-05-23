"use client";

import Image from "next/image";
import { ArrowRight, Phone, Mail, MapPin } from "lucide-react";
import type { Scene } from "./scenes";

/**
 * One cinematic scene's editorial overlay.
 * Visibility (opacity / transform / blur) is driven by ScrollVideoHero via a
 * ref + direct DOM style writes — so this component never re-renders on scroll.
 *
 * Typography (cinematic premium):
 *   • Eyebrow → IBM Plex Mono, primary gradient + amber underline
 *   • Title   → Cormorant Garamond, warm white→cream gradient mask, halo shadow
 *   • Body    → Space Grotesk, warm cream/72, slight letter-spacing
 */
export function ScrollSceneOverlay({
  scene,
  ref,
}: {
  scene: Scene;
  ref?: React.Ref<HTMLDivElement>;
}) {
  const teamCount = scene.team?.length ?? 0;

  return (
    <div
      ref={ref}
      data-scene={scene.id}
      className="absolute inset-0 z-20 flex items-end md:items-center pointer-events-none"
      style={{
        opacity: 0,
        transform: "translate3d(0, 32px, 0)",
        filter: "blur(10px)",
        willChange: "opacity, transform, filter",
        transition: "filter 220ms linear",
      }}
    >
      {/* Left-anchored scrim — keeps editorial text legible on bright frames
          (e.g. office, lobby) without darkening the whole frame. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 w-full md:w-[68%] pointer-events-none"
        style={{
          background:
            "linear-gradient(90deg, rgba(8,8,8,0.78) 0%, rgba(8,8,8,0.62) 32%, rgba(8,8,8,0.32) 62%, rgba(8,8,8,0) 100%)",
        }}
      />
      {/* Bottom scrim for mobile (text stacks at bottom) */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-[58%] md:hidden pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(8,8,8,0) 0%, rgba(8,8,8,0.45) 40%, rgba(8,8,8,0.85) 100%)",
        }}
      />
      <div className="relative mx-auto w-full max-w-[1320px] px-6 sm:px-10 lg:px-14 pb-24 md:pb-0 grid grid-cols-12 gap-6 md:gap-12 items-end md:items-center">
        {/* ───── Editorial column ───── */}
        <div className="col-span-12 md:col-span-7 max-w-[760px]">
          {/* Eyebrow + amber accent line */}
          <div className="mb-6 md:mb-8 flex items-center gap-4">
            <span
              aria-hidden
              className="block h-px w-10 sm:w-14"
              style={{
                background:
                  "linear-gradient(90deg, rgba(255,132,0,0) 0%, rgba(255,176,112,0.9) 50%, rgba(255,132,0,0) 100%)",
              }}
            />
            <p
              className="font-mono text-[10px] sm:text-[11px] uppercase"
              style={{
                letterSpacing: "0.38em",
                background:
                  "linear-gradient(90deg, #FFD9B0 0%, #FF8400 60%, #FFB070 100%)",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                textShadow: "0 0 30px rgba(255,132,0,0.18)",
              }}
            >
              {scene.eyebrow}
            </p>
          </div>

          {/* Title — warm cinematic gradient (no pure white, softer contrast) */}
          <h2
            className="font-cinematic whitespace-pre-line text-balance"
            style={{
              fontSize: "clamp(2.5rem, 7.2vw, 7.5rem)",
              fontWeight: 250,
              lineHeight: 0.96,
              letterSpacing: "-0.025em",
              background:
                "linear-gradient(180deg, #F5E6CE 0%, #EFD7B5 45%, #E2C39A 80%, #D4AE82 100%)",
              WebkitBackgroundClip: "text",
              backgroundClip: "text",
              color: "transparent",
              textShadow: "0 24px 60px rgba(0,0,0,0.5)",
              filter: "drop-shadow(0 0 24px rgba(255,176,112,0.10))",
            }}
          >
            {scene.title}
          </h2>

          {/* Body — warm cream, softer */}
          <p
            className="mt-7 md:mt-9 max-w-[560px] whitespace-pre-line leading-[1.7]"
            style={{
              fontSize: "clamp(0.95rem, 1.2vw, 1.125rem)",
              color: "rgba(232, 215, 192, 0.72)",
              letterSpacing: "0.005em",
              textShadow: "0 1px 24px rgba(0,0,0,0.55)",
            }}
          >
            {scene.description}
          </p>

          {/* CTAs */}
          {(scene.ctaPrimary || scene.ctaSecondary) && (
            <div className="mt-10 md:mt-12 flex flex-wrap items-center gap-3 pointer-events-auto">
              {scene.ctaPrimary && (
                <a
                  href={scene.ctaPrimary.href}
                  className="group inline-flex items-center gap-2.5 rounded-full px-8 py-4 text-[13px] font-semibold text-black transition-all duration-500 hover:scale-[1.03]"
                  style={{
                    background:
                      "linear-gradient(135deg, #FFD9B0 0%, #FF8400 55%, #FF6A00 100%)",
                    boxShadow:
                      "0 18px 50px rgba(255,132,0,0.42), inset 0 1px 0 rgba(255,255,255,0.45)",
                    letterSpacing: "0.04em",
                  }}
                >
                  {scene.ctaPrimary.label}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </a>
              )}
              {scene.ctaSecondary && (
                <a
                  href={scene.ctaSecondary.href}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-8 py-4 text-[13px] font-medium backdrop-blur-2xl transition-all duration-500 hover:bg-white/[0.07] hover:border-primary/40"
                  style={{ letterSpacing: "0.04em", color: "#F0E2C8" }}
                >
                  {scene.ctaSecondary.label}
                </a>
              )}
            </div>
          )}

          {/* Contact strip — only on final scene */}
          {scene.contact && (
            <div className="mt-8 md:mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-[640px] pointer-events-auto">
              {[
                { Icon: Phone, label: "Телефон", value: scene.contact.phone, href: `tel:${scene.contact.phone.replace(/\s/g, "")}` },
                { Icon: Mail, label: "Email", value: scene.contact.email, href: `mailto:${scene.contact.email}` },
                { Icon: MapPin, label: "Адреса", value: scene.contact.address, href: undefined },
              ].map(({ Icon, label, value, href }) => {
                const Wrap = href ? "a" : "div";
                return (
                  <Wrap
                    key={label}
                    {...(href ? { href } : {})}
                    className="group flex items-start gap-3 rounded-2xl border border-white/[0.18] bg-black/40 backdrop-blur-xl px-4 py-3 transition-colors duration-500 hover:border-primary/50 hover:bg-black/55"
                  >
                    <Icon className="h-3.5 w-3.5 mt-1 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p
                        className="font-mono text-[9px] uppercase"
                        style={{
                          letterSpacing: "0.28em",
                          color: "rgba(255,217,176,0.85)",
                        }}
                      >
                        {label}
                      </p>
                      <p
                        className="mt-1 text-[13px] font-semibold leading-tight break-words"
                        style={{
                          color: "#FBEACB",
                          textShadow: "0 2px 12px rgba(0,0,0,0.85)",
                        }}
                      >
                        {value}
                      </p>
                    </div>
                  </Wrap>
                );
              })}
            </div>
          )}
        </div>

        {/* ───── Right rail: metrics or team (desktop) ───── */}
        <div className="hidden md:flex md:col-span-5 flex-col items-end justify-center gap-4">
          {scene.metrics && scene.metrics.length > 0 && (
            <div className="grid grid-cols-1 gap-3 w-full max-w-xs">
              {scene.metrics.map((m, i) => (
                <div
                  key={m.label}
                  className="rounded-2xl border border-white/[0.10] bg-white/[0.035] backdrop-blur-2xl px-6 py-5 shadow-2xl shadow-black/50"
                  style={{
                    transform: `translateY(${i % 2 === 0 ? "-4px" : "4px"})`,
                  }}
                >
                  <div
                    className="font-cinematic leading-none"
                    style={{
                      fontSize: "clamp(2rem, 3vw, 3rem)",
                      fontWeight: 250,
                      letterSpacing: "-0.025em",
                      background:
                        "linear-gradient(180deg, #F5E6CE 0%, #EFD7B5 55%, #E2C39A 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    {m.value}
                  </div>
                  <div
                    className="mt-2 font-mono text-[10px] uppercase"
                    style={{
                      letterSpacing: "0.32em",
                      color: "rgba(255,217,176,0.55)",
                    }}
                  >
                    {m.label}
                  </div>
                </div>
              ))}
            </div>
          )}

          {scene.team && teamCount > 0 && (
            <div
              className={`grid w-full ${
                teamCount >= 6 ? "grid-cols-3" : "grid-cols-2"
              } gap-3 max-w-[440px]`}
            >
              {scene.team.map((t, i) => (
                <div
                  key={t.name}
                  className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-white/12 bg-white/[0.04] backdrop-blur-xl shadow-2xl shadow-black/50"
                  style={{
                    transform: `translateY(${i % 2 === 0 ? "0px" : "12px"})`,
                  }}
                >
                  <Image
                    src={t.photo}
                    alt={t.name}
                    fill
                    sizes="(min-width: 1024px) 144px, 0px"
                    className="object-cover grayscale contrast-[1.05] brightness-[0.82] transition-all duration-700 group-hover:grayscale-0 group-hover:brightness-100"
                    unoptimized
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-2.5">
                    <p
                      className="text-[12px] font-semibold leading-tight"
                      style={{ color: "#F0E2C8" }}
                    >
                      {t.name}
                    </p>
                    <p
                      className="mt-0.5 font-mono text-[8px] uppercase"
                      style={{
                        letterSpacing: "0.20em",
                        color: "rgba(255,176,112,0.85)",
                      }}
                    >
                      {t.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
