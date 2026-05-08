"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ExternalLink,
  KeyRound,
  Maximize2,
  ShieldCheck,
  User,
  Users,
  Wallet,
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

export type EmployeeCardData = {
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
  notes: string | null;
  isActive: boolean;
  employmentType: EmploymentType;
  employmentRate: number | string;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  deferralType: DeferralType;
  deferralUntil: string | null;
  user: LinkedUser | null;
  salaries?: SalaryPeriod[];
};

const DEFERRAL_LABEL: Record<DeferralType, string> = {
  NONE: "Відсутня",
  RESERVATION: "Бронювання",
  DEFERMENT: "Відстрочка",
};

const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  FULL: "Повна",
  PART: "Неповна",
  CONTRACT: "Договір",
};

type CardTab = "basic" | "account" | "salary";

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("uk-UA");
}

function initialsOf(fullName: string): string {
  return fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function EmployeeCard({
  employee,
  canSeeSalary,
}: {
  employee: EmployeeCardData;
  canSeeSalary: boolean;
}) {
  const [tab, setTab] = useState<CardTab>("basic");

  const tabs = useMemo(() => {
    const base: Array<{ id: CardTab; label: string; icon: React.ReactNode }> = [
      { id: "basic", label: "Основне", icon: <User size={11} /> },
      { id: "account", label: "Користувач", icon: <ShieldCheck size={11} /> },
    ];
    if (canSeeSalary) {
      base.push({ id: "salary", label: "Зарплата", icon: <Wallet size={11} /> });
    }
    return base;
  }, [canSeeSalary]);

  const dossierHref = `/admin-v2/hr/employees/${employee.id}`;

  return (
    <div
      className="flex flex-col overflow-hidden rounded-2xl transition"
      style={{
        backgroundColor: T.panel,
        border: `1px solid ${T.borderStrong}`,
        opacity: employee.isActive ? 1 : 0.6,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2.5 px-4 py-3"
        style={{ borderBottom: `1px solid ${T.borderSoft}` }}
      >
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[12px] font-bold"
          style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
        >
          {initialsOf(employee.fullName) || <Users size={14} />}
        </div>
        <Link
          href={dossierHref}
          className="min-w-0 flex-1 truncate text-[14px] font-semibold hover:underline"
          style={{ color: T.textPrimary }}
          title={employee.fullName}
        >
          {employee.fullName}
        </Link>
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
          style={{
            backgroundColor: employee.isActive ? T.successSoft : T.dangerSoft,
            color: employee.isActive ? T.success : T.danger,
          }}
        >
          {employee.isActive ? "Активний" : "Неактивний"}
        </span>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 px-3 py-1.5"
        style={{ backgroundColor: T.panelSoft, borderBottom: `1px solid ${T.borderSoft}` }}
      >
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold transition"
              style={{
                backgroundColor: active ? T.panel : "transparent",
                color: active ? T.textPrimary : T.textMuted,
                border: active ? `1px solid ${T.borderSoft}` : "1px solid transparent",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex-1 px-4 py-3 text-[12px]">
        {tab === "basic" && <BasicTabBody employee={employee} />}
        {tab === "account" && <AccountTabBody employee={employee} />}
        {tab === "salary" && canSeeSalary && <SalaryTabBody employee={employee} />}
      </div>

      {/* Footer */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ borderTop: `1px solid ${T.borderSoft}`, backgroundColor: T.panelSoft }}
      >
        <Link
          href={dossierHref}
          className="inline-flex items-center gap-1 text-[11px] font-semibold hover:underline"
          style={{ color: T.accentPrimary }}
        >
          <ExternalLink size={11} /> Дос'є
        </Link>
        <Link
          href={`${dossierHref}?expanded=1`}
          className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold"
          style={{
            backgroundColor: T.panel,
            color: T.textSecondary,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          <Maximize2 size={10} /> Розгорнути
        </Link>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-baseline gap-2 py-1">
      <div
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: T.textMuted }}
      >
        {label}
      </div>
      <div className="min-w-0 truncate" style={{ color: T.textSecondary }}>
        {children}
      </div>
    </div>
  );
}

function dashIfEmpty(v: string | null | undefined): React.ReactNode {
  if (!v) return <span style={{ color: T.textMuted }}>—</span>;
  return v;
}

function BasicTabBody({ employee }: { employee: EmployeeCardData }) {
  const deferralValue =
    employee.deferralType === "NONE"
      ? <span style={{ color: T.textMuted }}>—</span>
      : `${DEFERRAL_LABEL[employee.deferralType]}${
          employee.deferralUntil ? ` до ${formatDate(employee.deferralUntil)}` : ""
        }`;

  return (
    <div className="flex flex-col">
      <Row label="Прізвище">{dashIfEmpty(employee.lastName)}</Row>
      <Row label="Імʼя">{dashIfEmpty(employee.firstName)}</Row>
      <Row label="По-батькові">{dashIfEmpty(employee.middleName)}</Row>
      <Row label="Підрозділ">{dashIfEmpty(employee.department?.name ?? null)}</Row>
      <Row label="Посада">{dashIfEmpty(employee.position)}</Row>
      <Row label="Тип зайнятості">
        {EMPLOYMENT_TYPE_LABEL[employee.employmentType]} ·{" "}
        <span className="tabular-nums">{Number(employee.employmentRate).toFixed(2)}</span>
      </Row>
      <Row label="Телефон">
        {employee.phone ? (
          <a href={`tel:${employee.phone}`} className="hover:underline">
            {employee.phone}
          </a>
        ) : (
          dashIfEmpty(null)
        )}
      </Row>
      <Row label="Email">
        {employee.email ? (
          <a href={`mailto:${employee.email}`} className="hover:underline">
            {employee.email}
          </a>
        ) : (
          dashIfEmpty(null)
        )}
      </Row>
      <Row label="Прийнятий">{formatDate(employee.hiredAt)}</Row>
      <Row label="Звільнений">{formatDate(employee.terminatedAt)}</Row>
      <Row label="Статус">
        <span style={{ color: employee.isActive ? T.success : T.textMuted }}>
          {employee.isActive ? "Активний" : "Неактивний"}
        </span>
      </Row>
      <Row label="Відстрочка">{deferralValue}</Row>
      {employee.notes && (
        <Row label="Дод. інфо">
          <span className="block whitespace-pre-line" style={{ color: T.textSecondary }}>
            {employee.notes}
          </span>
        </Row>
      )}
    </div>
  );
}

function AccountTabBody({ employee }: { employee: EmployeeCardData }) {
  const linked = employee.user;
  if (!linked) {
    return (
      <div
        className="rounded-xl px-3 py-3 text-[12px]"
        style={{
          backgroundColor: T.panelSoft,
          color: T.textMuted,
          border: `1px dashed ${T.borderSoft}`,
        }}
      >
        Акаунт не створено. Відкрийте дос'є, щоб створити або привʼязати.
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      <Row label="Логін">{linked.email}</Row>
      <Row label="Пароль">
        <span className="font-mono" style={{ color: T.textMuted }}>
          ••••••••
        </span>
        <span className="ml-2 inline-flex items-center gap-1 text-[10px]" style={{ color: T.textMuted }}>
          <KeyRound size={10} /> керування — у дос'є
        </span>
      </Row>
      <Row label="Роль">
        <span
          className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase"
          style={{
            backgroundColor: ROLE_COLORS[linked.role]?.bg ?? T.panelSoft,
            color: ROLE_COLORS[linked.role]?.fg ?? T.textMuted,
          }}
        >
          {ROLE_LABELS[linked.role] ?? linked.role}
        </span>
      </Row>
      <Row label="Статус">
        <span style={{ color: linked.isActive ? T.success : T.textMuted }}>
          {linked.isActive ? "Активний" : "Неактивний"}
        </span>
      </Row>
    </div>
  );
}

function SalaryTabBody({ employee }: { employee: EmployeeCardData }) {
  const list = employee.salaries ?? [];
  const active = list[0] ?? null;
  if (!active) {
    return (
      <div
        className="rounded-xl px-3 py-3 text-[12px]"
        style={{
          backgroundColor: T.panelSoft,
          color: T.textMuted,
          border: `1px dashed ${T.borderSoft}`,
        }}
      >
        Записів про ЗП немає.
      </div>
    );
  }
  const base = Number(active.baseSalary);
  const coef = Number(active.coefficient ?? 0);
  const total = base + coef;
  const official = active.officialPart != null ? Number(active.officialPart) : null;

  return (
    <div className="flex flex-col">
      <Row label="Зарплата">
        <span className="font-bold tabular-nums" style={{ color: T.textPrimary }}>
          {formatCurrency(total)} {active.currency}
        </span>
      </Row>
      <Row label="Оклад">
        <span className="tabular-nums">{formatCurrency(base)}</span>
      </Row>
      <Row label="Премія">
        <span className="tabular-nums" style={{ color: coef < 0 ? T.danger : T.textSecondary }}>
          {coef === 0 ? "—" : formatCurrency(coef)}
        </span>
      </Row>
      <Row label="Оф. частина">
        <span className="tabular-nums">{official != null ? formatCurrency(official) : "—"}</span>
      </Row>
      <Row label="Період">
        {formatDate(active.effectiveFrom)} —{" "}
        {active.effectiveTo ? formatDate(active.effectiveTo) : "досі"}
      </Row>
    </div>
  );
}
