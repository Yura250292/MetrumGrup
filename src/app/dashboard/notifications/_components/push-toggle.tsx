"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  isPushSupported,
  getPushPermission,
  subscribeToPush,
  unsubscribeFromPush,
  hasActivePushSubscription,
} from "@/lib/notifications/push-client";

type PushState = "loading" | "unsupported" | "denied" | "subscribed" | "unsubscribed";

export function PushToggle() {
  const [state, setState] = useState<PushState>("loading");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    checkState();
  }, []);

  async function checkState() {
    if (!isPushSupported()) {
      setState("unsupported");
      return;
    }

    const perm = getPushPermission();
    if (perm === "denied") {
      setState("denied");
      return;
    }

    const active = await hasActivePushSubscription();
    setState(active ? "subscribed" : "unsubscribed");
  }

  async function handleSubscribe() {
    setBusy(true);
    try {
      const ok = await subscribeToPush();
      if (ok) {
        setState("subscribed");
      } else {
        // check if user denied
        const perm = getPushPermission();
        setState(perm === "denied" ? "denied" : "unsubscribed");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleUnsubscribe() {
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setState("unsubscribed");
    } finally {
      setBusy(false);
    }
  }

  if (state === "loading") {
    return (
      <div className="flex items-center gap-3 rounded-xl p-4 admin-dark:bg-white/5 admin-light:bg-gray-50 border admin-dark:border-white/10 admin-light:border-gray-200">
        <Loader2 className="h-5 w-5 animate-spin admin-dark:text-gray-500 admin-light:text-gray-400" />
        <span className="text-sm admin-dark:text-gray-400 admin-light:text-gray-500">Перевіряємо…</span>
      </div>
    );
  }

  if (state === "unsupported") {
    return (
      <div className="flex items-center gap-3 rounded-xl p-4 admin-dark:bg-white/5 admin-light:bg-gray-50 border admin-dark:border-white/10 admin-light:border-gray-200">
        <BellOff className="h-5 w-5 admin-dark:text-gray-500 admin-light:text-gray-400" />
        <div>
          <p className="text-sm font-medium admin-dark:text-gray-300 admin-light:text-gray-700">
            Push-сповіщення недоступні
          </p>
          <p className="text-xs admin-dark:text-gray-500 admin-light:text-gray-400">
            Ваш браузер або пристрій не підтримує push-сповіщення
          </p>
        </div>
      </div>
    );
  }

  if (state === "denied") {
    return (
      <div className="flex items-center gap-3 rounded-xl p-4 border border-amber-500/30 admin-dark:bg-amber-500/10 admin-light:bg-amber-50">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium admin-dark:text-amber-300 admin-light:text-amber-700">
            Дозвіл заблоковано
          </p>
          <p className="text-xs admin-dark:text-amber-400/70 admin-light:text-amber-600">
            Дозвольте сповіщення в налаштуваннях браузера, потім оновіть сторінку
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl p-4 admin-dark:bg-white/5 admin-light:bg-gray-50 border admin-dark:border-white/10 admin-light:border-gray-200">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0 ${
          state === "subscribed"
            ? "admin-dark:bg-green-500/15 admin-light:bg-green-50"
            : "admin-dark:bg-blue-500/15 admin-light:bg-blue-50"
        }`}
      >
        {state === "subscribed" ? (
          <CheckCircle2 className="h-5 w-5 text-green-500" />
        ) : (
          <Bell className="h-5 w-5 admin-dark:text-blue-400 admin-light:text-blue-500" />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium admin-dark:text-white admin-light:text-gray-900">
          Push-сповіщення
        </p>
        <p className="text-xs admin-dark:text-gray-500 admin-light:text-gray-400">
          {state === "subscribed"
            ? "Ви отримуєте сповіщення на цьому пристрої"
            : "Отримуйте миттєві сповіщення про платежі та оновлення"}
        </p>
      </div>

      <button
        onClick={state === "subscribed" ? handleUnsubscribe : handleSubscribe}
        disabled={busy}
        className={`rounded-lg px-4 py-2 text-xs font-bold transition flex-shrink-0 disabled:opacity-50 ${
          state === "subscribed"
            ? "admin-dark:bg-red-500/15 admin-dark:text-red-400 admin-light:bg-red-50 admin-light:text-red-600 border admin-dark:border-red-500/20 admin-light:border-red-200"
            : "bg-blue-500 text-white hover:bg-blue-600"
        }`}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "subscribed" ? (
          "Вимкнути"
        ) : (
          "Увімкнути"
        )}
      </button>
    </div>
  );
}
