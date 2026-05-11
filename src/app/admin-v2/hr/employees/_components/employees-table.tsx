"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Mail,
  MoreHorizontal,
  Rows3,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { ROLE_COLORS, ROLE_LABELS } from "../../../_lib/role-display";
import { formatCurrency } from "@/lib/utils";

type LinkedUser = {
  id: string;
  email: string;
  role: string;
  isActive: boolean;
};

type EmploymentType = "FULL" | "PART" | "CONTRACT";
type DeferralType = "NONE" | "RESERVATION" | "DEFERMENT";

type SalaryPeriod = {
  baseSalary: number | string;
  officialPart: number | string | null;
  coefficient: number | string;
  effectiveFrom: string;
  effectiveTo: string | null;
  currency: string;
};

export type EmployeeRow = {
  id: string;
  fullName: string;
  lastName: string | null;
  firstName: string | null;
  middleName: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  birthDate: string | null;
  hiredAt: string | null;
  terminatedAt: string | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  notes: string | null;
  isActive: boolean;
  employmentType: EmploymentType;
  employmentRate: number | string;
  deferralType: DeferralType;
  deferralUntil: string | null;
  userId: string | null;
  user: LinkedUser | null;
  salaries?: SalaryPeriod[];
};

export type DisplayMode = "grouped" | "list";

const DEFERRAL_LABEL: Record<DeferralType, string> = {
  NONE: "—",
  RESERVATION: "Бронювання",
  DEFERMENT: "Відстрочка",
};

const NO_DEPARTMENT = "__no_department__";

type ColumnKey =
  | "name"
  | "position"
  | "department"
  | "phone"
  | "email"
  | "user"
  | "role"
  | "deferral"
  | "salary"
  | "notes";

type Column = {
  key: ColumnKey;
  label: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
};

type Density = "compact" | "normal" | "relaxed";

const DENSITY_PY: Record<Density, string> = {
  compact: "py-[3px]",
  normal: "py-1.5",
  relaxed: "py-2.5",
};

const ACTIONS_W = 28;
const MIN_COL_W = 60;
const MAX_COL_W = 800;

const DEFAULT_WIDTHS: Record<ColumnKey, number> = {
  name: 180,
  position: 170,
  department: 150,
  phone: 110,
  email: 220,
  user: 90,
  role: 120,
  deferral: 130,
  salary: 110,
  notes: 200,
};

const STORAGE_KEY = "metrum.hr.employees.tableLayout.v1";

function shortName(emp: EmployeeRow): string {
  const last = emp.lastName?.trim();
  const first = emp.firstName?.trim();
  const middle = emp.middleName?.trim();
  if (last) {
    const initials = [first, middle]
      .map((p) => (p ? `${p[0].toUpperCase()}.` : ""))
      .filter(Boolean)
      .join("");
    return initials ? `${last} ${initials}` : last;
  }
  return emp.fullName || "—";
}

function activeSalary(emp: EmployeeRow): SalaryPeriod | null {
  return emp.salaries?.[0] ?? null;
}

function deferralText(emp: EmployeeRow): string {
  if (emp.deferralType === "NONE") return "—";
  const base = DEFERRAL_LABEL[emp.deferralType];
  if (!emp.deferralUntil) return base;
  const d = new Date(emp.deferralUntil);
  if (isNaN(d.getTime())) return base;
  return `${base} до ${d.toLocaleDateString("uk-UA")}`;
}

export function EmployeesTable({
  items,
  mode,
  canSeeSalary,
}: {
  items: EmployeeRow[];
  mode: DisplayMode;
  canSeeSalary: boolean;
}) {
  const [sortKey, setSortKey] = useState<ColumnKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [hiddenCols, setHiddenCols] = useState<Set<ColumnKey>>(new Set());
  const [widths, setWidths] = useState<Record<ColumnKey, number>>(DEFAULT_WIDTHS);
  const [density, setDensity] = useState<Density>("normal");

  // Load layout from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        widths?: Partial<Record<ColumnKey, number>>;
        hidden?: ColumnKey[];
        density?: Density;
      };
      if (parsed.widths) {
        setWidths((w) => ({ ...w, ...parsed.widths }));
      }
      if (Array.isArray(parsed.hidden)) {
        setHiddenCols(new Set(parsed.hidden));
      }
      if (parsed.density) setDensity(parsed.density);
    } catch {
      /* ignore */
    }
  }, []);

  const persist = useCallback(
    (next: {
      widths?: Record<ColumnKey, number>;
      hidden?: Set<ColumnKey>;
      density?: Density;
    }) => {
      try {
        const payload = {
          widths: next.widths ?? widths,
          hidden: Array.from(next.hidden ?? hiddenCols),
          density: next.density ?? density,
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        /* ignore */
      }
    },
    [widths, hiddenCols, density],
  );

  const columns = useMemo<Column[]>(() => {
    const cols: Column[] = [
      { key: "name", label: "ПІБ скорочено", sortable: true },
      { key: "position", label: "Посада", sortable: true },
    ];
    if (mode === "list") {
      cols.push({ key: "department", label: "Підрозділ", sortable: true });
    }
    cols.push(
      { key: "phone", label: "Телефон" },
      { key: "email", label: "Електронна пошта" },
      { key: "user", label: "Користувач" },
      { key: "role", label: "Роль" },
      { key: "deferral", label: "Відстрочка" },
    );
    if (canSeeSalary) {
      cols.push({ key: "salary", label: "Зарплата", sortable: true, align: "right" });
    }
    cols.push({ key: "notes", label: "Додатково" });
    return cols.filter((c) => !hiddenCols.has(c.key));
  }, [mode, canSeeSalary, hiddenCols]);

  const sorted = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => compare(a, b, sortKey) * (sortDir === "asc" ? 1 : -1));
    return arr;
  }, [items, sortKey, sortDir]);

  const grouped = useMemo(() => {
    if (mode !== "grouped") return null;
    const map = new Map<string, { name: string; items: EmployeeRow[] }>();
    for (const e of sorted) {
      const key = e.department?.id ?? NO_DEPARTMENT;
      const name = e.department?.name ?? "Без підрозділу";
      if (!map.has(key)) map.set(key, { name, items: [] });
      map.get(key)!.items.push(e);
    }
    return Array.from(map.entries()).sort(([ka, a], [kb, b]) => {
      if (ka === NO_DEPARTMENT) return 1;
      if (kb === NO_DEPARTMENT) return -1;
      return a.name.localeCompare(b.name, "uk");
    });
  }, [mode, sorted]);

  function toggleSort(key: ColumnKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function toggleCol(key: ColumnKey) {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persist({ hidden: next });
      return next;
    });
  }

  const setWidth = useCallback((key: ColumnKey, w: number) => {
    setWidths((prev) => ({ ...prev, [key]: clamp(w, MIN_COL_W, MAX_COL_W) }));
  }, []);

  const commitWidths = useCallback(() => {
    persist({ widths });
  }, [persist, widths]);

  function setDensityAndSave(d: Density) {
    setDensity(d);
    persist({ density: d });
  }

  function resetLayout() {
    setWidths(DEFAULT_WIDTHS);
    setDensity("normal");
    setHiddenCols(new Set());
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  const gridTemplate = useMemo(
    () =>
      columns
        .map((c) => `${widths[c.key] ?? DEFAULT_WIDTHS[c.key]}px`)
        .join(" ") + ` ${ACTIONS_W}px`,
    [columns, widths],
  );

  const totalWidth =
    columns.reduce((s, c) => s + (widths[c.key] ?? DEFAULT_WIDTHS[c.key]), 0) +
    ACTIONS_W;

  return (
    <div
      className="overflow-x-auto rounded-2xl text-[12.5px]"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderStrong}`,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <div style={{ minWidth: `${totalWidth}px` }}>
        <TableHeader
          columns={columns}
          gridTemplate={gridTemplate}
          sortKey={sortKey}
          sortDir={sortDir}
          onSort={toggleSort}
          hiddenCols={hiddenCols}
          onToggleCol={toggleCol}
          allCols={mode === "list" ? ALL_LIST_COLS : ALL_GROUPED_COLS}
          canSeeSalary={canSeeSalary}
          widths={widths}
          onResize={setWidth}
          onCommitResize={commitWidths}
          density={density}
          onDensityChange={setDensityAndSave}
          onResetLayout={resetLayout}
        />

        <div className="flex flex-col">
          {mode === "grouped" && grouped ? (
            grouped.map(([key, group]) => (
              <DepartmentGroup
                key={key}
                name={group.name}
                items={group.items}
                columns={columns}
                gridTemplate={gridTemplate}
                canSeeSalary={canSeeSalary}
                density={density}
              />
            ))
          ) : (
            sorted.map((e) => (
              <EmployeeRowView
                key={e.id}
                employee={e}
                columns={columns}
                gridTemplate={gridTemplate}
                canSeeSalary={canSeeSalary}
                density={density}
              />
            ))
          )}

          {sorted.length === 0 && (
            <div
              className="px-4 py-10 text-center text-sm"
              style={{ color: T.textMuted }}
            >
              Нічого не знайдено.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const ALL_GROUPED_COLS: ColumnKey[] = [
  "name",
  "position",
  "phone",
  "email",
  "user",
  "role",
  "deferral",
  "salary",
  "notes",
];

const ALL_LIST_COLS: ColumnKey[] = [
  "name",
  "position",
  "department",
  "phone",
  "email",
  "user",
  "role",
  "deferral",
  "salary",
  "notes",
];

const COL_LABELS: Record<ColumnKey, string> = {
  name: "ПІБ скорочено",
  position: "Посада",
  department: "Підрозділ",
  phone: "Телефон",
  email: "Електронна пошта",
  user: "Користувач",
  role: "Роль",
  deferral: "Відстрочка",
  salary: "Зарплата",
  notes: "Додатково",
};

function TableHeader({
  columns,
  gridTemplate,
  sortKey,
  sortDir,
  onSort,
  hiddenCols,
  onToggleCol,
  allCols,
  canSeeSalary,
  widths,
  onResize,
  onCommitResize,
  density,
  onDensityChange,
  onResetLayout,
}: {
  columns: Column[];
  gridTemplate: string;
  sortKey: ColumnKey;
  sortDir: "asc" | "desc";
  onSort: (k: ColumnKey) => void;
  hiddenCols: Set<ColumnKey>;
  onToggleCol: (k: ColumnKey) => void;
  allCols: ColumnKey[];
  canSeeSalary: boolean;
  widths: Record<ColumnKey, number>;
  onResize: (k: ColumnKey, w: number) => void;
  onCommitResize: () => void;
  density: Density;
  onDensityChange: (d: Density) => void;
  onResetLayout: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const visibleAll = allCols.filter((c) => c !== "salary" || canSeeSalary);

  return (
    <div
      className="sticky top-0 z-[2] grid items-stretch text-[10px] font-semibold uppercase tracking-wider"
      style={{
        gridTemplateColumns: gridTemplate,
        backgroundColor: T.panelSoft,
        color: T.textMuted,
        borderBottom: `1px solid ${T.borderStrong}`,
      }}
    >
      {columns.map((c, idx) => {
        const isSorted = sortKey === c.key;
        const SortIcon = !c.sortable
          ? null
          : isSorted
            ? sortDir === "asc"
              ? ArrowUp
              : ArrowDown
            : ArrowUpDown;
        const isLast = idx === columns.length - 1;
        return (
          <div
            key={c.key}
            className="relative flex min-w-0 items-center"
            style={{
              borderRight: isLast ? "none" : `1px solid ${T.borderSoft}`,
            }}
          >
            <button
              type="button"
              disabled={!c.sortable}
              onClick={() => c.sortable && onSort(c.key)}
              className="flex min-w-0 flex-1 items-center gap-1 truncate px-2 py-2 text-left transition-colors duration-150"
              style={{
                justifyContent:
                  c.align === "right"
                    ? "flex-end"
                    : c.align === "center"
                      ? "center"
                      : "flex-start",
                color: isSorted ? T.textPrimary : T.textMuted,
                cursor: c.sortable ? "pointer" : "default",
              }}
              title={c.label}
            >
              <span className="truncate">{c.label}</span>
              {SortIcon && (
                <SortIcon size={10} className="shrink-0 opacity-70" />
              )}
            </button>
            <ResizeHandle
              colKey={c.key}
              currentWidth={widths[c.key] ?? DEFAULT_WIDTHS[c.key]}
              onResize={onResize}
              onCommit={onCommitResize}
            />
          </div>
        );
      })}
      <div className="relative flex items-center justify-end px-1">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-6 w-6 items-center justify-center rounded transition-colors duration-150 hover:bg-black/5"
          style={{ color: T.textMuted }}
          aria-label="Налаштування таблиці"
          title="Налаштування таблиці"
        >
          <MoreHorizontal size={12} />
        </button>
        {menuOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setMenuOpen(false)}
            />
            <div
              className="absolute right-0 top-full z-20 mt-1 w-60 overflow-hidden rounded-xl py-1 text-[12px] normal-case tracking-normal"
              style={{
                backgroundColor: T.panel,
                border: `1px solid ${T.borderStrong}`,
                boxShadow: "0 10px 24px rgba(15,23,42,0.18)",
              }}
            >
              <div
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: T.textMuted }}
              >
                Висота рядка
              </div>
              <div className="flex gap-1 px-2 pb-2">
                {(
                  [
                    { id: "compact" as const, label: "Щільно" },
                    { id: "normal" as const, label: "Норма" },
                    { id: "relaxed" as const, label: "Вільно" },
                  ]
                ).map((d) => {
                  const active = density === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => onDensityChange(d.id)}
                      className="flex-1 rounded-md px-2 py-1 text-[11px] font-semibold transition-colors duration-150"
                      style={{
                        backgroundColor: active ? T.panelSoft : "transparent",
                        color: active ? T.textPrimary : T.textMuted,
                        border: `1px solid ${active ? T.borderStrong : "transparent"}`,
                      }}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <div
                className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider"
                style={{
                  color: T.textMuted,
                  borderTop: `1px solid ${T.borderSoft}`,
                }}
              >
                Колонки
              </div>
              {visibleAll.map((k) => {
                const hidden = hiddenCols.has(k);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onToggleCol(k)}
                    className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-black/5"
                    style={{ color: T.textPrimary }}
                  >
                    <span>{COL_LABELS[k]}</span>
                    {!hidden && (
                      <Check size={12} style={{ color: T.accentPrimary }} />
                    )}
                  </button>
                );
              })}
              <div
                className="flex items-center gap-2 px-3 py-2"
                style={{ borderTop: `1px solid ${T.borderSoft}` }}
              >
                <Rows3 size={11} style={{ color: T.textMuted }} />
                <button
                  type="button"
                  onClick={() => {
                    onResetLayout();
                    setMenuOpen(false);
                  }}
                  className="text-[11px] font-semibold hover:underline"
                  style={{ color: T.accentPrimary }}
                >
                  Скинути розмітку
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ResizeHandle({
  colKey,
  currentWidth,
  onResize,
  onCommit,
}: {
  colKey: ColumnKey;
  currentWidth: number;
  onResize: (k: ColumnKey, w: number) => void;
  onCommit: () => void;
}) {
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    function onMove(e: MouseEvent) {
      if (!dragRef.current) return;
      const delta = e.clientX - dragRef.current.startX;
      onResize(colKey, dragRef.current.startW + delta);
    }
    function onUp() {
      dragRef.current = null;
      setActive(false);
      onCommit();
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [active, colKey, onResize, onCommit]);

  function onDown(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = { startX: e.clientX, startW: currentWidth };
    setActive(true);
  }

  function onDoubleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    onResize(colKey, DEFAULT_WIDTHS[colKey]);
    onCommit();
  }

  return (
    <div
      onMouseDown={onDown}
      onDoubleClick={onDoubleClick}
      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize select-none"
      style={{
        backgroundColor: active ? T.accentPrimary : "transparent",
        zIndex: 3,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLDivElement).style.backgroundColor =
            T.borderStrong;
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLDivElement).style.backgroundColor =
            "transparent";
        }
      }}
      title="Перетягни — змінити ширину. Подвійний клік — скинути."
      role="separator"
      aria-orientation="vertical"
    />
  );
}

function DepartmentGroup({
  name,
  items,
  columns,
  gridTemplate,
  canSeeSalary,
  density,
}: {
  name: string;
  items: EmployeeRow[];
  columns: Column[];
  gridTemplate: string;
  canSeeSalary: boolean;
  density: Density;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[10px] font-bold uppercase tracking-wider transition-colors duration-150 hover:bg-black/[0.02]"
        style={{
          color: T.textSecondary,
          backgroundColor: T.panelSoft,
          borderBottom: `1px solid ${T.borderSoft}`,
        }}
      >
        {open ? (
          <ChevronDown size={11} style={{ color: T.textMuted }} />
        ) : (
          <ChevronRight size={11} style={{ color: T.textMuted }} />
        )}
        <span>{name}</span>
        <span
          className="ml-1 rounded-full px-1.5 text-[9px] font-bold normal-case tracking-normal"
          style={{ backgroundColor: T.panel, color: T.textMuted }}
        >
          {items.length}
        </span>
      </button>
      {open &&
        items.map((e) => (
          <EmployeeRowView
            key={e.id}
            employee={e}
            columns={columns}
            gridTemplate={gridTemplate}
            canSeeSalary={canSeeSalary}
            density={density}
          />
        ))}
    </div>
  );
}

function EmployeeRowView({
  employee,
  columns,
  gridTemplate,
  canSeeSalary,
  density,
}: {
  employee: EmployeeRow;
  columns: Column[];
  gridTemplate: string;
  canSeeSalary: boolean;
  density: Density;
}) {
  const href = `/admin-v2/hr/employees/${employee.id}`;

  return (
    <div
      className="row group grid items-stretch transition-colors duration-150 hover:bg-black/[0.025]"
      style={{
        gridTemplateColumns: gridTemplate,
        borderBottom: `1px solid ${T.borderSoft}`,
        color: T.textPrimary,
        opacity: employee.isActive ? 1 : 0.5,
      }}
    >
      {columns.map((c, idx) => (
        <div
          key={c.key}
          className={`min-w-0 px-2 ${DENSITY_PY[density]} flex items-center`}
          style={{
            borderRight:
              idx === columns.length - 1
                ? "none"
                : `1px solid ${T.borderSoft}`,
            justifyContent:
              c.align === "right"
                ? "flex-end"
                : c.align === "center"
                  ? "center"
                  : "flex-start",
          }}
        >
          <Cell
            col={c}
            employee={employee}
            href={href}
            canSeeSalary={canSeeSalary}
          />
        </div>
      ))}
      <div />
    </div>
  );
}

function Cell({
  col,
  employee,
  href,
  canSeeSalary,
}: {
  col: Column;
  employee: EmployeeRow;
  href: string;
  canSeeSalary: boolean;
}) {
  switch (col.key) {
    case "name":
      return (
        <Link
          href={href}
          className="min-w-0 truncate font-medium transition-colors duration-150 hover:underline"
          style={{ color: T.textPrimary }}
          title={employee.fullName}
        >
          {shortName(employee)}
        </Link>
      );

    case "position":
      return (
        <div
          className="min-w-0 truncate"
          style={{ color: T.textSecondary }}
          title={employee.position ?? undefined}
        >
          {employee.position || dash()}
        </div>
      );

    case "department":
      return (
        <div
          className="min-w-0 truncate"
          style={{ color: T.textSecondary }}
          title={employee.department?.name}
        >
          {employee.department?.name || dash()}
        </div>
      );

    case "phone":
      return employee.phone ? (
        <a
          href={`tel:${employee.phone}`}
          className="min-w-0 truncate tabular-nums transition-colors duration-150 hover:underline"
          style={{ color: T.textSecondary }}
        >
          {employee.phone}
        </a>
      ) : (
        dash()
      );

    case "email":
      return <EmailCell email={employee.email} />;

    case "user":
      return employee.user ? (
        <span
          className="inline-flex items-center gap-1 truncate text-[11px] font-medium"
          style={{ color: employee.user.isActive ? T.success : T.danger }}
        >
          <span
            className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              backgroundColor: employee.user.isActive ? T.success : T.danger,
            }}
          />
          <span className="truncate">
            {employee.user.isActive ? "активний" : "блок."}
          </span>
        </span>
      ) : (
        dash()
      );

    case "role":
      return employee.user ? (
        <span
          className="truncate rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor:
              ROLE_COLORS[employee.user.role]?.bg ?? T.panelSoft,
            color: ROLE_COLORS[employee.user.role]?.fg ?? T.textMuted,
          }}
        >
          {ROLE_LABELS[employee.user.role] ?? employee.user.role}
        </span>
      ) : (
        dash()
      );

    case "deferral":
      return (
        <div
          className="min-w-0 truncate"
          style={{ color: T.textSecondary }}
        >
          {deferralText(employee)}
        </div>
      );

    case "salary": {
      if (!canSeeSalary) return <div />;
      const sal = activeSalary(employee);
      if (!sal) return <span>{dash()}</span>;
      const total = Number(sal.baseSalary) + Number(sal.coefficient ?? 0);
      const symbol =
        sal.currency === "USD" ? "$" : sal.currency === "EUR" ? "€" : "₴";
      return (
        <div
          className="inline-flex items-baseline gap-0.5 truncate tabular-nums"
          style={{ color: T.textPrimary }}
        >
          <span className="font-semibold">{formatCurrency(total)}</span>
          <span className="text-[10px]" style={{ color: T.textMuted }}>
            {symbol}
          </span>
        </div>
      );
    }

    case "notes":
      return (
        <div
          className="min-w-0 truncate"
          style={{ color: T.textMuted }}
          title={employee.notes ?? undefined}
        >
          {employee.notes
            ? employee.notes.split("\n").join(" · ")
            : dash()}
        </div>
      );

    default:
      return <div />;
  }
}

function EmailCell({ email }: { email: string | null }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!email) return dash();

  async function copy() {
    try {
      await navigator.clipboard.writeText(email!);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-w-0 max-w-full items-center truncate text-left transition-colors duration-150 hover:underline"
        style={{ color: T.textSecondary }}
        title={email}
      >
        <span className="truncate">{email}</span>
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div
            className="absolute left-0 top-full z-20 mt-1 flex items-center gap-1 rounded-xl px-2 py-1.5 text-[11px]"
            style={{
              backgroundColor: T.panel,
              border: `1px solid ${T.borderStrong}`,
              boxShadow: "0 10px 24px rgba(15,23,42,0.18)",
              color: T.textPrimary,
            }}
          >
            <Mail size={11} style={{ color: T.textMuted }} />
            <span className="max-w-[220px] truncate">Кому: {email}</span>
            <button
              type="button"
              onClick={copy}
              className="ml-1 flex h-6 w-6 items-center justify-center rounded-md hover:bg-black/5"
              title="Скопіювати"
            >
              {copied ? (
                <Check size={12} style={{ color: T.success }} />
              ) : (
                <Copy size={12} style={{ color: T.textMuted }} />
              )}
            </button>
            <a
              href={`mailto:${email}`}
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-black/5"
              title="Написати"
            >
              <Mail size={12} style={{ color: T.textMuted }} />
            </a>
          </div>
        </>
      )}
    </div>
  );
}

function dash() {
  return (
    <span className="select-none opacity-40" style={{ color: T.textMuted }}>
      —
    </span>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function compare(a: EmployeeRow, b: EmployeeRow, key: ColumnKey): number {
  switch (key) {
    case "name":
      return shortName(a).localeCompare(shortName(b), "uk");
    case "position":
      return (a.position ?? "").localeCompare(b.position ?? "", "uk");
    case "department":
      return (a.department?.name ?? "").localeCompare(
        b.department?.name ?? "",
        "uk",
      );
    case "salary": {
      const sa = activeSalary(a);
      const sb = activeSalary(b);
      const va = sa ? Number(sa.baseSalary) + Number(sa.coefficient ?? 0) : 0;
      const vb = sb ? Number(sb.baseSalary) + Number(sb.coefficient ?? 0) : 0;
      return va - vb;
    }
    default:
      return 0;
  }
}
