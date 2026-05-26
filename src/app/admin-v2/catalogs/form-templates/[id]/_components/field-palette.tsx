"use client";

import {
  Type,
  AlignLeft,
  Hash,
  Calendar,
  Clock,
  ListChecks,
  CheckSquare,
  Camera,
  PenLine,
  MapPin,
  Paperclip,
  Heading,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import type { FieldType } from "@/lib/forms/schema";

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Короткий текст",
  longtext: "Довгий текст",
  number: "Число",
  date: "Дата",
  datetime: "Дата + час",
  select: "Вибір (один)",
  multiselect: "Вибір (кілька)",
  checkbox: "Checkbox",
  photo: "Фото",
  signature: "Підпис",
  gps: "GPS",
  file: "Файл",
  section: "Секція (заголовок)",
};

const ICONS: Record<FieldType, typeof Type> = {
  text: Type,
  longtext: AlignLeft,
  number: Hash,
  date: Calendar,
  datetime: Clock,
  select: ListChecks,
  multiselect: ListChecks,
  checkbox: CheckSquare,
  photo: Camera,
  signature: PenLine,
  gps: MapPin,
  file: Paperclip,
  section: Heading,
};

const ORDER: FieldType[] = [
  "section",
  "text",
  "longtext",
  "number",
  "date",
  "datetime",
  "select",
  "multiselect",
  "checkbox",
  "photo",
  "signature",
  "gps",
  "file",
];

export function FieldPalette({ onAdd }: { onAdd: (t: FieldType) => void }) {
  return (
    <div>
      <h3
        className="mb-2 text-[11px] font-semibold uppercase tracking-wide"
        style={{ color: T.textMuted }}
      >
        Типи полів
      </h3>
      <div className="space-y-1">
        {ORDER.map((t) => {
          const Icon = ICONS[t];
          return (
            <button
              key={t}
              onClick={() => onAdd(t)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] transition hover:bg-white/[0.04]"
              style={{ color: T.textPrimary }}
            >
              <Icon size={14} style={{ color: T.textMuted }} />
              {FIELD_TYPE_LABELS[t]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
