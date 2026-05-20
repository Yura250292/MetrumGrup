"use client";

/**
 * SetupModes — компонент для setup-screen, який пропонує користувачу 3 шляхи
 * замість обов'язкового wizard'а:
 *
 * 1. Wizard (поточний flow з опитувалкою)
 * 2. Free-text — користувач описує проєкт текстом, AI парсить у wizardData
 * 3. AI-interview — AI ставить 3-5 динамічних питань
 *
 * Для interiorOnly (внутрішні роботи) wizard прихований за замовчуванням —
 * план: "для внутрішніх робіт не потрібен wizard щоб не плутатись".
 */

import { useState } from "react";
import { Sparkles, MessageCircle, ArrowRight, Loader2, Check, X } from "lucide-react";
import { T } from "./tokens";
import type { AiEstimateController } from "../_lib/use-controller";

type Mode = "none" | "wizard" | "freeText" | "interview";

export function SetupModes({
  controller,
  showWizard,
}: {
  controller: AiEstimateController;
  /** Якщо false — кнопка wizard прихована (для interiorOnly). */
  showWizard: boolean;
}) {
  const [activeMode, setActiveMode] = useState<Mode>("none");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <ModeCard
          icon={Sparkles}
          title="Опис проєкту текстом"
          subtitle="Швидко · вільна форма"
          desc="Опишіть проєкт своїми словами — AI зрозуміє і витягне параметри."
          active={activeMode === "freeText"}
          done={controller.freeTextDone}
          onClick={() => setActiveMode(activeMode === "freeText" ? "none" : "freeText")}
        />
        <ModeCard
          icon={MessageCircle}
          title="AI поставить питання"
          subtitle="3-5 кроків · персонально"
          desc="AI спитає тільки те, що дійсно потрібно — без зайвої опитувалки."
          active={activeMode === "interview"}
          done={controller.interviewDone}
          onClick={() => setActiveMode(activeMode === "interview" ? "none" : "interview")}
        />
        {showWizard && (
          <ModeCard
            icon={Sparkles}
            title="Майстер (опитувалка)"
            subtitle="Детально · для будівництва з нуля"
            desc="Класична форма з категоріями. Підходить коли треба максимум контролю."
            active={activeMode === "wizard"}
            done={controller.wizardCompleted}
            onClick={() => controller.openWizard()}
          />
        )}
      </div>

      {activeMode === "freeText" && <FreeTextPanel controller={controller} onDone={() => setActiveMode("none")} />}
      {activeMode === "interview" && <InterviewPanel controller={controller} onDone={() => setActiveMode("none")} />}
    </div>
  );
}

function ModeCard({
  icon: Icon,
  title,
  subtitle,
  desc,
  active,
  done,
  onClick,
}: {
  icon: any;
  title: string;
  subtitle: string;
  desc: string;
  active: boolean;
  done: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col gap-2.5 rounded-2xl p-5 text-left transition"
      style={{
        backgroundColor: active ? T.accentPrimarySoft : T.panel,
        border: `1px solid ${active ? T.accentPrimary : done ? T.success : T.borderSoft}`,
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-xl"
          style={{ backgroundColor: done ? T.successSoft : T.accentPrimarySoft }}
        >
          {done ? (
            <Check size={16} style={{ color: T.success }} />
          ) : (
            <Icon size={16} style={{ color: T.accentPrimary }} />
          )}
        </div>
        <span className="text-[10px] font-bold tracking-wider" style={{ color: T.textMuted }}>
          {subtitle}
        </span>
      </div>
      <div className="text-[14px] font-bold" style={{ color: T.textPrimary }}>
        {title}
      </div>
      <div className="text-[12px] leading-relaxed" style={{ color: T.textSecondary }}>
        {desc}
      </div>
    </button>
  );
}

function FreeTextPanel({
  controller,
  onDone,
}: {
  controller: AiEstimateController;
  onDone: () => void;
}) {
  const [text, setText] = useState(controller.freeTextDraft || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/estimates/parse-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Помилка");
      controller.applyParsedWizard(json.wizardData, { interiorOnly: json.interiorOnly });
      controller.setFreeTextDraft(text);
      controller.setFreeTextDone(true);
      onDone();
    } catch (err: any) {
      setError(err?.message || "Не вдалось розпарсити");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
      <div className="mb-3 text-[13px] font-semibold" style={{ color: T.textPrimary }}>
        Опишіть проєкт своїми словами
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Наприклад: ремонт двокімнатної квартири 65 м² на Подолі, премʼєрний клас, потрібна заміна сантехніки і електрики, плитка у санвузлах…"
        rows={6}
        className="w-full resize-none rounded-xl px-4 py-3 text-[13px] outline-none"
        style={{
          backgroundColor: T.panelSoft,
          border: `1px solid ${T.borderStrong}`,
          color: T.textPrimary,
        }}
      />
      {error && (
        <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" style={{ backgroundColor: T.dangerSoft, color: T.danger }}>
          {error}
        </div>
      )}
      <div className="mt-3 flex items-center justify-end gap-2">
        <button onClick={onDone} className="rounded-lg px-3 py-2 text-[12px] font-medium" style={{ color: T.textMuted }}>
          Скасувати
        </button>
        <button
          onClick={submit}
          disabled={loading || text.trim().length < 5}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: T.accentPrimary }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
          {loading ? "Розпарсити…" : "Розпарсити"}
        </button>
      </div>
    </div>
  );
}

function InterviewPanel({
  controller,
  onDone,
}: {
  controller: AiEstimateController;
  onDone: () => void;
}) {
  const [phase, setPhase] = useState<"loading" | "answering" | "building">("loading");
  const [questions, setQuestions] = useState<Array<{ id: string; text: string; hint?: string }>>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  // Eager-load питання при відкритті
  useState(() => {
    void (async () => {
      try {
        const res = await fetch("/api/admin/estimates/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "questions",
            context: {
              objectType: controller.wizardData.objectType,
              totalArea: controller.area,
              projectNotes: controller.projectNotes,
              hasFiles: controller.files.length > 0,
            },
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Помилка");
        setQuestions(json.questions || []);
        setPhase("answering");
      } catch (err: any) {
        setError(err?.message || "Не вдалось отримати питання");
      }
    })();
  });

  const submit = async () => {
    setPhase("building");
    setError("");
    try {
      const answersArray = questions.map((q) => ({
        question: q.text,
        answer: answers[q.id] || "",
      }));
      const res = await fetch("/api/admin/estimates/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "build",
          answers: answersArray,
          context: {
            objectType: controller.wizardData.objectType,
            totalArea: controller.area,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Помилка");
      controller.applyParsedWizard(json.wizardData, { interiorOnly: json.interiorOnly });
      controller.setInterviewDone(true);
      onDone();
    } catch (err: any) {
      setError(err?.message || "Не вдалось зібрати wizardData");
      setPhase("answering");
    }
  };

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
      <div className="mb-4 flex items-center justify-between">
        <div className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
          AI ставить питання
        </div>
        <button onClick={onDone}>
          <X size={16} style={{ color: T.textMuted }} />
        </button>
      </div>
      {phase === "loading" && (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: T.textMuted }}>
          <Loader2 size={14} className="animate-spin" /> Формую питання…
        </div>
      )}
      {phase === "answering" && (
        <div className="flex flex-col gap-3">
          {questions.length === 0 && <div className="text-[12px]" style={{ color: T.textMuted }}>Немає питань.</div>}
          {questions.map((q) => (
            <div key={q.id} className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                {q.text}
              </label>
              {q.hint && (
                <span className="text-[10px]" style={{ color: T.textMuted }}>
                  {q.hint}
                </span>
              )}
              <input
                value={answers[q.id] || ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                className="rounded-xl px-3.5 py-2.5 text-[13px] outline-none"
                style={{
                  backgroundColor: T.panelSoft,
                  border: `1px solid ${T.borderStrong}`,
                  color: T.textPrimary,
                }}
              />
            </div>
          ))}
        </div>
      )}
      {phase === "building" && (
        <div className="flex items-center gap-2 text-[12px]" style={{ color: T.accentPrimary }}>
          <Loader2 size={14} className="animate-spin" /> Збираю wizardData…
        </div>
      )}
      {error && (
        <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" style={{ backgroundColor: T.dangerSoft, color: T.danger }}>
          {error}
        </div>
      )}
      {phase === "answering" && questions.length > 0 && (
        <div className="mt-4 flex items-center justify-end gap-2">
          <button onClick={onDone} className="rounded-lg px-3 py-2 text-[12px] font-medium" style={{ color: T.textMuted }}>
            Скасувати
          </button>
          <button
            onClick={submit}
            className="flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[13px] font-bold text-white"
            style={{ backgroundColor: T.accentPrimary }}
          >
            <ArrowRight size={14} /> Готово
          </button>
        </div>
      )}
    </div>
  );
}

export function SimilarProjectsCard({ controller }: { controller: AiEstimateController }) {
  const items = controller.similarEstimates;
  if (!items || items.length === 0) return null;

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold" style={{ color: T.textPrimary }}>
          Подібні проєкти з вашого корпусу
        </div>
        <span className="text-[10px] font-medium" style={{ color: T.textMuted }}>
          {controller.corpusStats?.uniqueEstimates ?? 0} кошторисів у корпусі
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {items.map((it) => (
          <div
            key={it.estimateId}
            className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
            style={{ backgroundColor: T.panelElevated, border: `1px solid ${T.borderSoft}` }}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[12px] font-semibold" style={{ color: T.textPrimary }}>
                {it.title}
              </span>
              <span className="text-[10px]" style={{ color: T.textMuted }}>
                {it.totalAreaM2 ? `${it.totalAreaM2} м²` : ""}
                {it.pricePerM2 ? ` · ${new Intl.NumberFormat("uk-UA").format(it.pricePerM2)} ₴/м²` : ""}
                {it.itemCount ? ` · ${it.itemCount} позицій` : ""}
              </span>
            </div>
            <a
              href={`/admin-v2/estimates/${it.estimateId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] font-semibold"
              style={{ color: T.accentPrimary }}
            >
              Відкрити →
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}
