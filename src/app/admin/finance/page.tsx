"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

interface Estimate {
  id: string;
  number: string;
  title: string;
  status: string;
  totalAmount: number;
  finalAmount: number;
  project: { title: string; client: { name: string } };
}

export default function FinanceEstimatesPage() {
  const [estimates, setEstimates] = useState<Estimate[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("FINANCE_REVIEW");

  useEffect(() => {
    fetch(`/api/admin/estimates?status=${filter}`)
      .then(r => r.json())
      .then(data => { setEstimates(data.data || []); setLoading(false); });
  }, [filter]);

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      FINANCE_REVIEW: "bg-yellow-100 text-yellow-800",
      APPROVED: "bg-green-100 text-green-800",
    };
    const labels: Record<string, string> = {
      FINANCE_REVIEW: "Фінансовий огляд",
      APPROVED: "Затверджено",
    };
    return <span className={`px-3 py-1 rounded-full text-sm font-medium ${styles[status] || "bg-gray-100 text-gray-800"}`}>{labels[status] || status}</span>;
  };

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-2">Фінансовий огляд кошторисів</h1>
      <p className="text-gray-600 mb-8">Налаштуйте рентабельність, податки та логістику</p>

      <div className="mb-6 flex gap-2">
        {["FINANCE_REVIEW", "APPROVED", ""].map(f => (
          <button
            key={f || "all"}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-lg font-medium ${filter === f ? "bg-blue-600 text-white" : "bg-white text-gray-700 hover:bg-gray-50"}`}
          >
            {f === "FINANCE_REVIEW" ? "На розгляді" : f === "APPROVED" ? "Затверджені" : "Всі"}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>
        ) : estimates.length === 0 ? (
          <div className="text-center py-12 text-gray-500">Немає кошторисів</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                {["Номер", "Назва", "Проєкт / Клієнт", "Статус", "Базова сума", "Фінальна сума", "Дії"].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {estimates.map(e => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{e.number}</td>
                  <td className="px-6 py-4 max-w-md truncate">{e.title}</td>
                  <td className="px-6 py-4">
                    <div className="font-medium">{e.project?.title}</div>
                    <div className="text-sm text-gray-500">{e.project?.client?.name}</div>
                  </td>
                  <td className="px-6 py-4">{getStatusBadge(e.status)}</td>
                  <td className="px-6 py-4 text-right font-medium">{Number(e.totalAmount).toLocaleString("uk-UA")} ₴</td>
                  <td className="px-6 py-4 text-right font-medium text-green-600">
                    {e.finalAmount > 0 ? `${Number(e.finalAmount).toLocaleString("uk-UA")} ₴` : "—"}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <Link href={`/admin/finance/configure/${e.id}`} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium inline-block">
                      {e.status === "FINANCE_REVIEW" ? "Налаштувати" : "Переглянути"}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
