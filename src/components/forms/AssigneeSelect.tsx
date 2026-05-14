"use client";

import { useMemo } from "react";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { useAssigneeCandidates } from "@/hooks/useAssigneeCandidates";
import type { AssigneeCandidate, AssigneeRef } from "@/lib/assignees/types";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export type AssigneeOption = ComboboxOption & {
  kind: "user" | "employee";
  hasAccount: boolean;
  role: string | null;
  position: string | null;
};

type Props = {
  value: AssigneeRef | null;
  onChange: (next: AssigneeRef | null) => void;
  roles?: string[];
  includeEmployees?: boolean;
  initialCandidates?: AssigneeCandidate[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

/**
 * Уніфікований дропдаун вибору відповідального — User з обліковим записом
 * АБО Employee без облікового запису. Кожен пункт містить бейдж із роллю
 * (для User) або позначкою "без акаунту" (для Employee).
 *
 * Внутрішня кодова схема для Combobox.value: "user:<id>" / "employee:<id>".
 */
export function AssigneeSelect({
  value,
  onChange,
  roles,
  includeEmployees = true,
  initialCandidates,
  placeholder = "Оберіть відповідального…",
  disabled,
  required,
  className,
}: Props) {
  const { data, isLoading } = useAssigneeCandidates({
    roles,
    includeEmployees,
    initial: initialCandidates,
  });

  const options = useMemo<AssigneeOption[]>(
    () =>
      data.map((c) => ({
        value: `${c.kind}:${c.id}`,
        label: c.name,
        description: [c.role, c.position, c.email].filter(Boolean).join(" · "),
        kind: c.kind,
        hasAccount: c.hasAccount,
        role: c.role,
        position: c.position,
      })),
    [data],
  );

  const encodedValue = value ? `${value.kind}:${value.id}` : null;

  return (
    <Combobox<AssigneeOption>
      value={encodedValue}
      options={options}
      onChange={(_v, opt) => {
        if (!opt) {
          onChange(null);
          return;
        }
        onChange({ kind: opt.kind, id: opt.value.split(":").slice(1).join(":") });
      }}
      placeholder={isLoading ? "Завантаження…" : placeholder}
      searchPlaceholder="Пошук по імені, посаді або email"
      emptyMessage="Нічого не знайдено"
      disabled={disabled || isLoading}
      required={required}
      className={className}
      renderOption={(opt, { selected }) => (
        <div className="flex w-full items-center gap-2">
          <span className="flex-1 truncate">
            <span style={{ color: T.textPrimary }}>{opt.label}</span>
            {opt.description && (
              <span className="ml-2 text-xs" style={{ color: T.textMuted }}>
                {opt.description}
              </span>
            )}
          </span>
          {!opt.hasAccount && (
            <span
              className="rounded-md px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                backgroundColor: T.panelSoft,
                color: T.textMuted,
                border: `1px solid ${T.borderSoft}`,
              }}
            >
              без акаунту
            </span>
          )}
          {selected && (
            <span style={{ color: T.accentPrimary }} className="text-xs">
              ✓
            </span>
          )}
        </div>
      )}
    />
  );
}
