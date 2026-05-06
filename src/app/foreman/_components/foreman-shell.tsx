"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";

interface ForemanShellProps {
  title: string;
  backHref?: string;
  showLogout?: boolean;
  children: React.ReactNode;
}

export function ForemanShell({ title, backHref, showLogout, children }: ForemanShellProps) {
  const router = useRouter();

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-100 flex flex-col">
      <header className="sticky top-0 z-30 bg-zinc-900/95 backdrop-blur border-b border-zinc-800">
        <div className="max-w-md mx-auto flex items-center gap-3 px-4 py-3 min-h-[64px]">
          {backHref ? (
            <Link
              href={backHref}
              className="flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-800 active:scale-95 transition"
              aria-label="Назад"
            >
              <span className="text-2xl leading-none">←</span>
            </Link>
          ) : (
            <button
              onClick={() => router.back()}
              className="flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-800 active:scale-95 transition"
              aria-label="Назад"
            >
              <span className="text-2xl leading-none">←</span>
            </button>
          )}
          <h1 className="flex-1 text-lg font-bold truncate">{title}</h1>
          {showLogout && (
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-zinc-400 px-3 py-2 rounded-lg active:bg-zinc-800"
            >
              Вийти
            </button>
          )}
        </div>
      </header>
      <main className="flex-1 max-w-md w-full mx-auto px-4 pt-4 pb-24">{children}</main>
    </div>
  );
}
