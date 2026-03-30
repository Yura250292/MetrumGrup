"use client";

import { useState, useEffect, use } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from "@/lib/constants";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { ArrowLeft, Plus, Check } from "lucide-react";
import Link from "next/link";

type Payment = {
  id: string;
  amount: number;
  method: string;
  status: string;
  scheduledDate: string;
  paidDate: string | null;
  notes: string | null;
};

export default function ProjectFinancesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [projectTitle, setProjectTitle] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ amount: "", scheduledDate: "", method: "BANK_TRANSFER", notes: "" });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/projects/${id}`)
      .then((r) => r.json())
      .then(({ data }) => {
        setProjectTitle(data.title);
        setPayments(data.payments || []);
      });
  }, [id]);

  async function addPayment(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/projects/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(form.amount),
          scheduledDate: form.scheduledDate,
          method: form.method,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        const { data } = await res.json();
        setPayments((prev) => [...prev, data].sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime()));
        setShowForm(false);
        setForm({ amount: "", scheduledDate: "", method: "BANK_TRANSFER", notes: "" });
      }
    } finally {
      setLoading(false);
    }
  }

  async function markAsPaid(paymentId: string) {
    const res = await fetch(`/api/admin/projects/${id}/payments`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId, status: "PAID" }),
    });
    if (res.ok) {
      setPayments((prev) =>
        prev.map((p) =>
          p.id === paymentId ? { ...p, status: "PAID", paidDate: new Date().toISOString() } : p
        )
      );
    }
  }

  return (
    <div className="max-w-3xl">
      <Link
        href={`/admin/projects/${id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        {projectTitle}
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Управління фінансами</h1>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4" />
          Додати платіж
        </Button>
      </div>

      {showForm && (
        <Card className="mb-6 p-5">
          <form onSubmit={addPayment} className="grid gap-3 sm:grid-cols-2">
            <input
              type="number"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
              placeholder="Сума, ₴"
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="date"
              value={form.scheduledDate}
              onChange={(e) => setForm((p) => ({ ...p, scheduledDate: e.target.value }))}
              required
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <select
              value={form.method}
              onChange={(e) => setForm((p) => ({ ...p, method: e.target.value }))}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="BANK_TRANSFER">Банківський переказ</option>
              <option value="CASH">Готівка</option>
              <option value="CARD">Картка</option>
            </select>
            <input
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Примітка"
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <div className="sm:col-span-2 flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                Скасувати
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Додавання..." : "Додати"}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card className="overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Дата</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Сума</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Метод</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Статус</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Примітка</th>
              <th className="px-4 py-3 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b last:border-0">
                <td className="px-4 py-3 text-sm">{formatDateShort(p.scheduledDate)}</td>
                <td className="px-4 py-3 text-sm font-medium">{formatCurrency(Number(p.amount))}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {p.method === "BANK_TRANSFER" ? "Банк" : p.method === "CASH" ? "Готівка" : "Картка"}
                </td>
                <td className="px-4 py-3">
                  <Badge className={PAYMENT_STATUS_COLORS[p.status as keyof typeof PAYMENT_STATUS_COLORS]}>
                    {PAYMENT_STATUS_LABELS[p.status as keyof typeof PAYMENT_STATUS_LABELS]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">{p.notes || "—"}</td>
                <td className="px-4 py-3">
                  {p.status !== "PAID" && (
                    <button
                      onClick={() => markAsPaid(p.id)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-green-50 hover:text-green-600 transition-colors"
                      title="Позначити як сплачено"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Немає платежів
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
