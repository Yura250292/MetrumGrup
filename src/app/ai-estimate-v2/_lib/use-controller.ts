"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadFilesToR2, type UploadProgress } from "@/lib/r2-upload";
import { formatCurrency } from "@/lib/utils";
import type { WizardData } from "@/lib/wizard-types";
import type {
  EstimateData,
  EstimateSection,
  EstimateItem,
  ScalingInfo,
  VerificationResult,
  PreAnalysisData,
  ChunkedProgress,
  ProjectListItem,
  SupplementProgress,
} from "./types";

const DEFAULT_WIZARD_DATA: WizardData = {
  objectType: "house",
  workScope: "full_cycle",
  totalArea: "",
  floors: 2,
  ceilingHeight: "2.7",
  utilities: {
    electrical: {
      power: "single_phase",
      outlets: 0,
      switches: 0,
      lightPoints: 0,
      outdoorLighting: false,
    },
    heating: { type: "none" },
    water: { coldWater: false, hotWater: false, source: "central" },
    sewerage: { type: "central", pumpNeeded: false },
    ventilation: { natural: true, forced: false, recuperation: false },
  },
  finishing: {
    walls: { material: "paint", qualityLevel: "standard" },
    flooring: {},
    ceiling: { type: "paint", levels: 1, lighting: "mixed" },
  },
};

function recalculateSummary(est: EstimateData): EstimateData {
  const sections = est.sections;
  const totalMaterials = sections.reduce(
    (sum, s) => sum + s.items.reduce((is, it) => is + it.quantity * it.unitPrice, 0),
    0
  );
  const totalLabor = sections.reduce(
    (sum, s) => sum + s.items.reduce((is, it) => is + (it.laborCost || 0), 0),
    0
  );
  const overheadPercent = est.summary?.overheadPercent ?? 15;
  const overhead = (totalMaterials + totalLabor) * (overheadPercent / 100);
  return {
    ...est,
    summary: {
      ...est.summary,
      materialsCost: totalMaterials,
      laborCost: totalLabor,
      overheadCost: overhead,
      overheadPercent,
      totalBeforeDiscount: totalMaterials + totalLabor + overhead,
    },
  };
}

export type AiEstimateController = ReturnType<typeof useAiEstimateController>;

export function useAiEstimateController() {
  const router = useRouter();

  // ── Files / upload ──
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);

  // ── Project params ──
  const [projectType] = useState<string>("ремонт квартири");
  const [area, setArea] = useState<string>("");
  const [projectNotes, setProjectNotes] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState<string>("custom");
  const [selectedGenerationModel, setSelectedGenerationModel] =
    useState<"gemini" | "openai" | "anthropic" | "pipeline">("gemini");
  const [checkProzorro, setCheckProzorro] = useState<boolean>(true);

  // ── Wizard ──
  const [wizardData, setWizardData] = useState<WizardData>(DEFAULT_WIZARD_DATA);
  const [wizardOpen, setWizardOpen] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(0);
  const [wizardCompleted, setWizardCompleted] = useState<boolean>(false);

  // ── Pre-analysis ──
  const [preAnalysisData, setPreAnalysisData] = useState<PreAnalysisData>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [showPreAnalysis, setShowPreAnalysis] = useState<boolean>(false);

  // ── Generation ──
  const [isChunkedGenerating, setIsChunkedGenerating] = useState<boolean>(false);
  const [chunkedProgress, setChunkedProgress] = useState<ChunkedProgress>(null);
  const [chunkedSections, setChunkedSections] = useState<any[]>([]);

  // ── Result ──
  const [estimate, setEstimate] = useState<EstimateData | null>(null);
  const [scalingInfo, setScalingInfo] = useState<ScalingInfo | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<number>>(new Set());

  // ── Verification ──
  const [verificationResult, setVerificationResult] = useState<VerificationResult>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  // ── Refine ──
  const [refineModalOpen, setRefineModalOpen] = useState<boolean>(false);
  const [engineerReportOpen, setEngineerReportOpen] = useState<boolean>(false);
  const [refinePrompt, setRefinePrompt] = useState<string>("");
  const [refining, setRefining] = useState<boolean>(false);
  const [selectedRefineModel, setSelectedRefineModel] =
    useState<"openai" | "anthropic" | "gemini">("openai");

  // ── Save ──
  const [saveModalOpen, setSaveModalOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [savedEstimateId, setSavedEstimateId] = useState<string | null>(null);

  // ── Supplement ──
  const [supplementModalOpen, setSupplementModalOpen] = useState<boolean>(false);
  const [supplementInfo, setSupplementInfo] = useState<string>("");
  const [supplementFiles, setSupplementFiles] = useState<File[]>([]);
  const [supplementing, setSupplementing] = useState<boolean>(false);
  const [supplementProgress, setSupplementProgress] = useState<SupplementProgress>(null);

  // ── Errors ──
  const [error, setError] = useState<string>("");
  const clearError = useCallback(() => setError(""), []);

  /* -------------------------------------------------------------------- */
  /* File ops                                                             */
  /* -------------------------------------------------------------------- */

  const addFiles = useCallback((incoming: File[]) => {
    setFiles((prev) => [...prev, ...incoming]);
  }, []);

  const removeFile = useCallback((idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const clearFiles = useCallback(() => setFiles([]), []);

  /* -------------------------------------------------------------------- */
  /* Projects (loaded for save dialog)                                    */
  /* -------------------------------------------------------------------- */

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/projects");
      if (!res.ok) return;
      const data = await res.json();
      const list: ProjectListItem[] = Array.isArray(data.data) ? data.data : [];
      setProjects(list);
    } catch (err) {
      console.warn("Failed to load projects", err);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  /* -------------------------------------------------------------------- */
  /* Wizard ops                                                           */
  /* -------------------------------------------------------------------- */

  const updateWizardData = useCallback(
    (patch: Partial<WizardData> | ((prev: WizardData) => WizardData)) => {
      setWizardData((prev) =>
        typeof patch === "function" ? (patch as any)(prev) : { ...prev, ...patch }
      );
    },
    []
  );

  /**
   * Set a deeply nested wizard field by dotted path.
   * Example: setNestedWizard("houseData.foundation.depth", "2.5")
   *
   * Creates intermediate objects as needed so the wizard can populate
   * `houseData.walls.material` even if `houseData` was undefined.
   */
  const setNestedWizard = useCallback((path: string, value: unknown) => {
    setWizardData((prev) => {
      const parts = path.split(".");
      const next: any = { ...prev };
      let cursor: any = next;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        cursor[key] = cursor[key] && typeof cursor[key] === "object" ? { ...cursor[key] } : {};
        cursor = cursor[key];
      }
      cursor[parts[parts.length - 1]] = value;
      return next as WizardData;
    });
  }, []);

  const openWizard = useCallback(() => {
    setWizardStep(0);
    setWizardOpen(true);
  }, []);
  const closeWizard = useCallback(() => setWizardOpen(false), []);
  const completeWizard = useCallback(() => {
    setWizardCompleted(true);
    setWizardOpen(false);
  }, []);
  const resetWizard = useCallback(() => {
    setWizardData(DEFAULT_WIZARD_DATA);
    setWizardStep(0);
    setWizardCompleted(false);
  }, []);

  /* -------------------------------------------------------------------- */
  /* Pre-analysis                                                         */
  /* -------------------------------------------------------------------- */

  const runPreAnalysis = useCallback(async () => {
    if (files.length === 0) {
      setError("Завантажте хоча б один файл проєкту");
      return;
    }
    setIsAnalyzing(true);
    setError("");
    setUploadProgress(null);

    try {
      const uploadResult = await uploadFilesToR2(files, (p) => setUploadProgress(p));
      if (!uploadResult.success) {
        throw new Error(`Помилка завантаження: ${uploadResult.failed.length} файлів`);
      }

      const formData = new FormData();
      formData.append("r2Keys", JSON.stringify(uploadResult.r2Keys));
      if (wizardData) {
        formData.append("wizardData", JSON.stringify(wizardData));
      }

      const res = await fetch("/api/admin/estimates/analyze", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Помилка аналізу файлів");
      }

      setPreAnalysisData(json);
      setShowPreAnalysis(true);
    } catch (err: any) {
      setError(err?.message || "Не вдалось проаналізувати файли");
    } finally {
      setIsAnalyzing(false);
      setTimeout(() => setUploadProgress(null), 1000);
    }
  }, [files, wizardData]);

  const closePreAnalysis = useCallback(() => setShowPreAnalysis(false), []);

  /* -------------------------------------------------------------------- */
  /* Verification                                                         */
  /* -------------------------------------------------------------------- */

  const verify = useCallback(async (data: EstimateData) => {
    setIsVerifying(true);
    setVerificationResult(null);
    try {
      const res = await fetch("/api/admin/estimates/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estimate: data }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok || !result) return;

      // Legacy API returns { verification: {...} }, while V2 UI expects the
      // inner object directly.
      const normalized =
        result.verification && typeof result.verification === "object"
          ? result.verification
          : result;

      setVerificationResult(normalized);
    } catch (err) {
      console.error("Verification error:", err);
    } finally {
      setIsVerifying(false);
    }
  }, []);

  /* -------------------------------------------------------------------- */
  /* Generation (chunked SSE)                                             */
  /* -------------------------------------------------------------------- */

  const generate = useCallback(async () => {
    if (files.length === 0) {
      setError("Завантажте хоча б один файл проєкту");
      return;
    }
    setShowPreAnalysis(false);
    setIsChunkedGenerating(true);
    setError("");
    setEstimate(null);
    setVerificationResult(null);
    setChunkedProgress(null);
    setChunkedSections([]);

    try {
      const totalSize = files.reduce((sum, f) => sum + f.size, 0);
      const formData = new FormData();

      const isProduction =
        typeof window !== "undefined" &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1";

      if (isProduction && totalSize > 4 * 1024 * 1024) {
        const filesMetadata = files.map((f) => ({ name: f.name, type: f.type, size: f.size }));
        const presignedRes = await fetch("/api/admin/estimates/presigned-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ files: filesMetadata }),
        });
        if (!presignedRes.ok) throw new Error("Не вдалось отримати presigned URLs");
        const { presignedUrls } = await presignedRes.json();
        const uploaded = await Promise.all(
          files.map(async (file, index) => {
            const data = presignedUrls[index];
            const up = await fetch(data.uploadUrl, {
              method: "PUT",
              body: file,
              headers: { "Content-Type": file.type },
            });
            if (!up.ok) throw new Error(`Помилка завантаження ${file.name}`);
            return { key: data.key, originalName: file.name, mimeType: file.type, size: file.size };
          })
        );
        formData.append("r2Keys", JSON.stringify(uploaded));
      } else {
        files.forEach((file) => formData.append("files", file));
      }

      // wizardData (always include, merge projectNotes into specialRequirements)
      const resolvedArea =
        (wizardData as any)?.totalArea ||
        (wizardData as any)?.area ||
        area ||
        "";

      const enrichedWizard = {
        ...wizardData,
        totalArea: resolvedArea,
        area: resolvedArea,
        specialRequirements: [
          (wizardData as any).specialRequirements,
          projectNotes.trim()
            ? `\n\n=== ДОДАТКОВА ІНФОРМАЦІЯ ВІД ІНЖЕНЕРА ===\n${projectNotes.trim()}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      };
      formData.append("wizardData", JSON.stringify(enrichedWizard));
      formData.append("projectNotes", projectNotes);
      formData.append("checkProzorro", String(checkProzorro));
      formData.append("prozorroSearchQuery", "");
      formData.append("mode", "master");
      if (selectedProjectId) formData.append("projectId", selectedProjectId);

      const response = await fetch("/api/admin/estimates/generate-chunked", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response body");

      const collected: any[] = [];
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const event of events) {
          if (event.startsWith(":")) continue;
          const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          const data = dataLine.slice(6);
          try {
            const update = JSON.parse(data);
            setChunkedProgress(update);

            if (update.data?.section) {
              collected.push(update.data.section);
              setChunkedSections([...collected]);
            }

            if (update.phase === "final" && update.status === "complete") {
              if (update.data?.scalingInfo) {
                setScalingInfo(update.data.scalingInfo);
              }

              let finalSections: EstimateSection[] = [];
              if (update.data?.sections?.length > 0) {
                finalSections = update.data.sections;
              } else if (collected.length > 0) {
                finalSections = collected.map((section: any) => ({
                  title: section.title,
                  items: section.items.map((item: any) => ({
                    description: item.description,
                    unit: item.unit,
                    quantity: item.quantity,
                    unitPrice: item.unitPrice,
                    laborCost: item.laborCost || 0,
                    totalCost: item.totalCost,
                    priceSource: null,
                    priceNote: null,
                  })),
                  sectionTotal: section.items.reduce(
                    (sum: number, item: any) => sum + item.totalCost,
                    0
                  ),
                }));
              } else if (update.data?.estimateId) {
                try {
                  const dbRes = await fetch(`/api/admin/estimates/${update.data.estimateId}`);
                  if (dbRes.ok) {
                    const { data } = await dbRes.json();
                    finalSections = data.sections.map((section: any) => ({
                      title: section.title,
                      items: section.items.map((item: any) => ({
                        description: item.description,
                        unit: item.unit,
                        quantity: Number(item.quantity),
                        unitPrice: Number(item.unitPrice),
                        laborCost: Number(item.laborRate) * Number(item.laborHours),
                        totalCost: Number(item.amount),
                        priceSource: null,
                        priceNote: null,
                      })),
                      sectionTotal: Number(section.totalAmount),
                    }));
                  }
                } catch (err) {
                  console.error("Failed to fetch from DB:", err);
                }
              }

              if (finalSections.length === 0) {
                setError(
                  update.message ||
                    "Генерація завершилась без жодної валідної позиції. Перевір секції з помилками у progress."
                );
                setIsChunkedGenerating(false);
                return;
              }

              const finalEstimate = recalculateSummary({
                title: `Кошторис ${update.data.estimateNumber || ""}`,
                description: "Згенеровано Master Agent",
                sections: finalSections,
                ...(update.data.analysisSummary && { analysisSummary: update.data.analysisSummary }),
                ...(update.data.prozorroAnalysis && { prozorroAnalysis: update.data.prozorroAnalysis }),
                ...(update.data.structuredReport && { structuredReport: update.data.structuredReport }),
                ...(update.data.bidIntelligence && { bidIntelligence: update.data.bidIntelligence }),
                ...(update.data.zeroPriceFixResult && { zeroPriceFixResult: update.data.zeroPriceFixResult }),
                ...(update.data.scalingInfo && { scalingInfo: update.data.scalingInfo }),
              } as EstimateData);

              setEstimate(finalEstimate);
              setExpandedSections(new Set([0])); // expand first section by default
              setIsChunkedGenerating(false);

              // Auto-verify in background
              void verify(finalEstimate);
            }

            if (update.status === "error") {
              setError(update.message || "Помилка генерації");
              setIsChunkedGenerating(false);
            }
          } catch (e) {
            console.error("Failed to parse update:", e);
          }
        }
      }
    } catch (err) {
      console.error("Generation error:", err);
      setError(err instanceof Error ? err.message : "Помилка генерації");
      setIsChunkedGenerating(false);
    }
  }, [files, wizardData, projectNotes, checkProzorro, selectedProjectId, verify]);

  /* -------------------------------------------------------------------- */
  /* Result mutations                                                     */
  /* -------------------------------------------------------------------- */

  const toggleSection = useCallback((idx: number) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const updateItem = useCallback(
    (sIdx: number, iIdx: number, patch: Partial<EstimateItem>) => {
      setEstimate((prev) => {
        if (!prev) return prev;
        const sections = [...prev.sections];
        const items = [...sections[sIdx].items];
        const merged = { ...items[iIdx], ...patch };
        merged.totalCost = merged.quantity * merged.unitPrice + merged.laborCost;
        items[iIdx] = merged;
        sections[sIdx] = {
          ...sections[sIdx],
          items,
          sectionTotal: items.reduce((sum, it) => sum + (it.totalCost || 0), 0),
        };
        return recalculateSummary({ ...prev, sections });
      });
    },
    []
  );

  const addItem = useCallback((sIdx: number) => {
    setEstimate((prev) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      const newItem: EstimateItem = {
        description: "Нова позиція",
        unit: "шт",
        quantity: 1,
        unitPrice: 0,
        laborCost: 0,
        totalCost: 0,
      };
      sections[sIdx] = {
        ...sections[sIdx],
        items: [...sections[sIdx].items, newItem],
      };
      return recalculateSummary({ ...prev, sections });
    });
  }, []);

  const deleteItem = useCallback((sIdx: number, iIdx: number) => {
    setEstimate((prev) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      const items = sections[sIdx].items.filter((_, i) => i !== iIdx);
      sections[sIdx] = {
        ...sections[sIdx],
        items,
        sectionTotal: items.reduce((sum, it) => sum + (it.totalCost || 0), 0),
      };
      return recalculateSummary({ ...prev, sections });
    });
  }, []);

  const updateSectionTitle = useCallback((sIdx: number, title: string) => {
    setEstimate((prev) => {
      if (!prev) return prev;
      const sections = [...prev.sections];
      sections[sIdx] = { ...sections[sIdx], title };
      return { ...prev, sections };
    });
  }, []);

  const addSection = useCallback(() => {
    setEstimate((prev) => {
      if (!prev) return prev;
      const sections = [
        ...prev.sections,
        { title: "Нова секція", items: [], sectionTotal: 0 },
      ];
      // Auto-expand the new section
      setExpandedSections((set) => new Set([...set, sections.length - 1]));
      return { ...prev, sections };
    });
  }, []);

  const deleteSection = useCallback((sIdx: number) => {
    setEstimate((prev) => {
      if (!prev) return prev;
      const sections = prev.sections.filter((_, i) => i !== sIdx);
      return recalculateSummary({ ...prev, sections });
    });
  }, []);

  /* -------------------------------------------------------------------- */
  /* Refine                                                               */
  /* -------------------------------------------------------------------- */

  const openRefine = useCallback(() => setRefineModalOpen(true), []);
  const closeRefine = useCallback(() => setRefineModalOpen(false), []);
  const openEngineerReport = useCallback(() => setEngineerReportOpen(true), []);
  const closeEngineerReport = useCallback(() => setEngineerReportOpen(false), []);

  const refine = useCallback(async () => {
    if (!estimate) return;
    if (!refinePrompt.trim()) {
      setError("Введіть вказівки для уточнення");
      return;
    }
    setRefining(true);
    setError("");
    try {
      const res = await fetch("/api/admin/estimates/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estimate,
          engineerPrompt: refinePrompt,
          model: selectedRefineModel,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Помилка уточнення");
        return;
      }
      const refined = recalculateSummary(json.estimate);
      setEstimate(refined);
      setRefineModalOpen(false);
      setRefinePrompt("");
      setExpandedSections(new Set(refined.sections.map((_, i) => i)));
      void verify(refined);
    } catch (err) {
      setError("Не вдалось зʼєднатись з сервером");
    } finally {
      setRefining(false);
    }
  }, [estimate, refinePrompt, selectedRefineModel, verify]);

  /* -------------------------------------------------------------------- */
  /* Save                                                                 */
  /* -------------------------------------------------------------------- */

  const openSave = useCallback(() => {
    void loadProjects();
    setSaveModalOpen(true);
  }, [loadProjects]);
  const closeSave = useCallback(() => setSaveModalOpen(false), []);

  const saveEstimate = useCallback(async () => {
    if (!estimate || !selectedProjectId) {
      setError("Оберіть проєкт для збереження");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const sectionsForApi = estimate.sections.map((section) => ({
        title: section.title,
        items: section.items.map((item: any) => ({
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          laborCost: item.laborCost,
          totalCost: item.totalCost,
          itemType: item.itemType,
          engineKey: item.engineKey,
          quantityFormula: item.quantityFormula,
          priceSource: item.priceSource,
          priceSourceType: item.priceSourceType,
          confidence: item.confidence,
        })),
      }));

      const res = await fetch("/api/admin/estimates/from-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: selectedProjectId,
          title: estimate.title,
          description: estimate.description || "",
          sections: sectionsForApi,
          overheadRate: estimate.summary?.overheadPercent || 15,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Помилка збереження");
        return;
      }
      setSavedEstimateId(json.data.id);
      router.push(`/admin-v2/estimates/${json.data.id}`);
    } catch (err) {
      setError("Не вдалось зʼєднатись з сервером");
    } finally {
      setSaving(false);
    }
  }, [estimate, selectedProjectId, router]);

  /* -------------------------------------------------------------------- */
  /* Supplement                                                           */
  /* -------------------------------------------------------------------- */

  const openSupplement = useCallback(() => setSupplementModalOpen(true), []);
  const closeSupplement = useCallback(() => setSupplementModalOpen(false), []);
  const addSupplementFiles = useCallback((files: File[]) => {
    setSupplementFiles((prev) => [...prev, ...files]);
  }, []);
  const removeSupplementFile = useCallback((idx: number) => {
    setSupplementFiles((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const supplement = useCallback(async () => {
    if (!savedEstimateId) {
      setError("Спочатку збережіть кошторис");
      return;
    }
    if (!supplementInfo.trim() && supplementFiles.length === 0) {
      setError("Додайте текст або файли для доповнення");
      return;
    }
    setSupplementing(true);
    setError("");
    setSupplementProgress(null);

    try {
      const formData = new FormData();
      formData.append("additionalInfo", supplementInfo);

      let r2Keys: any[] = [];
      if (supplementFiles.length > 0) {
        const uploadFormData = new FormData();
        supplementFiles.forEach((f) => uploadFormData.append("files", f));
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          body: uploadFormData,
        });
        if (!uploadRes.ok) throw new Error("Не вдалось завантажити файли");
        const uploadData = await uploadRes.json();
        r2Keys = uploadData.r2Keys || [];
      }
      formData.append("r2Keys", JSON.stringify(r2Keys));
      formData.append("regenerateAll", "true");

      const response = await fetch(`/api/admin/estimates/${savedEstimateId}/refine`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Помилка доповнення");

      const reader = response.body?.getReader();
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
              setSupplementProgress({
                message: data.message,
                progress: data.progress || 0,
              });
              if (data.status === "complete" && data.data) {
                alert(
                  `✅ Кошторис успішно доповнено!\n\n` +
                    `Стара вартість: ${formatCurrency(data.data.oldTotalAmount)}\n` +
                    `Нова вартість: ${formatCurrency(data.data.newTotalAmount)}\n` +
                    `Зміна: ${formatCurrency(data.data.difference)}`
                );
                router.push(`/admin-v2/estimates/${data.data.newEstimateId}`);
                return;
              } else if (data.status === "error") {
                throw new Error(data.message);
              }
            } catch (e) {
              console.error("Error parsing SSE:", e);
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не вдалось доповнити кошторис");
    } finally {
      setSupplementing(false);
    }
  }, [savedEstimateId, supplementInfo, supplementFiles, router]);

  /* -------------------------------------------------------------------- */
  /* Export                                                               */
  /* -------------------------------------------------------------------- */

  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);
  const exportEstimate = useCallback(
    async (format: "pdf" | "excel") => {
      if (!estimate) return;
      setExporting(format);
      try {
        const res = await fetch("/api/admin/estimates/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ format, estimate }),
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `koshtorys-metrum.${format === "excel" ? "xlsx" : "pdf"}`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          // Surface server error to the user instead of silently failing.
          let detail = `HTTP ${res.status}`;
          try {
            const errBody = await res.json();
            if (errBody?.message) detail += `: ${errBody.message}`;
            else if (errBody?.error) detail += `: ${errBody.error}`;
          } catch {
            try {
              const text = await res.text();
              if (text) detail += `: ${text.slice(0, 200)}`;
            } catch {}
          }
          console.error(`Export ${format} failed:`, detail);
          setError(`Експорт ${format.toUpperCase()} не вдався — ${detail}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Невідома помилка";
        console.error(`Export ${format} threw:`, err);
        setError(`Експорт ${format.toUpperCase()} впав з помилкою: ${msg}`);
      } finally {
        setExporting(null);
      }
    },
    [estimate]
  );

  /* -------------------------------------------------------------------- */
  /* Public surface                                                       */
  /* -------------------------------------------------------------------- */

  return {
    // files
    files,
    addFiles,
    removeFile,
    clearFiles,
    uploadProgress,

    // params
    projectType,
    area,
    setArea,
    projectNotes,
    setProjectNotes,
    selectedTemplate,
    setSelectedTemplate,
    selectedGenerationModel,
    setSelectedGenerationModel,
    checkProzorro,
    setCheckProzorro,

    // wizard
    wizardData,
    updateWizardData,
    setNestedWizard,
    wizardOpen,
    openWizard,
    closeWizard,
    wizardStep,
    setWizardStep,
    wizardCompleted,
    completeWizard,
    resetWizard,

    // pre-analysis
    preAnalysisData,
    isAnalyzing,
    runPreAnalysis,
    showPreAnalysis,
    closePreAnalysis,

    // generation
    isChunkedGenerating,
    chunkedProgress,
    chunkedSections,
    generate,

    // result
    estimate,
    scalingInfo,
    expandedSections,
    toggleSection,
    updateItem,
    addItem,
    deleteItem,
    updateSectionTitle,
    addSection,
    deleteSection,

    // verification
    verificationResult,
    isVerifying,
    verify,

    // engineer report (analysis + Prozorro)
    engineerReportOpen,
    openEngineerReport,
    closeEngineerReport,

    // refine
    refineModalOpen,
    openRefine,
    closeRefine,
    refinePrompt,
    setRefinePrompt,
    selectedRefineModel,
    setSelectedRefineModel,
    refining,
    refine,

    // save
    saveModalOpen,
    openSave,
    closeSave,
    projects,
    selectedProjectId,
    setSelectedProjectId,
    saving,
    saveEstimate,
    savedEstimateId,

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
    supplement,

    // export
    exporting,
    exportEstimate,

    // errors
    error,
    clearError,
  };
}
