"use client";

import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { Phone } from "lucide-react";
import { MobileMenu } from "@/components/landing/MobileMenu";

const ScrollVideoHero = dynamic(() => import("@/components/landing/hero/ScrollVideoHero"), {
  ssr: false,
  loading: () => null,
});

export default function HomePage() {
  useEffect(() => {
    window.history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      document.documentElement.classList.add("smooth");
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* ════════ HEADER ════════ */}
      <header className="fixed top-0 left-0 right-0 z-50 glass-dark">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5">
          <Link href="/" className="flex items-center">
            <Image src="/images/metrum-logo.svg" alt="Metrum Group" width={130} height={30} className="h-7 w-auto invert" />
          </Link>
          <div className="flex items-center gap-3">
            <a href="tel:+380677430101" className="hidden sm:flex items-center gap-2 text-xs text-white/60 hover:text-white transition-colors font-mono">
              <Phone className="h-3.5 w-3.5 text-primary" />067 743 01 01
            </a>
            <Link href="/login" className="btn-primary px-5 py-2 text-xs font-semibold text-white">
              Кабінет
            </Link>
            <MobileMenu />
          </div>
        </div>
      </header>

      {/* ════════ CINEMATIC HERO — увесь сайт ════════ */}
      <ScrollVideoHero />
    </div>
  );
}
