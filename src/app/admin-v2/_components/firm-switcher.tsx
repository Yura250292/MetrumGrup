"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Globe2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Firm = { id: string; name: string };

const ALL_FIRMS: Firm[] = [
  { id: "metrum-group", name: "Metrum Group" },
  { id: "metrum-studio", name: "Metrum Studio" },
];

const ALL_FIRMS_ID = "__all__";

type Props = {
  collapsed?: boolean;
  /** Дитина — те, що рендериться як "лого" у нескладеному варіанті. */
  children: React.ReactNode;
};

/**
 * Обгортає лого у дропдаун-перемикач фірм для SUPER_ADMIN.
 * Для інших ролей — рендерить дітей без обгортки.
 *
 * Поточний стан читається з GET /api/firm/current (cookie-based).
 * При виборі — POST /api/firm/switch і router.refresh() щоб всі server-сторінки
 * перерендерились зі свіжим scope-ом.
 */
export function FirmSwitcher({ collapsed = false, children }: Props) {
  const { data: session } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [currentFirmId, setCurrentFirmId] = useState<string | null | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const role = session?.user?.role;
  const userFirmId = session?.user?.firmId ?? null;
  const firmAccess = (session?.user as { firmAccess?: Record<string, string> } | undefined)
    ?.firmAccess ?? {};
  const isSuperAdmin = role === "SUPER_ADMIN";

  // Список фірм, до яких користувач має повний доступ.
  // SUPER_ADMIN — всі. Інші — home firm + ключі firmAccess.
  const accessibleFirms = useMemo<Firm[]>(() => {
    if (isSuperAdmin) return ALL_FIRMS;
    const ids = new Set<string>();
    if (userFirmId) ids.add(userFirmId);
    for (const k of Object.keys(firmAccess)) ids.add(k);
    return ALL_FIRMS.filter((f) => ids.has(f.id));
  }, [isSuperAdmin, userFirmId, firmAccess]);

  // Перемикач показуємо лише якщо є більше однієї фірми (ну і для SUPER_ADMIN завжди).
  const canSwitch =
    (role === "SUPER_ADMIN" ||
      role === "MANAGER" ||
      role === "ENGINEER" ||
      role === "FINANCIER" ||
      role === "HR") &&
    accessibleFirms.length > 1;

  useEffect(() => {
    if (!canSwitch) return;
    fetch("/api/firm/current")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d) setCurrentFirmId(d.firmId);
      })
      .catch(() => undefined);
  }, [canSwitch]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  if (!canSwitch) {
    return <>{children}</>;
  }

  async function pick(firmId: string | null) {
    if (busy) return;
    setBusy(true);
    try {
      const body =
        firmId === null
          ? { firmId: null }
          : { firmId: firmId === ALL_FIRMS_ID ? ALL_FIRMS_ID : firmId };
      await fetch("/api/firm/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setOpen(false);
      // Перерендер усіх server-компонентів з новим scope-ом.
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  // Для UI: визначити "ефективний" current — null = усі фірми
  const isAll = currentFirmId === null;
  const currentName = isAll
    ? "Усі фірми"
    : currentFirmId
      ? ALL_FIRMS.find((f) => f.id === currentFirmId)?.name ?? "Metrum Group"
      : "Metrum Group";

  return (
    <div ref={ref} className="relative flex-1 min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full text-left rounded-lg transition hover:brightness-[0.97]"
        style={{ color: T.textPrimary }}
        title={collapsed ? `Фірма: ${currentName}` : "Перемкнути фірму"}
        aria-label="Перемкнути фірму"
      >
        {children}
        {!collapsed && (
          <ChevronDown
            size={14}
            style={{ color: T.textMuted, flexShrink: 0 }}
            className={`transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute top-full left-0 mt-2 z-50 min-w-[220px] rounded-xl py-1.5 shadow-lg"
          style={{
            backgroundColor: T.panel,
            border: `1px solid ${T.borderStrong}`,
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          <div
            className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: T.textMuted }}
          >
            Перемкнути фірму
          </div>
          {accessibleFirms.map((firm) => {
            const active = !isAll && (currentFirmId ?? "metrum-group") === firm.id;
            return (
              <button
                key={firm.id}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                disabled={busy}
                onClick={() => pick(firm.id)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[13px] transition hover:bg-[var(--t-panel-el)]"
                style={{
                  color: active ? T.accentPrimary : T.textPrimary,
                  fontWeight: active ? 600 : 500,
                }}
              >
                <span>{firm.name}</span>
                {active && <Check size={14} />}
              </button>
            );
          })}
          {isSuperAdmin && (
            <>
              <div
                className="my-1 mx-3"
                style={{ borderTop: `1px solid ${T.borderSoft}` }}
              />
              <button
                type="button"
                role="menuitemradio"
                aria-checked={isAll}
                disabled={busy}
                onClick={() => pick(ALL_FIRMS_ID)}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-[13px] transition hover:bg-[var(--t-panel-el)]"
                style={{
                  color: isAll ? T.accentPrimary : T.textPrimary,
                  fontWeight: isAll ? 600 : 500,
                }}
                title="Об'єднаний звіт по всіх фірмах"
              >
                <span className="flex items-center gap-1.5">
                  <Globe2 size={13} /> Усі фірми
                </span>
                {isAll && <Check size={14} />}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
