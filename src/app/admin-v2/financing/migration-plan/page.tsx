import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  FileStack,
  Layers3,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveFirmScopeForRequest } from "@/lib/firm/server-scope";
import {
  DEFAULT_FIRM_ID,
  KNOWN_FIRMS,
  getActiveRoleFromSession,
  getFirmBrand,
  isHomeFirmFor,
} from "@/lib/firm/scope";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

const layers = [
  {
    title: "Кошторис",
    subtitle: "Що порахували",
    text: "Попередній або уточнений розрахунок. Допомагає оцінити проєкт, але ще не є фінансовим обліком.",
    color: T.amber,
    bg: T.amberSoft,
    icon: FileStack,
  },
  {
    title: "Бюджет",
    subtitle: "Що погодили",
    text: "Офіційний план доходу і витрат, по якому компанія реально домовилась працювати.",
    color: T.accentPrimary,
    bg: T.accentPrimarySoft,
    icon: Layers3,
  },
  {
    title: "Зобов'язання",
    subtitle: "Що вже відбулося",
    text: "Матеріали, роботи або акти вже є, але гроші ще не сплачені або не отримані.",
    color: T.warning,
    bg: T.warningSoft,
    icon: WalletCards,
  },
  {
    title: "Факт",
    subtitle: "Що реально пройшло",
    text: "Гроші реально заплатили або реально отримали. Лише це є грошовим фактом.",
    color: T.success,
    bg: T.successSoft,
    icon: Banknote,
  },
] as const;

const phases = [
  ["0", "Аудит", "Рахуємо поточні дані і фіксуємо базові підсумки до будь-яких змін."],
  ["1", "Стоп неправильним записам", "Зупиняємо нові записи з неправильною семантикою."],
  ["2", "Додаємо financeNature", "Новий смисловий шар додається без поломки старих екранів."],
  ["3", "Обережно заповнюємо історію", "Класифікуємо тільки ті старі записи, де правило однозначне."],
  ["4", "Перемикаємо читання", "Спочатку звіти і підсумки починають правильно читати нові сенси."],
  ["5", "Перемикаємо запис", "Потім по одному переводимо процеси на правильне створення нових записів."],
  ["6", "Оновлюємо інтерфейс", "Користувач починає бачити бюджет, зобов'язання і факт окремо."],
  ["7", "Прибираємо старі назви", "Лише після звірки відмовляємось від старого змішаного трактування."],
] as const;

const principles = [
  "Не змінювати сенс старого поля посеред переходу.",
  "Спочатку сумісність у читанні, потім нові записи.",
  "Не ламати механіку оплат постачальникам і рознесення платежів.",
  "Прогрес етапів не вважати реальними грошима.",
  "Не запускати масове оновлення без знімка і контрольних сум.",
] as const;

const nextSteps = [
  "Погодити простий словник: бюджет, зобов'язання, факт.",
  "Зібрати аудит нульової фази і зберегти базовий знімок.",
  "Прийняти одне бізнес-рішення: що означає підтверджена витрата виконроба.",
  "Вимкнути автосинхронізацію чернеток кошторисів у фінанси.",
  "Спочатку випустити діагностику і нове поле, а не весь перехід одразу.",
] as const;

export const dynamic = "force-dynamic";

export default async function FinanceMigrationPlanPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { firmId } = await resolveFirmScopeForRequest(session);
  if (!isHomeFirmFor(session, firmId)) redirect("/admin-v2");

  const activeRole = getActiveRoleFromSession(session, firmId);
  if (activeRole !== "SUPER_ADMIN") redirect("/admin-v2");

  const firmName =
    KNOWN_FIRMS[firmId ?? DEFAULT_FIRM_ID]?.name ??
    KNOWN_FIRMS[DEFAULT_FIRM_ID].name;
  const brand = getFirmBrand(firmId);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header
        className="overflow-hidden rounded-[28px] border p-6 sm:p-8"
        style={{
          background: `linear-gradient(135deg, ${T.panel} 0%, ${T.panelElevated} 100%)`,
          borderColor: T.borderSoft,
          boxShadow: T.shadow1,
        }}
      >
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin-v2/financing"
            className="inline-flex items-center gap-2 text-sm font-medium transition-opacity hover:opacity-80"
            style={{ color: T.textSecondary }}
          >
            <ArrowLeft className="size-4" />
            До фінансування
          </Link>
          <div
            className="rounded-full px-3 py-1 text-xs font-semibold"
            style={{
              background: brand.primary + "18",
              color: brand.primary,
              border: `1px solid ${brand.primary}33`,
            }}
          >
            {firmName}
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
          <div>
            <p
              className="mb-3 text-xs font-bold uppercase tracking-[0.24em]"
              style={{ color: T.textMuted }}
            >
              Безпечна міграція фінансів
            </p>
            <h1
              className="max-w-4xl text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ color: T.textPrimary }}
            >
              Як пояснити нову фінансову логіку через наш інтерфейс, без технічної плутанини
            </h1>
            <p
              className="mt-4 max-w-3xl text-sm leading-6 sm:text-base"
              style={{ color: T.textSecondary }}
            >
              Проблема не в тому, що в системі мало функцій. Проблема в тому, що
              один і той самий запис сьогодні може означати і план, і борг, і
              реальні гроші. Ця сторінка показує нову логіку простою мовою.
            </p>
          </div>

          <div
            className="rounded-[24px] border p-5"
            style={{
              background: `linear-gradient(135deg, ${brand.primary}12 0%, ${T.success}10 100%)`,
              borderColor: T.borderSoft,
            }}
          >
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5" style={{ color: T.success }} />
              <div>
                <div className="text-sm font-semibold" style={{ color: T.textPrimary }}>
                  Головна ідея
                </div>
                <p className="mt-2 text-sm leading-6" style={{ color: T.textSecondary }}>
                  Ми не переписуємо всю систему з нуля. Ми додаємо правильний
                  смисл до цифр і переводимо фінанси поетапно, без втрати даних.
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <div
          className="rounded-[24px] border p-5"
          style={{ background: T.panel, borderColor: T.borderSoft }}
        >
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="size-5" style={{ color: T.warning }} />
            <h2 className="text-lg font-semibold" style={{ color: T.textPrimary }}>
              Що не так зараз
            </h2>
          </div>
          <ul className="space-y-2 text-sm leading-6" style={{ color: T.textSecondary }}>
            <li><code>FACT</code> інколи означає реальну оплату.</li>
            <li><code>FACT</code> інколи означає прогрес робіт або неоплачений рахунок.</li>
            <li><code>PLAN</code> інколи означає чернетку, а інколи погоджений бюджет.</li>
            <li>Через це дашборд, борги і грошовий потік можуть показувати змішану картину.</li>
          </ul>
        </div>

        <div
          className="rounded-[24px] border p-5"
          style={{ background: T.panel, borderColor: T.borderSoft }}
        >
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="size-5" style={{ color: T.success }} />
            <h2 className="text-lg font-semibold" style={{ color: T.textPrimary }}>
              Що має бути після переходу
            </h2>
          </div>
          <ul className="space-y-2 text-sm leading-6" style={{ color: T.textSecondary }}>
            <li>Кошторис окремо від бюджету.</li>
            <li>Борг і зобов&apos;язання окремо від реальної оплати.</li>
            <li>Грошовий факт показує тільки те, що реально пройшло по грошах.</li>
            <li>Кожна роль бачить правдиву картину, а не один змішаний стовпець.</li>
          </ul>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4 md:grid-cols-2">
        {layers.map((layer) => {
          const Icon = layer.icon;
          return (
            <article
              key={layer.title}
              className="rounded-[24px] border p-5"
              style={{ background: layer.bg, borderColor: layer.color + "33" }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: layer.color }}>
                    {layer.subtitle}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold" style={{ color: T.textPrimary }}>
                    {layer.title}
                  </h3>
                </div>
                <div
                  className="flex size-11 items-center justify-center rounded-2xl"
                  style={{ background: "#ffffffaa", color: layer.color }}
                >
                  <Icon className="size-5" />
                </div>
              </div>
              <p className="text-sm leading-6" style={{ color: T.textSecondary }}>
                {layer.text}
              </p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div
          className="rounded-[24px] border p-5"
          style={{ background: T.panel, borderColor: T.borderSoft }}
        >
          <h2 className="text-lg font-semibold" style={{ color: T.textPrimary }}>
            Простий приклад з постачальником
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-6" style={{ color: T.textSecondary }}>
            <div className="rounded-2xl border p-3" style={{ borderColor: T.borderSoft }}>
              1. Привезли матеріал на <strong style={{ color: T.textPrimary }}>120 000</strong>.
            </div>
            <div className="rounded-2xl border p-3" style={{ borderColor: T.borderSoft }}>
              2. У системі з&apos;явився борг постачальнику на <strong style={{ color: T.textPrimary }}>120 000</strong>.
            </div>
            <div className="rounded-2xl border p-3" style={{ borderColor: T.borderSoft }}>
              3. Заплатили <strong style={{ color: T.textPrimary }}>40 000</strong>. Лише ця сума стала фактом.
            </div>
            <div className="rounded-2xl border p-3" style={{ borderColor: T.borderSoft }}>
              4. Решта <strong style={{ color: T.textPrimary }}>80 000</strong> лишається в зобов&apos;язаннях.
            </div>
          </div>
        </div>

        <div
          className="rounded-[24px] border p-5"
          style={{ background: T.panel, borderColor: T.borderSoft }}
        >
          <h2 className="text-lg font-semibold" style={{ color: T.textPrimary }}>
            Простий приклад з клієнтом
          </h2>
          <div className="mt-4 space-y-3 text-sm leading-6" style={{ color: T.textSecondary }}>
            <div className="rounded-2xl border p-3" style={{ borderColor: T.borderSoft }}>
              1. Клієнт погодив ціну <strong style={{ color: T.textPrimary }}>2 150 000</strong>.
            </div>
            <div className="rounded-2xl border p-3" style={{ borderColor: T.borderSoft }}>
              2. Підписали КБ-2 на <strong style={{ color: T.textPrimary }}>600 000</strong>. Це ще не гроші, а підтверджений дохід.
            </div>
            <div className="rounded-2xl border p-3" style={{ borderColor: T.borderSoft }}>
              3. Клієнт оплатив <strong style={{ color: T.textPrimary }}>500 000</strong>. Оце вже реальний факт доходу.
            </div>
            <div className="rounded-2xl border p-3" style={{ borderColor: T.borderSoft }}>
              4. Підписаний акт не дорівнює грошам на рахунку.
            </div>
          </div>
        </div>
      </section>

      <section
        className="rounded-[24px] border p-5"
        style={{ background: T.panel, borderColor: T.borderSoft }}
      >
        <h2 className="text-lg font-semibold" style={{ color: T.textPrimary }}>
          5 правил безпеки
        </h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {principles.map((item, index) => (
            <div
              key={item}
              className="rounded-2xl border p-4 text-sm leading-6"
              style={{ borderColor: T.borderSoft, background: T.panelElevated, color: T.textSecondary }}
            >
              <div
                className="mb-2 text-xs font-bold uppercase tracking-[0.18em]"
                style={{ color: T.textMuted }}
              >
                Правило {index + 1}
              </div>
              {item}
            </div>
          ))}
        </div>
      </section>

      <section
        className="rounded-[24px] border p-5"
        style={{ background: T.panel, borderColor: T.borderSoft }}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold" style={{ color: T.textPrimary }}>
              Етапи переходу
            </h2>
            <p className="mt-1 text-sm" style={{ color: T.textSecondary }}>
              Ми йдемо хвилями, а не одним ризикованим релізом.
            </p>
          </div>
          <Link
            href="/admin-v2/financing/migration-audit"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white transition active:scale-[0.98]"
            style={{ background: T.accentPrimary }}
          >
            Відкрити аудит
            <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {phases.map(([num, title, text]) => (
            <div
              key={num}
              className="rounded-2xl border p-4"
              style={{ borderColor: T.borderSoft, background: T.panelElevated }}
            >
              <div
                className="mb-2 inline-flex size-8 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: T.accentPrimary }}
              >
                {num}
              </div>
              <div className="text-sm font-semibold" style={{ color: T.textPrimary }}>
                {title}
              </div>
              <p className="mt-2 text-sm leading-6" style={{ color: T.textSecondary }}>
                {text}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <div
          className="rounded-[24px] border p-5"
          style={{ background: T.panel, borderColor: T.borderSoft }}
        >
          <h2 className="text-lg font-semibold" style={{ color: T.textPrimary }}>
            Що робимо прямо зараз
          </h2>
          <div className="mt-4 space-y-3">
            {nextSteps.map((step, index) => (
              <div
                key={step}
                className="flex gap-3 rounded-2xl border p-4"
                style={{ borderColor: T.borderSoft, background: T.panelElevated }}
              >
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: T.success }}
                >
                  {index + 1}
                </div>
                <p className="text-sm leading-6" style={{ color: T.textSecondary }}>
                  {step}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div
          className="rounded-[24px] border p-5"
          style={{
            background: `linear-gradient(135deg, ${T.accentPrimarySoft} 0%, ${T.successSoft} 100%)`,
            borderColor: T.borderSoft,
          }}
        >
          <h2 className="text-lg font-semibold" style={{ color: T.textPrimary }}>
            Підсумок для власника
          </h2>
          <p className="mt-4 text-sm leading-7" style={{ color: T.textSecondary }}>
            Після переходу система показує не одну змішану цифру, а окремо:
            що ми порахували, що погодили, що вже висить у боргах, і що реально
            пройшло по грошах. Це повертає довіру до фінансового екрана.
          </p>
          <div className="mt-5 rounded-2xl border p-4" style={{ borderColor: T.borderSoft, background: "#ffffffaa" }}>
            <p className="text-base font-semibold leading-7" style={{ color: T.textPrimary }}>
              Не переписуємо все з нуля. Робимо зрозумілий фінансовий сенс у вже існуючому UI.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
