"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: implement password reset email sending
    setSubmitted(true);
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
          Відновлення паролю
        </h1>

        {!submitted ? (
          <>
            <p className="text-[14px] text-[#6B7691] mb-6">
              Введіть вашу email адресу і ми надішлемо інструкції для відновлення паролю.
            </p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-[12px] font-medium text-[#A8B3CC] mb-1.5">
                  Email
                </label>
                <div className="relative">
                  <Mail
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7691]"
                  />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    className="w-full rounded-xl bg-[#1A2233] border border-[#222B3D] py-3 pl-10 pr-4 text-[14px] text-[#F4F6FB] placeholder-[#6B7691] outline-none focus:border-[#3B5BFF]"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="rounded-xl bg-[#3B5BFF] py-3 text-[14px] font-bold text-white hover:opacity-90 transition"
              >
                Надіслати інструкції
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-6">
            <div className="w-14 h-14 rounded-full bg-[#0F2E22] mx-auto mb-4 flex items-center justify-center">
              <Mail size={24} className="text-[#22C58B]" />
            </div>
            <p className="text-[14px] text-[#A8B3CC] mb-2">
              Якщо акаунт з адресою <strong className="text-[#F4F6FB]">{email}</strong> існує,
              ми надішлемо інструкції для відновлення паролю.
            </p>
            <Link
              href="/login"
              className="inline-block mt-4 text-[13px] font-medium text-[#3B5BFF] hover:opacity-80"
            >
              Повернутись до входу
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
