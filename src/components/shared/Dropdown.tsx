"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export type DropdownItem = {
  label: string;
  onClick?: () => void;
  href?: string;
  icon?: React.ReactNode;
  /** Кнопка-розділювач: рендериться у меню як HR-лінія, без onClick. */
  divider?: boolean;
  /** Деструктивна дія — підсвічуємо червоним. */
  destructive?: boolean;
  disabled?: boolean;
};

/**
 * Click-to-open dropdown menu з закриттям на outside-click або Esc.
 * Без зовнішніх dependencies. Trigger — render-prop, item-список — масив.
 *
 *   <Dropdown
 *     trigger={(toggle) => (
 *       <button onClick={toggle} className="...">Дії <ChevronDown /></button>
 *     )}
 *     items={[
 *       { label: "Редагувати", icon: <Pencil />, onClick: () => ... },
 *       { divider: true, label: "" },
 *       { label: "Видалити", destructive: true, onClick: () => ... },
 *     ]}
 *   />
 */
export function Dropdown({
  trigger,
  items,
  align = "right",
  width = 200,
}: {
  trigger: (toggle: () => void, isOpen: boolean) => React.ReactNode;
  items: DropdownItem[];
  align?: "left" | "right";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = () => setOpen((v) => !v);

  return (
    <div className="relative inline-block" ref={rootRef}>
      {trigger(toggle, open)}
      {open && (
        <div
          role="menu"
          className={`absolute top-full mt-1 z-40 rounded-lg py-1 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
          style={{
            width,
            backgroundColor: T.panel,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {items.map((item, i) => {
            if (item.divider) {
              return (
                <div
                  key={`d-${i}`}
                  className="my-1"
                  style={{ height: 1, backgroundColor: T.borderSoft }}
                />
              );
            }
            const className =
              "flex w-full items-center gap-2 px-3 py-2 text-[12px] font-medium text-left transition disabled:opacity-50";
            const style: React.CSSProperties = {
              color: item.destructive ? T.danger : T.textPrimary,
              backgroundColor: "transparent",
            };
            const onMouseEnter = (e: React.MouseEvent<HTMLElement>) => {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                item.destructive ? T.dangerSoft : T.panelSoft;
            };
            const onMouseLeave = (e: React.MouseEvent<HTMLElement>) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
            };
            const handleClick = () => {
              if (item.disabled) return;
              item.onClick?.();
              setOpen(false);
            };
            const content = (
              <>
                {item.icon && (
                  <span
                    style={{
                      color: item.destructive ? T.danger : T.textMuted,
                    }}
                  >
                    {item.icon}
                  </span>
                )}
                <span className="flex-1">{item.label}</span>
              </>
            );
            if (item.href && !item.disabled) {
              return (
                <a
                  key={i}
                  href={item.href}
                  className={className}
                  style={style}
                  role="menuitem"
                  onMouseEnter={onMouseEnter}
                  onMouseLeave={onMouseLeave}
                  onClick={() => setOpen(false)}
                >
                  {content}
                </a>
              );
            }
            return (
              <button
                key={i}
                type="button"
                onClick={handleClick}
                disabled={item.disabled}
                className={className}
                style={style}
                role="menuitem"
                onMouseEnter={onMouseEnter}
                onMouseLeave={onMouseLeave}
              >
                {content}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Конвенційний trigger-button для Dropdown. */
export function DropdownTriggerButton({
  label,
  onClick,
  isOpen,
}: {
  label: string;
  onClick: () => void;
  isOpen: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="menu"
      aria-expanded={isOpen}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[12px] font-semibold transition hover:brightness-95"
      style={{
        backgroundColor: T.panelElevated,
        color: T.textPrimary,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      {label}
      <ChevronDown size={13} className={isOpen ? "rotate-180 transition" : "transition"} />
    </button>
  );
}
