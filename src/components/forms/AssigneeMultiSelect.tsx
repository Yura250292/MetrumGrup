"use client";

import { useMemo, useState } from "react";
import { X, Plus } from "lucide-react";
import { useAssigneeCandidates } from "@/hooks/useAssigneeCandidates";
import type { AssigneeCandidate, AssigneeRef } from "@/lib/assignees/types";
import { AssigneeSelect } from "./AssigneeSelect";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type Props = {
  value: AssigneeRef[];
  onChange: (next: AssigneeRef[]) => void;
  roles?: string[];
  includeEmployees?: boolean;
  initialCandidates?: AssigneeCandidate[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * Multi-select для призначення кількох відповідальних. Показує обрані як
 * "chips" і додає одного через AssigneeSelect внизу.
 */
export function AssigneeMultiSelect({
  value,
  onChange,
  roles,
  includeEmployees = true,
  initialCandidates,
  placeholder = "Додати відповідального…",
  disabled,
  className,
}: Props) {
  const { data } = useAssigneeCandidates({
    roles,
    includeEmployees,
    initial: initialCandidates,
  });

  const byKey = useMemo(() => {
    const m = new Map<string, AssigneeCandidate>();
    for (const c of data) m.set(`${c.kind}:${c.id}`, c);
    return m;
  }, [data]);

  const [addOpen, setAddOpen] = useState(false);

  function remove(ref: AssigneeRef) {
    onChange(value.filter((r) => !(r.kind === ref.kind && r.id === ref.id)));
  }

  function add(ref: AssigneeRef | null) {
    if (!ref) return;
    if (value.some((r) => r.kind === ref.kind && r.id === ref.id)) {
      setAddOpen(false);
      return;
    }
    onChange([...value, ref]);
    setAddOpen(false);
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-1.5">
        {value.map((ref) => {
          const key = `${ref.kind}:${ref.id}`;
          const c = byKey.get(key);
          const label = c?.name ?? key;
          const hasAccount = c?.hasAccount ?? ref.kind === "user";
          return (
            <span
              key={key}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
              style={{
                backgroundColor: T.panelSoft,
                border: `1px solid ${T.borderSoft}`,
                color: T.textPrimary,
              }}
            >
              <span className="max-w-[16ch] truncate">{label}</span>
              {!hasAccount && (
                <span
                  className="rounded px-1 text-[9px] uppercase tracking-wide"
                  style={{ color: T.textMuted }}
                >
                  без акаунту
                </span>
              )}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(ref)}
                  className="rounded p-0.5 hover:bg-black/10"
                  aria-label="Видалити"
                >
                  <X size={11} />
                </button>
              )}
            </span>
          );
        })}
        {!disabled && !addOpen && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs"
            style={{
              backgroundColor: "transparent",
              border: `1px dashed ${T.borderStrong}`,
              color: T.textMuted,
            }}
          >
            <Plus size={11} />
            <span>{placeholder}</span>
          </button>
        )}
      </div>

      {addOpen && (
        <div className="mt-2">
          <AssigneeSelect
            value={null}
            onChange={add}
            roles={roles}
            includeEmployees={includeEmployees}
            placeholder={placeholder}
          />
        </div>
      )}
    </div>
  );
}
