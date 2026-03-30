"use client";

import { signIn } from "next-auth/react";
import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Phone } from "lucide-react";

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
    <div className="flex min-h-screen flex-col">
      {/* Top header bar */}
      <header className="flex h-14 items-center justify-between px-5 border-b border-border/50 bg-white lg:bg-dark lg:border-white/10 shrink-0 z-10">
        <Link href="/" className="flex items-center">
          <img src="/images/metrum-logo.svg" alt="Metrum Group" className="h-6 w-auto lg:invert" />
        </Link>
        <div className="flex items-center gap-4">
          <a href="tel:+380677430101" className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground lg:text-white/60 hover:text-foreground lg:hover:text-white transition-colors">
            <Phone className="h-3 w-3" />
            067 743 01 01
          </a>
          <Link
            href="/"
            className="rounded-full border border-border lg:border-white/20 px-4 py-1.5 text-xs font-medium text-muted-foreground lg:text-white/70 hover:bg-muted lg:hover:bg-white/10 transition-colors"
          >
            На головну
          </Link>
        </div>
      </header>

      <div className="flex flex-1">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-dark relative overflow-hidden items-center justify-center">
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "48px 48px",
          }}
        />
        <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-primary/10 to-transparent" />
        <div className="relative px-16 max-w-lg">
          <div className="flex items-center mb-10">
            <img src="/images/metrum-logo.svg" alt="Metrum Group" className="h-8 w-auto invert" />
          </div>
          <h2 className="text-3xl font-bold text-white leading-tight">
            Ваш особистий
            <br />
            <span className="gradient-text">кабінет управління</span>
          </h2>
          <p className="mt-4 text-white/40 leading-relaxed">
            Відстежуйте прогрес будівництва, переглядайте фінанси та фотозвіти
            вашого проєкту в реальному часі.
          </p>
          <div className="mt-12 grid grid-cols-3 gap-6 text-center">
            {[
              { value: "12+", label: "млн $ продажів" },
              { value: "3000+", label: "угод" },
              { value: "200k+", label: "м² ремонту" },
            ].map((s) => (
              <div key={s.label}>
                <p className="text-xl font-bold text-white">{s.value}</p>
                <p className="text-[10px] text-white/30 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex flex-1 items-center justify-center px-5 bg-muted/30">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h1 className="text-2xl font-bold">Вхід до системи</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Введіть дані вашого облікового запису
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoFocus
                className="w-full rounded-xl border border-border bg-white px-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
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
                  className="w-full rounded-xl border border-border bg-white px-4 py-3 pr-11 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50 transition-all duration-200 hover:shadow-lg hover:shadow-primary/25 mt-2"
            >
              {loading ? "Вхід..." : "Увійти"}
            </button>
          </form>

          <p className="mt-8 text-center text-xs text-muted-foreground">
            Проблеми з доступом?{" "}
            <a href="tel:+380677430101" className="text-primary hover:underline font-medium">
              Зателефонуйте нам
            </a>
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}
