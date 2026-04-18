"use client";

import { useCallback, useEffect, useState } from "react";
import { X, ChevronRight, ChevronLeft, GraduationCap } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

export type TutorialStep = {
  /** CSS selector of the element to highlight */
  selector: string;
  /** Title of this step */
  title: string;
  /** Description text */
  description: string;
  /** Position of tooltip relative to highlighted element */
  position?: "top" | "bottom" | "left" | "right";
};

export type TutorialScenario = {
  id: string;
  name: string;
  description: string;
  steps: TutorialStep[];
};

// ── Tutorial scenarios per role ───────────────────────────────

const ADMIN_TUTORIAL: TutorialScenario = {
  id: "admin",
  name: "Тур для адміністратора",
  description: "Огляд усіх можливостей платформи для керівника",
  steps: [
    {
      selector: '[href="/admin-v2"]',
      title: "Дашборд",
      description: "Головна сторінка з KPI: кількість проєктів, бюджет, виручка, прострочені платежі та активні завдання. Тут ви бачите стан всієї компанії одним поглядом.",
    },
    {
      selector: '[href="/admin-v2/projects"]',
      title: "Проєкти",
      description: "Управління всіма будівельними проєктами. Створюйте нові, відстежуйте прогрес по етапах, контролюйте бюджет та команду кожного проєкту.",
    },
    {
      selector: '[href="/admin-v2/estimates"]',
      title: "Кошториси",
      description: "Створення та управління кошторисами. AI генератор може створити кошторис за описом проєкту за лічені хвилини з реальними цінами.",
    },
    {
      selector: '[href="/admin-v2/financing"]',
      title: "Фінансування",
      description: "Повний контроль фінансів: надходження, витрати, категорії витрат, аналітика. Фільтруйте по проєктах, виявляйте перевищення бюджету.",
    },
    {
      selector: '[href="/admin-v2/users"]',
      title: "Користувачі",
      description: "Управління командою: додавайте інженерів, менеджерів, фінансистів. Кожна роль має свої права доступу — від повного контролю до перегляду.",
    },
    {
      selector: '[href="/admin-v2/clients"]',
      title: "Клієнти",
      description: "База всіх клієнтів компанії. Контактні дані, пов'язані проєкти, історія співпраці.",
    },
    {
      selector: '[href="/admin-v2/resources"]',
      title: "Ресурси",
      description: "Працівники, обладнання та склад. Відстежуйте хто де працює, яка техніка доступна, які матеріали на складі.",
      position: "right",
    },
    {
      selector: '[title="AI Помічник"]',
      title: "AI Помічник",
      description: "Ваш стратегічний бізнес-партнер! Запитайте про фінанси будь-якого проєкту, попросіть знайти підрядника в інтернеті, створити завдання або проаналізувати рентабельність.",
      position: "bottom",
    },
  ],
};

const MANAGER_TUTORIAL: TutorialScenario = {
  id: "manager",
  name: "Тур для менеджера",
  description: "Як ефективно управляти проєктами та командою",
  steps: [
    {
      selector: '[href="/admin-v2"]',
      title: "Ваш дашборд",
      description: "Швидкий огляд: активні проєкти, прострочені завдання, завдання на сьогодні, фінанси за місяць. Починайте день звідси.",
    },
    {
      selector: '[href="/admin-v2/projects"]',
      title: "Ваші проєкти",
      description: "Список всіх проєктів. Натисніть на проєкт щоб побачити деталі: етапи будівництва, команду, завдання, фото-звіти та фінанси.",
    },
    {
      selector: '[href="/admin-v2/me"]',
      title: "Мої задачі",
      description: "Ваші персональні завдання по всіх проєктах. Пріоритети, дедлайни, статуси — все в одному місці. Фільтруйте по проєкту чи пріоритету.",
    },
    {
      selector: '[href="/admin-v2/chat"]',
      title: "Командний чат",
      description: "Спілкуйтесь з командою напряму або в контексті проєкту. Обговорюйте кошториси, діліться файлами, вирішуйте питання оперативно.",
    },
    {
      selector: '[href="/admin-v2/estimates"]',
      title: "Кошториси",
      description: "Переглядайте та затверджуйте кошториси. Використовуйте AI генератор для швидкого створення — він знає ціни на матеріали та роботи.",
    },
    {
      selector: '[title="AI Помічник"]',
      title: "AI Помічник",
      description: "Ваш розумний помічник! Запитайте: 'Які мої завдання на сьогодні?', 'Покажи прострочені платежі', або 'Створи завдання в проєкті X'.",
      position: "bottom",
    },
  ],
};

const MARKETER_TUTORIAL: TutorialScenario = {
  id: "marketer",
  name: "Тур для маркетолога",
  description: "Інструменти для просування та роботи з клієнтами",
  steps: [
    {
      selector: '[href="/admin-v2/cms"]',
      title: "CMS — Контент",
      description: "Публікуйте новини компанії та оновлюйте портфоліо завершених проєктів. Контент автоматично з'являється на сайті.",
      position: "right",
    },
    {
      selector: '[href="/admin-v2/clients"]',
      title: "База клієнтів",
      description: "Всі клієнти компанії з контактами та проєктами. Використовуйте для підготовки маркетингових кампаній та follow-up.",
    },
    {
      selector: '[href="/admin-v2/projects"]',
      title: "Проєкти для кейсів",
      description: "Використовуйте дані проєктів для створення кейсів: фото до/після, етапи будівництва, бюджети. Фото-звіти — готовий матеріал для соцмереж.",
    },
    {
      selector: '[href="/admin-v2/estimates"]',
      title: "AI Кошториси",
      description: "Покажіть клієнтам можливості AI: за описом проєкту система генерує детальний кошторис. Відмінний інструмент для демонстрації технологічності компанії.",
    },
    {
      selector: '[href="/admin-v2/feed"]',
      title: "Стрічка активності",
      description: "Слідкуйте за подіями компанії: нові фото-звіти, завершені етапи, затверджені кошториси — джерело контенту для публікацій.",
      position: "right",
    },
    {
      selector: '[title="AI Помічник"]',
      title: "AI Помічник",
      description: "Запитайте: 'Покажи завершені проєкти для портфоліо', 'Які фото-звіти є за цей місяць?', або 'Розкажи як працює AI візуалізація для клієнтів'.",
      position: "bottom",
    },
  ],
};

export const TUTORIAL_SCENARIOS = [ADMIN_TUTORIAL, MANAGER_TUTORIAL, MARKETER_TUTORIAL];

// ── Tutorial Component ────────────────────────────────────────

type TutorialProps = {
  scenario: TutorialScenario;
  onClose: () => void;
};

export function AiTutorial({ scenario, onClose }: TutorialProps) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  const current = scenario.steps[step];
  const isLast = step === scenario.steps.length - 1;
  const isFirst = step === 0;

  // Find and highlight the target element
  useEffect(() => {
    if (!current) return;

    const el = document.querySelector(current.selector);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setTargetRect(null);
    }
  }, [current]);

  const handleNext = useCallback(() => {
    if (isLast) {
      onClose();
    } else {
      setStep((s) => s + 1);
    }
  }, [isLast, onClose]);

  const handlePrev = useCallback(() => {
    if (!isFirst) setStep((s) => s - 1);
  }, [isFirst]);

  // Keyboard navigation
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" || e.key === "Enter") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose, handleNext, handlePrev]);

  if (!current) return null;

  // Calculate tooltip position
  const pos = current.position || "bottom";
  const tooltipStyle: React.CSSProperties = {};
  if (targetRect) {
    const pad = 12;
    switch (pos) {
      case "bottom":
        tooltipStyle.top = targetRect.bottom + pad;
        tooltipStyle.left = Math.max(16, Math.min(targetRect.left, window.innerWidth - 340));
        break;
      case "top":
        tooltipStyle.bottom = window.innerHeight - targetRect.top + pad;
        tooltipStyle.left = Math.max(16, Math.min(targetRect.left, window.innerWidth - 340));
        break;
      case "right":
        tooltipStyle.top = targetRect.top;
        tooltipStyle.left = targetRect.right + pad;
        break;
      case "left":
        tooltipStyle.top = targetRect.top;
        tooltipStyle.right = window.innerWidth - targetRect.left + pad;
        break;
    }
  } else {
    tooltipStyle.top = "50%";
    tooltipStyle.left = "50%";
    tooltipStyle.transform = "translate(-50%, -50%)";
  }

  return (
    <div className="fixed inset-0" style={{ zIndex: 99999 }}>
      {/* Overlay with spotlight hole */}
      <svg className="absolute inset-0 h-full w-full">
        <defs>
          <mask id="spotlight-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left - 6}
                y={targetRect.top - 6}
                width={targetRect.width + 12}
                height={targetRect.height + 12}
                rx={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.6)"
          mask="url(#spotlight-mask)"
        />
      </svg>

      {/* Spotlight ring */}
      {targetRect && (
        <div
          className="absolute rounded-xl ring-2 ring-offset-2 animate-pulse pointer-events-none"
          style={{
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            outline: `2px solid ${T.accentPrimary}`,
            outlineOffset: "2px",
            boxShadow: `0 0 20px ${T.accentPrimary}40`,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        className="absolute w-[320px] rounded-2xl p-5 shadow-2xl animate-fade-up"
        style={{
          ...tooltipStyle,
          backgroundColor: T.panel,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        {/* Step indicator */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GraduationCap className="h-4 w-4" style={{ color: T.accentPrimary }} />
            <span className="text-xs font-medium" style={{ color: T.textMuted }}>
              {step + 1} / {scenario.steps.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 transition-colors hover:opacity-80"
            style={{ color: T.textMuted }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Progress bar */}
        <div className="mb-3 h-1 rounded-full overflow-hidden" style={{ backgroundColor: T.panelSoft }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${((step + 1) / scenario.steps.length) * 100}%`,
              background: `linear-gradient(90deg, ${T.accentPrimary}, ${T.accentSecondary})`,
            }}
          />
        </div>

        <h3 className="mb-2 text-sm font-bold" style={{ color: T.textPrimary }}>
          {current.title}
        </h3>
        <p className="mb-4 text-xs leading-relaxed" style={{ color: T.textSecondary }}>
          {current.description}
        </p>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button
            onClick={handlePrev}
            disabled={isFirst}
            className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-30"
            style={{ color: T.textSecondary }}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Назад
          </button>
          <button
            onClick={handleNext}
            className="flex items-center gap-1 rounded-lg px-4 py-1.5 text-xs font-semibold text-white transition-all active:scale-95"
            style={{
              background: `linear-gradient(135deg, ${T.accentPrimary}, ${T.accentSecondary})`,
            }}
          >
            {isLast ? "Завершити" : "Далі"}
            {!isLast && <ChevronRight className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
