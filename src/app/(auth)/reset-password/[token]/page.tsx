"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Eye, EyeOff, Lock } from "lucide-react";

export default function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const router = useRouter();
  const { token } = use(params);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Пароль має бути не менше 8 символів");
      return;
    }
    if (password !== confirm) {
      setError("Паролі не співпадають");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      if (res.status === 429) {
        setError("Забагато запитів. Спробуйте пізніше.");
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          data?.message ||
            "Не вдалось скинути пароль. Можливо, посилання вже використане або застаріле."
        );
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/login"), 2500);
    } catch {
      setError("Помилка мережі. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0B0F17] px-4">
      <div className="w-full max-w-md rounded-2xl bg-[#121826] p-8 border border-[#222B3D]">
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 text-[13px] text-[#A8B3CC] hover:text-white mb-6"
        >
          <ArrowLeft size={14} />
          Повернутись до входу
        </Link>

        <h1 className="text-[22px] font-bold text-[#F4F6FB] mb-2">
          Новий пароль
        </h1>

        {success ? (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-[#0F2E22] mx-auto mb-4 flex items-center justify-center">
              <Lock size={24} className="text-[#22C58B]" />
            </div>
            <p className="text-[14px] text-[#A8B3CC] mb-2">
              Пароль успішно змінено. Зараз перенаправимо на сторінку входу…
            </p>
          </div>
        ) : (
          <>
            <p className="text-[14px] text-[#6B7691] mb-6">
              Створіть новий пароль для вашого акаунту. Мінімум 8 символів.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-medium text-[#A8B3CC] mb-1.5">
                  Новий пароль
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7691]"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Мінімум 8 символів"
                    className="w-full rounded-xl bg-[#1A2233] border border-[#222B3D] py-3 pl-10 pr-10 text-[14px] text-[#F4F6FB] placeholder-[#6B7691] outline-none focus:border-[#3B5BFF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7691] hover:text-[#A8B3CC]"
                    aria-label="Показати пароль"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[12px] font-medium text-[#A8B3CC] mb-1.5">
                  Підтвердження
                </label>
                <div className="relative">
                  <Lock
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7691]"
                  />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Повторіть пароль"
                    className="w-full rounded-xl bg-[#1A2233] border border-[#222B3D] py-3 pl-10 pr-4 text-[14px] text-[#F4F6FB] placeholder-[#6B7691] outline-none focus:border-[#3B5BFF]"
                  />
                </div>
              </div>

              {error && (
                <p className="text-[12px] text-[#FF6B6B]">
                  {error}{" "}
                  <Link
                    href="/forgot-password"
                    className="underline hover:text-[#FF8E8E]"
                  >
                    Запросити новий лист
                  </Link>
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-[#3B5BFF] py-3 text-[14px] font-bold text-white hover:opacity-90 transition disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? "Зберігаємо…" : "Зберегти новий пароль"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
