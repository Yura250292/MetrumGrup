"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Phone, User, Mail } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    // Validation
    if (formData.password !== formData.confirmPassword) {
      setError("Паролі не співпадають");
      return;
    }

    if (formData.password.length < 8) {
      setError("Пароль має бути не менше 8 символів");
      return;
    }

    setLoading(true);

    try {
      // Register user
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone || null,
          password: formData.password,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Помилка реєстрації");
        return;
      }

      // Auto login after successful registration
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });

      if (result?.error) {
        // Registration successful but login failed - redirect to login
        router.push("/login?registered=true");
      } else {
        // Both registration and login successful
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Сталася помилка. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  }

  function updateField(field: string, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
              Приєднуйтесь до
              <br />
              <span className="gradient-text">Metrum Group</span>
            </h2>
            <p className="mt-4 text-white/40 leading-relaxed">
              Створіть обліковий запис та отримайте доступ до особистого кабінету для
              відстеження вашого будівельного проєкту.
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
        <div className="flex flex-1 items-center justify-center px-5 bg-muted/30 py-8">
          <div className="w-full max-w-sm">
            <div className="mb-8">
              <h1 className="text-2xl font-bold">Реєстрація</h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                Створіть обліковий запис для доступу до системи
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-medium">
                  Повне ім'я <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    id="name"
                    type="text"
                    value={formData.name}
                    onChange={(e) => updateField("name", e.target.value)}
                    placeholder="Іван Іваненко"
                    required
                    autoFocus
                    className="w-full rounded-xl border border-border bg-white pl-10 pr-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium">
                  Email <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => updateField("email", e.target.value)}
                    placeholder="name@example.com"
                    required
                    className="w-full rounded-xl border border-border bg-white pl-10 pr-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="phone" className="mb-1.5 block text-sm font-medium">
                  Телефон <span className="text-muted-foreground text-xs">(опціонально)</span>
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => updateField("phone", e.target.value)}
                    placeholder="+380501234567"
                    className="w-full rounded-xl border border-border bg-white pl-10 pr-4 py-3 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                  Пароль <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => updateField("password", e.target.value)}
                    placeholder="Мінімум 8 символів"
                    required
                    minLength={8}
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

              <div>
                <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium">
                  Підтвердіть пароль <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    value={formData.confirmPassword}
                    onChange={(e) => updateField("confirmPassword", e.target.value)}
                    placeholder="Повторіть пароль"
                    required
                    className="w-full rounded-xl border border-border bg-white px-4 py-3 pr-11 text-sm outline-none transition-all focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showConfirmPassword ? (
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
                {loading ? "Реєстрація..." : "Зареєструватися"}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Вже маєте акаунт?{" "}
              <Link href="/login" className="text-primary hover:underline font-medium">
                Увійти
              </Link>
            </p>

            <p className="mt-8 text-center text-xs text-muted-foreground">
              Питання?{" "}
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
