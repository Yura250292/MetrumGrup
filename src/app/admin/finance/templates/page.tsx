"use client";
import { useEffect, useState } from "react";
import { Loader2, Plus, Edit, Trash2 } from "lucide-react";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({ name: "", taxationType: "VAT", globalMarginPercent: 25, logisticsCost: 0 });

  useEffect(() => {
    fetch("/api/admin/financial-templates").then(r => r.json()).then(d => { setTemplates(d.data || []); setLoading(false); });
  }, []);

  const handleSave = async () => {
    await fetch("/api/admin/financial-templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    });
    setShowModal(false);
    fetch("/api/admin/financial-templates").then(r => r.json()).then(d => setTemplates(d.data || []));
  };

  return (
    <div className="p-8">
      <div className="flex justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Шаблони фінансових налаштувань</h1>
          <p className="text-gray-600">Створюйте шаблони для швидкого застосування</p>
        </div>
        <button onClick={() => setShowModal(true)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2">
          <Plus className="w-5 h-5" />Створити
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        {loading ? <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin" /></div> :
        templates.length === 0 ? <div className="text-center py-12 text-gray-500">Немає шаблонів</div> :
        <div className="divide-y">
          {templates.map(t => (
            <div key={t.id} className="p-6 flex justify-between items-start hover:bg-gray-50">
              <div>
                <h3 className="text-lg font-semibold">{t.name}</h3>
                <div className="text-sm text-gray-500 mt-2">
                  {t.taxationType === "VAT" ? "ТОВ ПДВ 20%" : t.taxationType === "FOP" ? "ФОП 6%" : "Готівка"} • {Number(t.globalMarginPercent)}% рентабельність • {Number(t.logisticsCost)} ₴ логістика
                </div>
              </div>
            </div>
          ))}
        </div>}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full">
            <h2 className="text-2xl font-bold mb-6">Новий шаблон</h2>
            <div className="space-y-4">
              <input placeholder="Назва" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-4 py-2 border rounded-lg" />
              <select value={formData.taxationType} onChange={e => setFormData({...formData, taxationType: e.target.value})} className="w-full px-4 py-2 border rounded-lg">
                <option value="CASH">Готівка</option>
                <option value="VAT">ТОВ ПДВ 20%</option>
                <option value="FOP">ФОП 6%</option>
              </select>
              <div>
                <label>Рентабельність: {formData.globalMarginPercent}%</label>
                <input type="range" min="0" max="100" value={formData.globalMarginPercent} onChange={e => setFormData({...formData, globalMarginPercent: Number(e.target.value)})} className="w-full" />
              </div>
              <input type="number" placeholder="Логістика" value={formData.logisticsCost} onChange={e => setFormData({...formData, logisticsCost: Number(e.target.value)})} className="w-full px-4 py-2 border rounded-lg" />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleSave} className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Створити</button>
              <button onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-200 rounded-lg">Скасувати</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
