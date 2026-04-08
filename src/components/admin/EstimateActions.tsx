"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown, FileSpreadsheet, Mail, Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface EstimateActionsProps {
  estimateId: string;
  estimateNumber: string;
  status: string;
  clientName: string;
}

export function EstimateActions({ estimateId, estimateNumber, status, clientName }: EstimateActionsProps) {
  const router = useRouter();
  const [exporting, setExporting] = useState<string | null>(null);
  const [sendingToClient, setSendingToClient] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function exportEstimate(format: "pdf" | "excel", e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    setExporting(format);
    try {
      const response = await fetch(`/api/estimates/${estimateId}/export?format=${format}`);
      if (!response.ok) throw new Error("Failed to export");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Кошторис_${estimateNumber}.${format === "pdf" ? "pdf" : "xlsx"}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export error:", error);
      alert("Помилка експорту кошторису");
    } finally {
      setExporting(null);
    }
  }

  async function sendToClient(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Надіслати кошторис ${estimateNumber} клієнту ${clientName}?`)) {
      return;
    }

    setSendingToClient(true);
    try {
      const response = await fetch(`/api/estimates/${estimateId}/export?format=pdf&sendToClient=true`);
      if (!response.ok) throw new Error("Failed to send");

      const data = await response.json();
      alert(data.message || "Кошторис успішно надіслано клієнту!");
    } catch (error) {
      console.error("Send error:", error);
      alert("Помилка відправки кошторису клієнту");
    } finally {
      setSendingToClient(false);
    }
  }

  async function deleteEstimate(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Ви впевнені що хочете ВИДАЛИТИ кошторис ${estimateNumber}?\n\nЦю дію неможливо скасувати!`)) {
      return;
    }

    setDeleting(true);
    try {
      const response = await fetch(`/api/admin/estimates/${estimateId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete");
      }

      const data = await response.json();
      alert(data.message || "Кошторис успішно видалено!");

      // Refresh the page to update the list
      router.refresh();
    } catch (error) {
      console.error("Delete error:", error);
      alert(error instanceof Error ? error.message : "Помилка видалення кошторису");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => exportEstimate("pdf", e)}
        disabled={exporting === "pdf"}
        title="Експорт в PDF"
        className="h-10 w-10 p-0 flex items-center justify-center admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
      >
        {exporting === "pdf" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <FileDown className="h-5 w-5" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={(e) => exportEstimate("excel", e)}
        disabled={exporting === "excel"}
        title="Експорт в Excel"
        className="h-10 w-10 p-0 flex items-center justify-center admin-dark:hover:bg-white/10 admin-light:hover:bg-gray-100"
      >
        {exporting === "excel" ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <FileSpreadsheet className="h-5 w-5" />
        )}
      </Button>
      {status === "APPROVED" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={sendToClient}
          disabled={sendingToClient}
          title="Надіслати клієнту"
          className="h-10 w-10 p-0 flex items-center justify-center admin-dark:text-blue-400 admin-dark:hover:bg-blue-500/10 admin-light:text-blue-600 admin-light:hover:bg-blue-50"
        >
          {sendingToClient ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Mail className="h-5 w-5" />
          )}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={deleteEstimate}
        disabled={deleting}
        title="Видалити кошторис"
        className="h-10 w-10 p-0 flex items-center justify-center admin-dark:text-red-400 admin-dark:hover:bg-red-500/10 admin-light:text-red-600 admin-light:hover:bg-red-50"
      >
        {deleting ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Trash2 className="h-5 w-5" />
        )}
      </Button>
    </div>
  );
}
