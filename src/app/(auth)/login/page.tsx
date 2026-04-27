"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Phone } from "lucide-react";
import { motion } from "framer-motion";
import { heroStagger, heroItem, useReducedMotionVariants } from "@/lib/motion";
import "@/styles/premium.css";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const stagger = useReducedMotionVariants(heroStagger);
  const item = useReducedMotionVariants(heroItem);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Невірний email або пароль");
      } else {
        // Fetch session to determine role-based redirect
        const sessionRes = await fetch("/api/auth/session");
        const session = await sessionRes.json();
        const role = session?.user?.role;

        if (callbackUrl) {
          router.push(callbackUrl);
        } else if (role === "SUPER_ADMIN" || role === "MANAGER") {
          router.push("/admin");
        } else {
          router.push("/dashboard");
        }
        router.refresh();
      }
    } catch {
      setError("Сталася помилка. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen">
      {/* Left panel - branding (Desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-500 via-blue-600 to-cyan-600 relative overflow-hidden items-center justify-center p-16">
        <div className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="relative max-w-lg text-center">
          {/* Logo */}
          <div className="flex items-center justify-center mb-12">
            <div className="bg-white rounded-3xl p-8 shadow-2xl">
              <img src="/images/metrum-logo.svg" alt="Metrum Group" className="h-16 w-auto" />
            </div>
          </div>

          <h1 className="text-6xl font-bold text-white mb-6 leading-tight">
            Metrum Group
          </h1>
          <p className="text-xl text-blue-100 leading-relaxed">
            Професійне управління будівельними проєктами
          </p>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 items-center justify-center px-6 bg-gradient-to-b from-slate-900 to-slate-800 relative overflow-hidden">
        {/* Cinematic gradient bg */}
        <div
          aria-hidden
          className="gradient-pan-bg absolute inset-0 pointer-events-none opacity-50"
        />
        <motion.div
          className="w-full max-w-md relative"
          initial="hidden"
          animate="visible"
          variants={stagger}
        >
          {/* Mobile logo */}
          <motion.div className="lg:hidden flex flex-col items-center mb-12" variants={item}>
            <div className="bg-gradient-to-br from-amber-500 to-yellow-500 rounded-3xl p-8 shadow-2xl mb-6 float-soft">
              <img src="/images/metrum-logo.svg" alt="Metrum Group" className="h-12 w-auto brightness-0 invert" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-2">Metrum Group</h1>
            <p className="text-sm text-slate-400">Система управління проєктами</p>
          </motion.div>

          <div className="w-full max-w-md">
          {/* Desktop header */}
          <motion.div className="hidden lg:block mb-10" variants={item}>
            <h2 className="text-5xl font-bold text-slate-100 mb-3 gradient-shimmer-text">Вітаємо!</h2>
            <p className="text-base text-slate-400">
              Увійдіть до свого акаунту
            </p>
          </motion.div>

          <motion.form onSubmit={handleSubmit} className="space-y-5" variants={item}>
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-semibold text-slate-200">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                autoFocus
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-5 py-3.5 text-base text-white placeholder:text-slate-500 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-2 block text-sm font-semibold text-slate-200">
                Пароль
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-5 py-3.5 pr-12 text-base text-white placeholder:text-slate-500 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" />
                  ) : (
                    <Eye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-5 h-5 rounded border-slate-700 bg-slate-800 text-blue-500 focus:ring-blue-500/20" />
                <span className="text-sm text-slate-400">Запам'ятати мене</span>
              </label>
              <Link href="/forgot-password" className="text-sm font-medium text-blue-400 hover:text-blue-300 transition-colors">
                Забули пароль?
              </Link>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-press btn-shine w-full rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 py-4 text-base font-bold text-white hover:from-blue-600 hover:to-cyan-600 disabled:opacity-50 shadow-lg shadow-blue-500/25 mt-4 relative overflow-hidden"
            >
              {loading ? "Вхід..." : "Увійти"}
            </button>
          </motion.form>

          <div className="mt-8 flex items-center gap-4">
            <div className="h-px flex-1 bg-slate-700"></div>
            <span className="text-sm text-slate-500">або</span>
            <div className="h-px flex-1 bg-slate-700"></div>
          </div>

          <p className="mt-8 text-center text-sm text-slate-400">
            Немає акаунту?{" "}
            <Link href="/register" className="font-semibold text-blue-400 hover:text-blue-300 transition-colors">
              Зареєструватися
            </Link>
          </p>
        </div>
        </motion.div>
      </div>
    </div>
  );
}
