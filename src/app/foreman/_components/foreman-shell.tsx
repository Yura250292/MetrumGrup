"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { ArrowLeft, LogOut } from "lucide-react";
import { resolveFirmBrand, AmbientBackdrop, FirmLogo } from "./firm-brand";

interface ForemanShellProps {
  title?: string;
  backHref?: string;
  showLogout?: boolean;
  /** На home екрані — приховуємо back button (бо це корінь) + title (живе у hero). */
  isRoot?: boolean;
  /** Optional override for firm — корисно якщо server-side вже resolved. */
  firmId?: string | null;
  children: React.ReactNode;
}

export function ForemanShell({
  title,
  backHref,
  showLogout,
  isRoot,
  firmId: firmIdProp,
  children,
}: ForemanShellProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const firmId = firmIdProp ?? session?.user?.firmId ?? null;
  const brand = resolveFirmBrand(firmId);

  return (
    <div className="relative min-h-dvh bg-zinc-950 text-zinc-100 flex flex-col overflow-x-hidden">
      <AmbientBackdrop brand={brand} />

      {/* Top sticky band — тонка фірмова лінія одразу під status bar.
          Перекриває білий бордюр URL bar при scroll, дає 'continuous chrome' */}
      <div
        className="sticky top-0 z-40 h-[3px] pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${brand.glow} 35%, ${brand.glow} 65%, transparent 100%)`,
          boxShadow: `0 1px 12px ${brand.glow}`,
        }}
        aria-hidden
      />

      <header className="sticky top-[3px] z-30 backdrop-blur-xl bg-zinc-950/85 border-b border-white/5">
        <div className="max-w-md mx-auto px-4 py-2.5">
          <div className="flex items-center gap-3 min-h-[44px]">
            {!isRoot &&
              (backHref ? (
                <Link
                  href={backHref}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 active:scale-90 hover:bg-white/10 transition shrink-0"
                  aria-label="Назад"
                >
                  <ArrowLeft size={18} className="text-zinc-200" />
                </Link>
              ) : (
                <button
                  onClick={() => router.back()}
                  className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 active:scale-90 hover:bg-white/10 transition shrink-0"
                  aria-label="Назад"
                >
                  <ArrowLeft size={18} className="text-zinc-200" />
                </button>
              ))}

            <div className="flex-1 min-w-0">
              {isRoot ? (
                <FirmLogo brand={brand} size="md" />
              ) : (
                <>
                  <FirmLogo brand={brand} size="sm" />
                  {title && (
                    <h1 className="mt-0.5 text-[15px] font-semibold truncate text-white leading-tight">
                      {title}
                    </h1>
                  )}
                </>
              )}
            </div>

            {showLogout && (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-white/5 border border-white/10 active:scale-90 hover:bg-white/10 transition shrink-0"
                aria-label="Вийти"
              >
                <LogOut size={16} className="text-zinc-300" />
              </button>
            )}
          </div>
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex-1 max-w-md w-full mx-auto px-4 pt-3 pb-24"
      >
        {children}
      </motion.main>

      {/* Bottom anchor band — тонка фірмова смужка над Safari/Chrome toolbar.
          Перекриває білий бордюр і додає завершенню сторінки premium-finish. */}
      <div
        className="sticky bottom-0 z-40 h-[2px] pointer-events-none"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${brand.glow} 50%, transparent 100%)`,
          boxShadow: `0 -1px 8px ${brand.glow}`,
        }}
        aria-hidden
      />
    </div>
  );
}
