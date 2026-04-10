"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export type EstimateItem = {
  id: string;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  laborRate: number;
  laborHours: number;
  amount: number;
  useCustomMargin: boolean;
  customMarginPercent: number | null;
  material: { name: string; sku: string } | null;
};

export type EstimateSection = {
  id: string;
  title: string;
  items: EstimateItem[];
};

export type Estimate = {
  id: string;
  number: string;
  title: string;
  description: string | null;
  status: string;
  totalMaterials: number;
  totalLabor: number;
  totalOverhead: number;
  totalAmount: number;
  discount: number;
  finalAmount: number;
  notes: string | null;
  analysisSummary: string | null;
  prozorroAnalysis: string | null;
  profitMarginMaterials: number | null;
  profitMarginLabor: number | null;
  profitMarginOverall: number;
  profitAmount: number;
  taxationType: string | null;
  taxRate: number;
  taxAmount: number;
  finalClientPrice: number;
  logisticsCost: number;
  createdAt: string;
  project: { title: string; client: { name: string } };
  createdBy: { name: string };
  sections: EstimateSection[];
  pdvAmount?: number;
  esvAmount?: number;
  militaryTaxAmount?: number;
  profitTaxAmount?: number;
  unifiedTaxAmount?: number;
  pdfoAmount?: number;
  taxCalculationDetails?: {
    totalTaxAmount: number;
    netProfit: number;
    effectiveTaxRate: number;
  };
};

export type EstimateController = ReturnType<typeof useEstimateController>;

export function useEstimateController(estimateId: string) {
  const router = useRouter();

  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const [sendingToClient, setSendingToClient] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "history" | "discussion">("details");

  // Approvals (lazy)
  const [approvals, setApprovals] = useState<any[]>([]);
  const [approvalsLoaded, setApprovalsLoaded] = useState(false);

  // Engineer report modal
  const [engineerReportOpen, setEngineerReportOpen] = useState(false);

  // Finance modal
  const [financeModalOpen, setFinanceModalOpen] = useState(false);
  const [applyingFinance, setApplyingFinance] = useState(false);
  const [globalMargin, setGlobalMargin] = useState(20);
  const [logisticsCost, setLogisticsCost] = useState(0);
  const [taxationType, setTaxationType] = useState<"CASH" | "FOP" | "VAT">("CASH");
  const [financeNotes, setFinanceNotes] = useState("");
  const [itemMargins, setItemMargins] = useState<Record<string, number>>({});

  // Supplement modal
  const [supplementModalOpen, setSupplementModalOpen] = useState(false);
  const [supplementInfo, setSupplementInfo] = useState("");
  const [supplementFiles, setSupplementFiles] = useState<File[]>([]);
  const [supplementing, setSupplementing] = useState(false);
  const [supplementProgress, setSupplementProgress] = useState<{
    message: string;
    progress: number;
  } | null>(null);
  const [supplementError, setSupplementError] = useState("");

  /* ---------- Load ---------- */

  const loadEstimate = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/estimates/${estimateId}`);
      const { data } = await res.json();
      setEstimate(data);
      // Initialize item margins from existing data
      const margins: Record<string, number> = {};
      data?.sections?.forEach((section: EstimateSection) => {
        section.items.forEach((item) => {
          margins[item.id] =
            item.useCustomMargin && item.customMarginPercent != null
              ? item.customMarginPercent
              : 20;
        });
      });
      setItemMargins(margins);
      if (data?.profitMarginOverall != null) setGlobalMargin(Number(data.profitMarginOverall));
      if (data?.logisticsCost != null) setLogisticsCost(Number(data.logisticsCost));
      if (data?.taxationType) setTaxationType(data.taxationType);
    } catch (e) {
      console.error("Failed to load estimate", e);
    } finally {
      setLoading(false);
    }
  }, [estimateId]);

  useEffect(() => {
    loadEstimate();
  }, [loadEstimate]);

  /* ---------- Approvals (lazy on history tab) ---------- */

  useEffect(() => {
    if (activeTab !== "history" || approvalsLoaded) return;
    fetch(`/api/admin/estimates/${estimateId}/history`)
      .then((r) => r.json())
      .then((d) => {
        setApprovals(d.approvals || []);
        setApprovalsLoaded(true);
      })
      .catch((e) => console.warn("Failed to load history", e));
  }, [activeTab, approvalsLoaded, estimateId]);

  /* ---------- Status update ---------- */

  const updateStatus = useCallback(
    async (status: string) => {
      setUpdating(true);
      try {
        const res = await fetch(`/api/admin/estimates/${estimateId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        });
        if (res.ok) {
          const { data } = await res.json();
          setEstimate(data);
        }
      } finally {
        setUpdating(false);
      }
    },
    [estimateId]
  );

  /* ---------- Finance ---------- */

  const openFinance = useCallback(() => setFinanceModalOpen(true), []);
  const closeFinance = useCallback(() => setFinanceModalOpen(false), []);

  const applyGlobalMargin = useCallback(() => {
    if (!estimate) return;
    const next: Record<string, number> = {};
    estimate.sections.forEach((s) =>
      s.items.forEach((it) => {
        next[it.id] = globalMargin;
      })
    );
    setItemMargins(next);
  }, [estimate, globalMargin]);

  const updateItemMargin = useCallback((itemId: string, value: number) => {
    setItemMargins((prev) => ({ ...prev, [itemId]: value }));
  }, []);

  const calculatePreview = useCallback(() => {
    if (!estimate) return null;
    let totalCost = 0;
    let totalRevenue = 0;
    estimate.sections.forEach((s) =>
      s.items.forEach((it) => {
        const cost = it.amount;
        const margin = itemMargins[it.id] ?? globalMargin;
        const revenue = cost * (1 + margin / 100);
        totalCost += cost;
        totalRevenue += revenue;
      })
    );
    const profit = totalRevenue - totalCost;
    const subtotal = totalRevenue + logisticsCost;

    let tax = 0;
    if (taxationType === "VAT") tax = subtotal * 0.2;
    else if (taxationType === "FOP") tax = subtotal * 0.05;

    return {
      totalCost,
      totalRevenue,
      profit,
      logisticsCost,
      subtotal,
      tax,
      finalPrice: subtotal + tax,
    };
  }, [estimate, itemMargins, globalMargin, logisticsCost, taxationType]);

  const applyFinancialSettings = useCallback(async () => {
    if (!estimate) return;
    setApplyingFinance(true);
    try {
      const itemMarginsPayload = Object.entries(itemMargins).map(([itemId, marginPercent]) => ({
        itemId,
        marginPercent,
      }));
      const res = await fetch(`/api/admin/estimates/${estimateId}/finance`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemMargins: itemMarginsPayload,
          logisticsCost,
          taxationType,
          financeNotes: financeNotes.trim() || undefined,
        }),
      });
      if (res.ok) {
        await loadEstimate();
        setFinanceModalOpen(false);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.error || "Помилка застосування фінансових налаштувань");
      }
    } finally {
      setApplyingFinance(false);
    }
  }, [estimate, estimateId, itemMargins, logisticsCost, taxationType, financeNotes, loadEstimate]);

  /* ---------- Export ---------- */

  const exportEstimate = useCallback(
    async (format: "pdf" | "excel") => {
      if (!estimate) return;
      setExporting(format);
      try {
        const res = await fetch(`/api/estimates/${estimateId}/export?format=${format}`);
        if (!res.ok) throw new Error("Помилка експорту");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${estimate.number}.${format === "excel" ? "xlsx" : "pdf"}`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e: any) {
        alert(e?.message || "Помилка експорту");
      } finally {
        setExporting(null);
      }
    },
    [estimate, estimateId]
  );

  const sendToClient = useCallback(async () => {
    if (!estimate) return;
    if (!confirm(`Надіслати кошторис ${estimate.number} клієнту на email?`)) return;
    setSendingToClient(true);
    try {
      const res = await fetch(
        `/api/estimates/${estimateId}/export?format=pdf&sendToClient=true`
      );
      const data = await res.json();
      if (res.ok) {
        alert(data.message || "Кошторис надіслано клієнту");
      } else {
        alert(data.error || "Помилка надсилання");
      }
    } finally {
      setSendingToClient(false);
    }
  }, [estimate, estimateId]);

  /* ---------- Supplement ---------- */

  const openSupplement = useCallback(() => {
    setSupplementError("");
    setSupplementModalOpen(true);
  }, []);
  const closeSupplement = useCallback(() => setSupplementModalOpen(false), []);

  const addSupplementFiles = useCallback((files: File[]) => {
    setSupplementFiles((prev) => [...prev, ...files]);
  }, []);
  const removeSupplementFile = useCallback((idx: number) => {
    setSupplementFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const supplementEstimate = useCallback(async () => {
    if (!supplementInfo.trim() && supplementFiles.length === 0) {
      setSupplementError("Додайте текст або файли");
      return;
    }
    setSupplementing(true);
    setSupplementError("");
    setSupplementProgress(null);

    try {
      // Upload files first
      let r2Keys: any[] = [];
      if (supplementFiles.length > 0) {
        const fd = new FormData();
        supplementFiles.forEach((f) => fd.append("files", f));
        const upRes = await fetch("/api/upload", { method: "POST", body: fd });
        if (!upRes.ok) throw new Error("Не вдалось завантажити файли");
        const upData = await upRes.json();
        r2Keys = upData.r2Keys || [];
      }

      const fd = new FormData();
      fd.append("additionalInfo", supplementInfo);
      fd.append("r2Keys", JSON.stringify(r2Keys));
      fd.append("regenerateAll", "true");

      const res = await fetch(`/api/admin/estimates/${estimateId}/refine`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) throw new Error("Помилка доповнення");

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          const lines = text.split("\n\n");
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));
              setSupplementProgress({ message: data.message, progress: data.progress || 0 });
              if (data.status === "complete" && data.data) {
                router.push(`/admin-v2/estimates/${data.data.newEstimateId}`);
                return;
              } else if (data.status === "error") {
                throw new Error(data.message);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (e: any) {
      setSupplementError(e?.message || "Помилка доповнення");
    } finally {
      setSupplementing(false);
    }
  }, [supplementInfo, supplementFiles, estimateId, router]);

  return {
    // state
    estimate,
    loading,
    activeTab,
    setActiveTab,
    approvals,

    // refresh
    loadEstimate,

    // status
    updating,
    updateStatus,

    // export
    exporting,
    exportEstimate,
    sendingToClient,
    sendToClient,

    // engineer report
    engineerReportOpen,
    setEngineerReportOpen,

    // finance
    financeModalOpen,
    openFinance,
    closeFinance,
    applyingFinance,
    globalMargin,
    setGlobalMargin,
    logisticsCost,
    setLogisticsCost,
    taxationType,
    setTaxationType,
    financeNotes,
    setFinanceNotes,
    itemMargins,
    applyGlobalMargin,
    updateItemMargin,
    calculatePreview,
    applyFinancialSettings,

    // supplement
    supplementModalOpen,
    openSupplement,
    closeSupplement,
    supplementInfo,
    setSupplementInfo,
    supplementFiles,
    addSupplementFiles,
    removeSupplementFile,
    supplementing,
    supplementProgress,
    supplementError,
    supplementEstimate,
  };
}
