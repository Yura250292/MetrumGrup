"use client";

import { useCallback, useEffect, useState } from "react";
import { X, ChevronRight, ChevronLeft } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { AiAvatar, type AiMood } from "./AiAvatar";

export type TutorialStep = {
  selector: string;
  title: string;
  description: string;
  position?: "top" | "bottom" | "left" | "right";
  mood?: AiMood;
};

export type TutorialScenario = {
  id: string;
  name: string;
  description: string;
  steps: TutorialStep[];
};

const ADMIN_TUTORIAL: TutorialScenario = {
  id: "admin",
  name: "Тур для адміністратора",
  description: "Огляд усіх можливостей платформи для керівника",
  steps: [
    { selector: '[href="/admin-v2"]', title: "Дашборд", description: "Головна сторінка з KPI: проєкти, бюджет, виручка, прострочені платежі, завдання.", mood: "wave" },
    { selector: '[href="/admin-v2/projects"]', title: "Проєкти", description: "Управління будівельними проєктами. Прогрес, бюджет, команда.", mood: "building" },
    { selector: '[href="/admin-v2/estimates"]', title: "Кошториси", description: "AI генератор створює кошторис за описом проєкту з реальними цінами.", mood: "thinking" },
    { selector: '[href="/admin-v2/financing"]', title: "Фінансування", description: "Контроль фінансів: надходження, витрати, категорії, аналітика.", mood: "typing" },
    { selector: '[href="/admin-v2/users"]', title: "Користувачі", description: "Команда: інженери, менеджери, фінансисти. Ролі та права доступу.", mood: "idle" },
    { selector: '[href="/admin-v2/clients"]', title: "Клієнти", description: "База клієнтів: контакти, проєкти, історія.", mood: "typing" },
    { selector: '[href="/admin-v2/resources"]', title: "Ресурси", description: "Працівники, обладнання, склад.", mood: "building" },
    { selector: '[title="AI Помічник"]', title: "AI Помічник", description: "Фінанси, пошук підрядників, завдання, аналіз рентабельності.", mood: "thumbsup" },
  ],
};

const MANAGER_TUTORIAL: TutorialScenario = {
  id: "manager",
  name: "Тур для менеджера",
  description: "Управління проєктами та командою",
  steps: [
    { selector: '[href="/admin-v2"]', title: "Дашборд", description: "Активні проєкти, прострочені завдання, фінанси за місяць.", mood: "wave" },
    { selector: '[href="/admin-v2/projects"]', title: "Проєкти", description: "Етапи, команда, завдання, фото-звіти, фінанси.", mood: "building" },
    { selector: '[href="/admin-v2/me"]', title: "Мої задачі", description: "Завдання по всіх проєктах. Пріоритети, дедлайни.", mood: "typing" },
    { selector: '[href="/admin-v2/chat"]', title: "Чат", description: "Спілкування з командою в контексті проєкту.", mood: "idle" },
    { selector: '[href="/admin-v2/estimates"]', title: "Кошториси", description: "AI генератор з реальними цінами.", mood: "thinking" },
    { selector: '[title="AI Помічник"]', title: "AI Помічник", description: "'Мої завдання?', 'Прострочені платежі?', 'Створи завдання'.", mood: "thumbsup" },
  ],
};

const MARKETER_TUTORIAL: TutorialScenario = {
  id: "marketer",
  name: "Тур для маркетолога",
  description: "Просування та робота з клієнтами",
  steps: [
    { selector: '[href="/admin-v2/cms"]', title: "CMS", description: "Новини та портфоліо на сайті.", mood: "wave" },
    { selector: '[href="/admin-v2/clients"]', title: "Клієнти", description: "Контакти для маркетингових кампаній.", mood: "typing" },
    { selector: '[href="/admin-v2/projects"]', title: "Кейси", description: "Фото, етапи — матеріал для соцмереж.", mood: "building" },
    { selector: '[href="/admin-v2/estimates"]', title: "AI Кошториси", description: "Демонстрація технологічності компанії.", mood: "thinking" },
    { selector: '[href="/admin-v2/feed"]', title: "Стрічка", description: "Фото-звіти, етапи — контент для публікацій.", mood: "idle" },
    { selector: '[title="AI Помічник"]', title: "AI Помічник", description: "'Завершені проєкти?', 'Фото за місяць?'.", mood: "thumbsup" },
  ],
};

export const TUTORIAL_SCENARIOS = [ADMIN_TUTORIAL, MANAGER_TUTORIAL, MARKETER_TUTORIAL];

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(v, max));
}

function calcPosition(
  rect: DOMRect | null,
  hint: string,
  cw: number,
  ch: number,
): React.CSSProperties {
  if (!rect) return { top: "50%", left: "50%", transform: "translate(-50%, -50%)" };

  const pad = 16;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const sides = [hint, "right", "bottom", "left", "top"];

  for (const s of sides) {
    let t: number, l: number;
    switch (s) {
      case "right":
        t = clamp(rect.top, pad, vh - ch - pad);
        l = rect.right + pad;
        if (l + cw < vw - pad) return { top: t, left: l };
        break;
      case "bottom":
        t = rect.bottom + pad;
        l = clamp(rect.left, pad, vw - cw - pad);
        if (t + ch < vh - pad) return { top: t, left: l };
        break;
      case "left":
        t = clamp(rect.top, pad, vh - ch - pad);
        l = rect.left - cw - pad;
        if (l > pad) return { top: t, left: l };
        break;
      case "top":
        t = rect.top - ch - pad;
        l = clamp(rect.left, pad, vw - cw - pad);
        if (t > pad) return { top: t, left: l };
        break;
    }
  }
  return { bottom: pad, right: pad };
}

export function AiTutorial({ scenario, onClose }: { scenario: TutorialScenario; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const cur = scenario.steps[step];
  const isLast = step === scenario.steps.length - 1;
  const isFirst = step === 0;

  useEffect(() => {
    if (!cur) return;
    const t = setTimeout(() => {
      const el = document.querySelector(cur.selector);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
        requestAnimationFrame(() => setTargetRect(el.getBoundingClientRect()));
      } else {
        setTargetRect(null);
      }
    }, 150);
    return () => clearTimeout(t);
  }, [cur, step]);

  const next = useCallback(() => { if (isLast) onClose(); else setStep((s) => s + 1); }, [isLast, onClose]);
  const prev = useCallback(() => { if (!isFirst) setStep((s) => s - 1); }, [isFirst]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") next();
      if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose, next, prev]);

  if (!cur) return null;

  const CW = 300, CH = 200;
  const pos = calcPosition(targetRect, cur.position || "right", CW, CH);

  return (
    <div className="fixed inset-0" style={{ zIndex: 99999 }}>
      <svg className="absolute inset-0 h-full w-full" onClick={onClose}>
        <defs>
          <mask id="tut-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - 8} y={targetRect.top - 8}
                width={targetRect.width + 16} height={targetRect.height + 16}
                rx={10} fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.65)" mask="url(#tut-mask)" />
      </svg>

      {targetRect && (
        <div className="absolute pointer-events-none rounded-xl" style={{
          top: targetRect.top - 8, left: targetRect.left - 8,
          width: targetRect.width + 16, height: targetRect.height + 16,
          border: `2px solid ${T.accentPrimary}`,
          boxShadow: `0 0 20px ${T.accentPrimary}50`,
        }} />
      )}

      <div className="absolute" style={{ ...pos, width: CW }}>
        <div className="flex items-start gap-2">
          <div className="shrink-0 rounded-xl p-1 shadow-lg hidden md:block"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
            <AiAvatar size="md" mood={cur.mood ?? "idle"} />
          </div>

          <div className="flex-1 rounded-xl p-3.5 shadow-2xl animate-fade-up"
            style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="md:hidden"><AiAvatar size="sm" mood={cur.mood ?? "idle"} /></div>
                <span className="text-[11px] font-medium" style={{ color: T.textMuted }}>
                  {step + 1} / {scenario.steps.length}
                </span>
              </div>
              <button onClick={onClose} className="rounded p-0.5" style={{ color: T.textMuted }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="mb-2 h-1 rounded-full overflow-hidden" style={{ backgroundColor: T.panelSoft }}>
              <div className="h-full rounded-full transition-all duration-500" style={{
                width: `${((step + 1) / scenario.steps.length) * 100}%`,
                background: `linear-gradient(90deg, ${T.accentPrimary}, ${T.accentSecondary})`,
              }} />
            </div>

            <h3 className="mb-1 text-[13px] font-bold" style={{ color: T.textPrimary }}>{cur.title}</h3>
            <p className="mb-3 text-[11px] leading-relaxed" style={{ color: T.textSecondary }}>{cur.description}</p>

            <div className="flex items-center justify-between">
              <button onClick={prev} disabled={isFirst}
                className="flex items-center gap-0.5 text-[11px] font-medium disabled:opacity-30"
                style={{ color: T.textSecondary }}>
                <ChevronLeft className="h-3 w-3" /> Назад
              </button>
              <button onClick={next}
                className="flex items-center gap-0.5 rounded-lg px-3 py-1 text-[11px] font-semibold text-white active:scale-95"
                style={{ background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})` }}>
                {isLast ? "Готово!" : "Далі"}
                {!isLast && <ChevronRight className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
