# UX Pattern 00 — Notion-style Drill-Down Drawer

> **Foundation document.** Всі модулі з roadmap-2026 (01-15) ОБОВ'ЯЗКОВО реалізують перегляд деталей через цей патерн. Це не feature — це cross-cutting UI-контракт.

---

## Mission

Замінити "перехід на окрему сторінку" на **slide-in drawer справа** з drill-down навігацією. Користувач не покидає контекст списку, але може заглиблюватися як завгодно глибоко (project → task → assignee → інша задача → документ → cost code → ...) з breadcrumb-навігацією назад.

## Чому це критично

Без єдиного патерну Metrum перетвориться на 15 різних "стилей деталей":
- Одні модулі — модал по центру, інші — окрема сторінка з back-button, треті — accordion inline
- Користувач втрачає контекст списку при кожному кліку
- Drill-down ("задача → виконавець → його календар → інша задача") неможливий без перевідкривання

Notion вирішив це **peek mode** — будь-яка сторінка/запис відкривається в drawer справа з можливістю йти все глибше, повертатися назад через історію, або promote до full page.

## Існуючий стан у Metrum

✅ Уже є: [src/app/admin-v2/me/_components/task-drawer-shared.tsx](../../src/app/admin-v2/me/_components/task-drawer-shared.tsx) — `SelfContainedTaskDrawer` (1393 рядки). Працює, deep-link `?task=<id>`, використовується в 3 місцях ([me-dashboard.tsx](../../src/app/admin-v2/me/_components/me-dashboard.tsx#L624), [team-view.tsx](../../src/app/admin-v2/team/_components/team-view.tsx#L19), [tab-tasks.tsx](../../src/app/admin-v2/projects/[id]/_components/tab-tasks.tsx#L530)).

❌ Чого немає:
- **Generic** компонент (зараз тільки Task-specific)
- **Drill-down stack** — клік на assignee всередині drawer не відкриває "drawer над drawer"
- **URL state з історією** — назад через browser back / ESC лише закриває верхній рівень
- **Mobile full-screen mode**
- Узгодженого API для нових модулів (Change Order, Equipment, RFI, Counterparty, etc.)

## Архітектурне рішення

### Один компонент-каркас: `<DrillDownDrawer>`

Місце: **`src/components/drawer/DrillDownDrawer.tsx`** (новий, спільний для усіх модулів)

```tsx
// API контракт
<DrillDownDrawerProvider>          {/* єдиний root, обгортає admin-v2 layout */}
  <YourPage />
  <DrillDownDrawer />               {/* render-target; читає stack з context */}
</DrillDownDrawerProvider>

// Використання звідусіль:
const drawer = useDrillDown();
drawer.open({ type: "task", id: "abc123" });
drawer.open({ type: "counterparty", id: "xyz" });  // drill-down — стек росте
drawer.back();                                       // pop
drawer.closeAll();
```

### Реєстр типів entities (extensibility)

Кожен модуль реєструє свій renderer:

```ts
// src/components/drawer/registry.ts
export const DRAWER_REGISTRY = {
  task:         () => import("./renderers/TaskDrawerContent"),
  project:      () => import("./renderers/ProjectDrawerContent"),
  counterparty: () => import("./renderers/CounterpartyDrawerContent"),
  changeOrder:  () => import("./renderers/ChangeOrderDrawerContent"),
  equipment:    () => import("./renderers/EquipmentDrawerContent"),
  rfi:          () => import("./renderers/RFIDrawerContent"),
  costCode:     () => import("./renderers/CostCodeDrawerContent"),
  document:     () => import("./renderers/DocumentDrawerContent"),
  incident:     () => import("./renderers/IncidentDrawerContent"),
  // ... додається кожним task'ом з roadmap
};
```

Кожен модуль з roadmap **обов'язково** додає свій renderer + реєструє тут.

### Поведінка stack

- Стек drawer'ів **візуально один** (один контейнер справа), але внутрішньо — масив `entities[]`.
- Заголовок drawer має **breadcrumb**: `Проєкт "Бабушкіна 12" › Задача "Залити фундамент" › Іван Петренко`.
- Клік на breadcrumb item — pop до того рівня.
- Поточний (верхній) рівень — повний view; попередні — collapsed у breadcrumb.

### URL state

- Query param `?d=<type>:<id>,<type>:<id>,...` — повний стек серіалізований.
- Browser back/forward — навігація по стеку (один крок = один pop).
- Deep-link `metrum.ua/admin-v2/projects/123?d=task:abc,user:xyz` — відкриє сторінку проєкту, далі відкриє drawer з task→user стеком.

### Mobile (≤768px)

- Drawer = **full-screen overlay**, не slide-in справа (місця нема).
- Header sticky з кнопкою назад (один tap = pop) і "×" (закрити стек).
- Swipe-right edge gesture = back.

### Desktop (>768px)

- Ширина drawer: 40% viewport, мінімум 480px, максимум 720px.
- Користувач може resize за драг-handle на лівому border'і drawer'а → зберігається в localStorage.
- Кнопка "↗ Open as page" — promote до окремої сторінки `/admin-v2/<type>/<id>` (для тих типів, що мають повну сторінку).
- Фон **не блюриться** (Notion-стиль) — список ліворуч видимий і клікабельний (новий клік = replace top of stack).

### Keyboard

| Клавіша | Дія |
|---|---|
| `Esc` | Pop top of stack. На останньому рівні — close. |
| `←` (за межами input) | Back (pop) |
| `Cmd+]` / `Cmd+[` | Forward / back по історії |
| `Cmd+K` | Quick switcher (опціонально) |

## Структура renderer'а (контракт для модулів)

Кожен модуль реалізує:

```tsx
// src/components/drawer/renderers/CounterpartyDrawerContent.tsx
export function CounterpartyDrawerContent({ id }: { id: string }) {
  const { data, isLoading } = useCounterparty(id);
  const drawer = useDrillDown();

  return (
    <DrawerLayout>
      <DrawerHeader title={data?.name} subtitle="Контрагент" />

      <DrawerToolbar>
        <Button onClick={() => router.push(`/admin-v2/counterparties/${id}`)}>
          ↗ Open as page
        </Button>
        {/* actions */}
      </DrawerToolbar>

      <DrawerBody>
        {/* Tabs: Огляд / Проєкти / Відгуки / Документи / Compliance */}
        <Tabs>
          <Tab title="Огляд">…</Tab>
          <Tab title="Проєкти">
            {data?.projects.map(p => (
              <RowLink
                key={p.id}
                onClick={() => drawer.open({ type: "project", id: p.id })}
              >
                {p.title}
              </RowLink>
            ))}
          </Tab>
          {/* … */}
        </Tabs>
      </DrawerBody>
    </DrawerLayout>
  );
}
```

**Ключове правило:** будь-яке посилання на іншу сутність всередині drawer — НЕ `<Link href="...">`, а `drawer.open({ type, id })`. Це і є drill-down.

## Міграція існуючого `SelfContainedTaskDrawer`

Не викидати — мігрувати:

1. Створити `DrillDownDrawer` + `DrillDownDrawerProvider`
2. Витягнути render-логіку з `SelfContainedTaskDrawer` у `TaskDrawerContent` (renderer)
3. Реєструвати в `DRAWER_REGISTRY.task`
4. Поточні call-sites (`me-dashboard.tsx`, `team-view.tsx`, `tab-tasks.tsx`) замінити на `useDrillDown().open({ type: "task", id })`
5. Old `?task=<id>` URL — підтримувати backward-compat (redirect → `?d=task:<id>`)

## Стилістика (узгоджена з motion system)

Згідно з [project_metrum_motion_system.md](../../../.claude/projects/-Users-admin-Igor-Shiba/memory/project_metrum_motion_system.md) — використати ваш premium motion CSS:

- Open: `transform: translateX(100%) → 0` за `300ms cubic-bezier(0.32, 0.72, 0, 1)` (iOS-like spring)
- Backdrop: opacity 0 → 0.2 за 200ms (Notion-light, не блюр)
- Stack push: попередній drawer scale(0.97) + opacity 0.6 (відчуття глибини)
- Stack pop: reverse

Готовий приклад токенів: уже використовуєте `T` з `@/app/ai-estimate-v2/_components/tokens` — взяти ті ж кольори.

## Implementation Plan

### Phase 1 — Foundation (1 чат, 1 тиждень)
1. [ ] Створити `src/components/drawer/DrillDownDrawer.tsx`
2. [ ] Створити `src/components/drawer/DrillDownDrawerProvider.tsx` (context + stack state)
3. [ ] Створити `src/components/drawer/use-drill-down.ts` (hook)
4. [ ] Створити `src/components/drawer/registry.ts` (lazy-import map)
5. [ ] Створити `src/components/drawer/url-state.ts` (serialize/parse `?d=...`)
6. [ ] Створити layouts: `DrawerHeader`, `DrawerToolbar`, `DrawerBody`, `DrawerFooter`, `Breadcrumb`
7. [ ] Wrap `src/app/admin-v2/layout.tsx` у `<DrillDownDrawerProvider>`
8. [ ] Mobile responsive (Tailwind breakpoints)
9. [ ] Keyboard handlers
10. [ ] Browser history sync

### Phase 2 — Migration of Task drawer (1 чат, 2-3 дні)
11. [ ] Витягнути content з `SelfContainedTaskDrawer` у `renderers/TaskDrawerContent.tsx`
12. [ ] Замінити internal `<Link>` на `drawer.open(...)`
13. [ ] Зареєструвати в `DRAWER_REGISTRY`
14. [ ] Оновити 3 call-sites
15. [ ] Backward-compat для `?task=<id>` deep-link
16. [ ] Тести E2E (Playwright) — open task → drill to project → drill to user → back stack

### Phase 3 — Per-module renderers (паралельно у кожному task'у з roadmap)
Кожен модуль (01-15) додає свій renderer як підзадачу. У файлах task'ів є секція **"Drill-Down Drawer renderer"** — реалізувати її.

## Acceptance Criteria

- [ ] Будь-який list item у admin-v2 при кліку відкриває drawer справа (не нову сторінку, не модал)
- [ ] У drawer'і можна клікнути на пов'язану сутність → відкривається новий рівень stack'у з breadcrumb
- [ ] ESC pop'ає один рівень (не закриває весь стек одразу)
- [ ] URL відображає повний стек (`?d=task:abc,user:xyz`) — деplink працює
- [ ] Mobile: drawer = full-screen, swipe-right = back
- [ ] Поточний `SelfContainedTaskDrawer` мігровано без втрати функціональності
- [ ] 5+ модулів з roadmap використовують `DrillDownDrawer` (Counterparty, Equipment, ChangeOrder, RFI, Document)
- [ ] Не більше 5 рівнів стеку (warning toast + автозакриття старих, щоб уникнути нескінченних)
- [ ] Performance: open drawer ≤100ms (lazy-loaded content скелетон поки fetch)

## Open Questions

- [ ] Чи дозволяти **promote drawer → split-view** (Notion має це для двох сторінок поряд)? Перший реліз — ні, оцінити після фідбеку.
- [ ] Збереження стану stack між сесіями (localStorage)? Можливо для останніх 10 переглянутих.
- [ ] Як рендерити в Client Portal (`src/app/dashboard/*`) — окремий provider чи спільний? Рекомендація: окремий (різні permissions, простіші типи).
- [ ] Чи робити окремий **side-by-side** mode для двох drawer'ів (compare counterparties, e.g.)? Phase 4, не зараз.

## 🚨 Cross-cutting Impact на інші задачі

Цей патерн **переписує контракт UI** для всіх модулів з roadmap. Кожен з 01-15 повинен:
1. Замість окремої сторінки `[id]/page.tsx` — додати `DrawerContent` renderer
2. Залишити повну сторінку як `↗ Open as page` (для shareable URL, друку, печаті)
3. У задачі додати checklist item "Реалізувати DrillDownRenderer"

**Серіалізація:** Phase 1 + Phase 2 виконати **ДО** початку модульних задач (01-15). Інакше кожен модуль буде писати свій варіант → потім переписувати.

## References

- [Notion peek mode UX overview](https://www.notion.com/help/keyboard-shortcuts) (cmd+shift+enter — open as page from peek)
- Existing Metrum drawer: [task-drawer-shared.tsx](../../src/app/admin-v2/me/_components/task-drawer-shared.tsx)
- Motion system memory: `project_metrum_motion_system`
- Tokens: `src/app/ai-estimate-v2/_components/tokens.ts`
- Linear, Height, Sentry — інші продукти з drill-down drawer (для inspiration)

---

> **Усім agentам/розробникам, що відкривають files 01-15:** перед стартом прочитати цей документ. Кожна задача містить секцію "Drill-Down Drawer Renderer" з посиланням сюди.
