"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Eye,
  Plus,
  GripVertical,
  Trash2,
  History,
} from "lucide-react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { FORM_CATEGORY_LABELS } from "@/lib/constants";
import type { FormCategory } from "@prisma/client";
import type { FieldDef, FieldType, FormSchema } from "@/lib/forms/schema";
import { FieldEditor, makeBlankField } from "./field-editor";
import { FieldPalette, FIELD_TYPE_LABELS } from "./field-palette";
import { FormPreviewModal } from "./form-preview-modal";
import { RevisionsModal } from "./revisions-modal";

type Revision = {
  id: string;
  version: number;
  changeNote: string | null;
  createdAt: string;
  createdBy: { id: string; name: string };
};

type Props = {
  template: {
    id: string;
    name: string;
    description: string | null;
    category: FormCategory;
    version: number;
    isActive: boolean;
    schema: FormSchema;
    submissionCount: number;
    revisions: Revision[];
  };
};

const CATEGORIES: FormCategory[] = [
  "DAILY_REPORT",
  "SAFETY",
  "QUALITY",
  "ACCEPTANCE",
  "KB2V",
  "KB3",
  "CUSTOM",
];

export function FormBuilderClient({ template }: Props) {
  const router = useRouter();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? "");
  const [category, setCategory] = useState<FormCategory>(template.category);
  const [fields, setFields] = useState<FieldDef[]>(template.schema.fields ?? []);
  const [selectedKey, setSelectedKey] = useState<string | null>(
    fields[0]?.key ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showRevisions, setShowRevisions] = useState(false);
  const [changeNote, setChangeNote] = useState("");

  const initialSchemaSerialized = useMemo(
    () => JSON.stringify(template.schema),
    [template.schema],
  );
  const currentSchema: FormSchema = useMemo(
    () => ({ fields, meta: template.schema.meta }),
    [fields, template.schema.meta],
  );
  const dirty =
    JSON.stringify(currentSchema) !== initialSchemaSerialized ||
    name !== template.name ||
    description !== (template.description ?? "") ||
    category !== template.category;

  const schemaChanged =
    JSON.stringify(currentSchema) !== initialSchemaSerialized;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  function handleAddField(type: FieldType) {
    const newField = makeBlankField(type, fields.length);
    setFields((prev) => [...prev, newField]);
    setSelectedKey(newField.key);
  }

  function handleUpdateField(key: string, patch: Partial<FieldDef>) {
    setFields((prev) =>
      prev.map((f) => (f.key === key ? ({ ...f, ...patch } as FieldDef) : f)),
    );
  }

  function handleRemoveField(key: string) {
    setFields((prev) => prev.filter((f) => f.key !== key));
    if (selectedKey === key) setSelectedKey(null);
  }

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setFields((prev) => {
      const from = prev.findIndex((f) => f.key === active.id);
      const to = prev.findIndex((f) => f.key === over.id);
      if (from === -1 || to === -1) return prev;
      return arrayMove(prev, from, to);
    });
  }

  async function handleSave() {
    if (schemaChanged && !changeNote.trim()) {
      const note = window.prompt("Опишіть, що ви змінили у цій версії:");
      if (!note) return;
      setChangeNote(note);
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/form-templates/${template.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          schema: schemaChanged ? currentSchema : undefined,
          changeNote: schemaChanged ? changeNote.trim() || "Зміни schema" : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Помилка збереження");
        return;
      }
      setChangeNote("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  const selected = fields.find((f) => f.key === selectedKey) ?? null;

  return (
    <div className="flex h-[calc(100vh-3rem)] flex-col">
      <header
        className="flex items-center gap-3 border-b px-6 py-3"
        style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
      >
        <Link
          href="/admin-v2/catalogs/form-templates"
          className="inline-flex items-center gap-1 text-[13px]"
          style={{ color: T.textMuted }}
        >
          <ArrowLeft size={14} />
          Шаблони
        </Link>
        <div className="ml-3 flex flex-1 items-center gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 bg-transparent text-base font-semibold outline-none"
            style={{ color: T.textPrimary }}
            placeholder="Назва шаблону"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as FormCategory)}
            className="rounded-md border bg-transparent px-2 py-1 text-[12px]"
            style={{ borderColor: T.borderSoft, color: T.textPrimary }}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {FORM_CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
          <span className="text-[11px]" style={{ color: T.textMuted }}>
            v{template.version}
            {schemaChanged ? " · буде v" + (template.version + 1) : ""}
          </span>
        </div>
        <button
          onClick={() => setShowRevisions(true)}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px]"
          style={{ borderColor: T.borderSoft, color: T.textPrimary }}
        >
          <History size={14} />
          Версії
        </button>
        <button
          onClick={() => setShowPreview(true)}
          className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-[12px]"
          style={{ borderColor: T.borderSoft, color: T.textPrimary }}
        >
          <Eye size={14} />
          Перегляд
        </button>
        <button
          onClick={handleSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Save size={14} />
          Зберегти
        </button>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Palette (left) */}
        <aside
          className="w-56 shrink-0 overflow-y-auto border-r p-3"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
        >
          <FieldPalette onAdd={handleAddField} />
        </aside>

        {/* Canvas (center) */}
        <main className="flex-1 overflow-y-auto p-6" style={{ backgroundColor: T.background }}>
          <div className="mb-4">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Короткий опис форми (для виконроба)"
              className="w-full rounded-md border bg-transparent px-3 py-2 text-[13px] outline-none"
              style={{ borderColor: T.borderSoft, color: T.textPrimary }}
            />
          </div>

          {fields.length === 0 ? (
            <div
              className="rounded-lg border-2 border-dashed p-12 text-center"
              style={{ borderColor: T.borderSoft, color: T.textMuted }}
            >
              Перетягніть або натисніть на поле зліва, щоб додати його.
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={fields.map((f) => f.key)} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {fields.map((f) => (
                    <SortableFieldRow
                      key={f.key}
                      field={f}
                      selected={selectedKey === f.key}
                      onSelect={() => setSelectedKey(f.key)}
                      onRemove={() => handleRemoveField(f.key)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <button
            onClick={() => handleAddField("text")}
            className="mt-4 inline-flex items-center gap-1 text-[12px]"
            style={{ color: T.accentPrimary }}
          >
            <Plus size={14} />
            Додати поле
          </button>
        </main>

        {/* Field editor (right) */}
        <aside
          className="w-80 shrink-0 overflow-y-auto border-l p-4"
          style={{ borderColor: T.borderSoft, backgroundColor: T.panel }}
        >
          {selected ? (
            <FieldEditor
              field={selected}
              onChange={(patch) => handleUpdateField(selected.key, patch)}
              onKeyChange={(newKey) => {
                if (fields.some((f) => f.key === newKey && f.key !== selected.key)) {
                  alert("Поле з таким ключем уже існує");
                  return;
                }
                setFields((prev) =>
                  prev.map((f) =>
                    f.key === selected.key ? ({ ...f, key: newKey } as FieldDef) : f,
                  ),
                );
                setSelectedKey(newKey);
              }}
              allFieldKeys={fields.filter((f) => f.key !== selected.key).map((f) => f.key)}
            />
          ) : (
            <div className="text-[12px]" style={{ color: T.textMuted }}>
              Виберіть поле зліва для редагування.
            </div>
          )}
        </aside>
      </div>

      {showPreview && (
        <FormPreviewModal
          schema={currentSchema}
          name={name}
          onClose={() => setShowPreview(false)}
        />
      )}
      {showRevisions && (
        <RevisionsModal
          revisions={template.revisions}
          templateId={template.id}
          onClose={() => setShowRevisions(false)}
        />
      )}
    </div>
  );
}

function SortableFieldRow({
  field,
  selected,
  onSelect,
  onRemove,
}: {
  field: FieldDef;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.key });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: T.panel,
        borderColor: selected ? T.accentPrimary : T.borderSoft,
      }}
      className="flex items-center gap-3 rounded-md border p-3 transition"
    >
      <button {...attributes} {...listeners} className="cursor-grab" aria-label="Перетягнути">
        <GripVertical size={16} style={{ color: T.textMuted }} />
      </button>
      <button onClick={onSelect} className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <span className="text-[13px]" style={{ color: T.textPrimary }}>
            {field.label || <em style={{ color: T.textMuted }}>без назви</em>}
          </span>
          {field.required && (
            <span className="text-[10px]" style={{ color: T.danger }}>
              *
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px]" style={{ color: T.textMuted }}>
          {FIELD_TYPE_LABELS[field.type]} · key=<code>{field.key}</code>
        </div>
      </button>
      <button onClick={onRemove} className="opacity-0 transition group-hover:opacity-100">
        <Trash2 size={14} style={{ color: T.textMuted }} />
      </button>
      <button onClick={onRemove} title="Видалити">
        <Trash2 size={14} style={{ color: T.textMuted }} />
      </button>
    </div>
  );
}
