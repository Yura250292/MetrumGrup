"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Menu, X, Phone } from "lucide-react";
import Link from "next/link";

const navLinks = [
  { href: "#послуги", label: "Послуги" },
  { href: "#портфоліо", label: "Портфоліо" },
  { href: "#команда", label: "Команда" },
  { href: "#відгуки", label: "Відгуки" },
  { href: "#контакти", label: "Контакти" },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center text-white/80 hover:text-white"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div
        className={cn(
          "fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm transition-opacity duration-300",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
        onClick={() => setOpen(false)}
      />

      <div
        className={cn(
          "fixed top-0 right-0 z-[201] h-full w-72 bg-[#1A1A1A] border-l border-[#2d2d2d] p-6 transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between mb-10">
          <img src="/images/metrum-logo.svg" alt="Metrum" className="h-5 w-auto invert" />
          <button
            onClick={() => setOpen(false)}
            className="flex h-8 w-8 items-center justify-center text-white/60 hover:text-white hover:bg-white/10"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="space-y-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setOpen(false)}
              className="block px-4 py-3 text-[11px] uppercase tracking-[0.15em] font-medium text-white/80 hover:text-primary hover:bg-white/5 transition-colors duration-300"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="mt-10 space-y-3">
          <a
            href="tel:+380677430101"
            className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white font-mono"
          >
            <Phone className="h-4 w-4 text-primary" />
            067 743 01 01
          </a>
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="block text-center btn-primary px-4 py-3 text-sm font-semibold text-white"
          >
            Увійти в кабінет
          </Link>
        </div>
      </div>
    </div>
  );
}
