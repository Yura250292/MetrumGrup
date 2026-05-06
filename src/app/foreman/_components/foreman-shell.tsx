"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { motion } from "framer-motion";
import { ArrowLeft, LogOut } from "lucide-react";
import { resolveFirmBrand, AmbientBackdrop, FirmLogo } from "./firm-brand";

interface ForemanShellProps {
  title: string;
  backHref?: string;
  showLogout?: boolean;
  /** Optional override for firm — корисно якщо server-side вже resolved. */
  firmId?: string | null;
  children: React.ReactNode;
}

export function ForemanShell({
  title,
  backHref,
  showLogout,
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

      <header className="sticky top-0 z-30 backdrop-blur-xl bg-zinc-950/70 border-b border-white/5">
        <div className="max-w-md mx-auto px-4 py-3">
          <div className="flex items-center gap-3 min-h-[56px]">
            {backHref ? (
              <Link
                href={backHref}
                className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md active:scale-90 hover:bg-white/10 transition"
                aria-label="Назад"
              >
                <ArrowLeft size={20} className="text-zinc-200" />
              </Link>
            ) : (
              <button
                onClick={() => router.back()}
                className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md active:scale-90 hover:bg-white/10 transition"
                aria-label="Назад"
              >
                <ArrowLeft size={20} className="text-zinc-200" />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <FirmLogo brand={brand} size="sm" />
              <h1 className="mt-0.5 text-base font-semibold truncate text-white">{title}</h1>
            </div>
            {showLogout && (
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                className="flex items-center justify-center w-11 h-11 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md active:scale-90 hover:bg-white/10 transition"
                aria-label="Вийти"
              >
                <LogOut size={18} className="text-zinc-300" />
              </button>
            )}
          </div>
        </div>
      </header>

      <motion.main
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex-1 max-w-md w-full mx-auto px-4 pt-4 pb-24"
      >
        {children}
      </motion.main>
    </div>
  );
}
