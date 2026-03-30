"use client";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, Save } from "lucide-react";

export default function ConfigureFinancePage() {
  const router = useRouter();
  const params = useParams();
  const [estimate, setEstimate] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [taxationType, setTaxationType] = useState("VAT");
  const [globalMargin, setGlobalMargin] = useState(25);
  const [logisticsCost, setLogisticsCost] = useState(0);
  const [itemMargins, setItemMargins] = useState<Record<string, any>>({});

  useEffect(() => {
    fetch(`/api/admin/estimates/${params.id}`).then(r => r.json()).then(d => {
      setEstimate(d.data);
      if (d.data.taxationType) setTaxationType(d.data.taxationType);
      if (d.data.profitMarginOverall) setGlobalMargin(Number(d.data.profitMarginOverall));
      if (d.data.logisticsCost) setLogisticsCost(Number(d.data.logisticsCost));
      setLoading(false);
    });
  }, [params.id]);

  const handleSave = async () => {
    const itemMarginsArray = Object.entries(itemMargins).map(([itemId, margin]: [string, any]) => ({
      itemId,
      useCustomMargin: margin.useCustom,
      customMarginPercent: margin.useCustom ? margin.percent : undefined,
    }));

    await fetch(`/api/admin/estimates/${params.id}/finance`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxationType, globalMarginPercent: globalMargin, logisticsCost, itemMargins: itemMarginsArray }),
    });

    alert("Збережено!");
    router.push("/admin/finance");
  };

  if (loading || !estimate) return <div className="flex items-center justify-center min-h-screen"><Loader2 className="w-12 h-12 animate-spin" /></div>;

  const subtotal = estimate.items.reduce((s: number, item: any) => {
    const margin = itemMargins[item.id] || { useCustom: false, percent: globalMargin };
    const marginPercent = margin.useCustom ? margin.percent : globalMargin;
    return s + Number(item.amount) * (1 + marginPercent / 100);
  }, 0);
  
  const taxRate = taxationType === "VAT" ? 20 : taxationType === "FOP" ? 6 : 0;
  const taxAmount = (subtotal * taxRate) / 100;
  const finalAmount = subtotal + taxAmount + logisticsCost;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Налаштування фінансів: {estimate.number}</h1>

      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Параметри</h2>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <label className="block text-sm font-medium mb-2">Тип оплати</label>
            <select value={taxationType} onChange={e => setTaxationType(e.target.value)} className="w-full px-4 py-2 border rounded-lg">
              <option value="CASH">Готівка (0%)</option>
              <option value="VAT">ТОВ ПДВ 20%</option>
              <option value="FOP">ФОП 6%</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Рентабельність: {globalMargin}%</label>
            <input type="range" min="0" max="100" value={globalMargin} onChange={e => setGlobalMargin(Number(e.target.value))} className="w-full" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Логістика (₴)</label>
            <input type="number" min="0" value={logisticsCost} onChange={e => setLogisticsCost(Number(e.target.value))} className="w-full px-4 py-2 border rounded-lg" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Позиції</h2>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left">№</th>
              <th className="px-4 py-2 text-left">Найменування</th>
              <th className="px-4 py-2 text-right">Базова сума</th>
              <th className="px-4 py-2 text-center">Індивід. рентаб.</th>
              <th className="px-4 py-2 text-right">З рентаб.</th>
            </tr>
          </thead>
          <tbody>
            {estimate.items.map((item: any, idx: number) => {
              const margin = itemMargins[item.id] || { useCustom: false, percent: globalMargin };
              const priceWithMargin = Number(item.amount) * (1 + (margin.useCustom ? margin.percent : globalMargin) / 100);
              return (
                <tr key={item.id}>
                  <td className="px-4 py-2">{idx + 1}</td>
                  <td className="px-4 py-2">{item.description}</td>
                  <td className="px-4 py-2 text-right">{Number(item.amount).toFixed(2)} ₴</td>
                  <td className="px-4 py-2 text-center">
                    <input type="checkbox" checked={margin.useCustom} onChange={e => setItemMargins({...itemMargins, [item.id]: { useCustom: e.target.checked, percent: globalMargin }})} />
                    {margin.useCustom && <input type="number" value={margin.percent} onChange={e => setItemMargins({...itemMargins, [item.id]: { useCustom: true, percent: Number(e.target.value) }})} className="w-20 px-2 py-1 border rounded ml-2" />}
                  </td>
                  <td className="px-4 py-2 text-right font-bold text-green-600">{priceWithMargin.toFixed(2)} ₴</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Підсумки</h2>
        <div className="space-y-2 text-right">
          <div className="flex justify-between"><span>Підсумок:</span><span className="font-semibold">{subtotal.toFixed(2)} ₴</span></div>
          <div className="flex justify-between"><span>Податок ({taxRate}%):</span><span className="font-semibold">{taxAmount.toFixed(2)} ₴</span></div>
          <div className="flex justify-between"><span>Логістика:</span><span className="font-semibold">{logisticsCost.toFixed(2)} ₴</span></div>
          <div className="flex justify-between text-2xl border-t pt-2"><span className="font-bold">Фінальна сума:</span><span className="font-bold text-blue-600">{finalAmount.toFixed(2)} ₴</span></div>
        </div>
      </div>

      <button onClick={handleSave} className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center justify-center gap-2">
        <Save className="w-5 h-5" />Зберегти
      </button>
    </div>
  );
}
