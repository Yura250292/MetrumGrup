"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, Sparkles, X, Loader2, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { VisualizerResult } from "@/components/dashboard/VisualizerResult";

const STYLES = [
  "Сучасний",
  "Скандинавський",
  "Мінімалізм",
  "Лофт",
  "Класичний",
  "Прованс",
];

const ROOM_TYPES = [
  "Вітальня",
  "Спальня",
  "Кухня",
  "Ванна кімната",
  "Офіс",
  "Дитяча",
];

interface VisualizerData {
  description: string;
  generatedImage: string | null;
  items: Array<{
    name: string;
    category: string;
    estimatedPrice: string;
    shopUrl: string;
    shopName: string;
  }>;
}

export default function VisualizerPage() {
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [style, setStyle] = useState(STYLES[0]);
  const [roomType, setRoomType] = useState(ROOM_TYPES[0]);
  const [wishes, setWishes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisualizerData | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Підтримуються тільки JPEG, PNG та WebP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Максимальний розмір файлу — 5 МБ");
      return;
    }
    setError(null);
    setImage(file);
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleSubmit = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("image", image);
      formData.append("style", style);
      formData.append("roomType", roomType);
      formData.append("wishes", wishes);

      const res = await fetch("/api/visualizer", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Помилка генерації");
        return;
      }

      setResult(data);
    } catch {
      setError("Не вдалось з'єднатися з сервером");
    } finally {
      setLoading(false);
    }
  };

  const removeImage = () => {
    setImage(null);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">AI Візуалізація дизайну</h1>
            <p className="text-sm text-muted-foreground">
              Завантажте фото приміщення — AI покаже як воно виглядатиме після ремонту
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,1fr]">
        {/* Left: Upload & Settings */}
        <div className="space-y-5">
          {/* Upload zone */}
          {!preview ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 transition-all aspect-[4/3]",
                dragActive
                  ? "border-primary bg-primary/5"
                  : "border-border/50 bg-muted/20 hover:border-primary/50 hover:bg-muted/40"
              )}
            >
              <div className="mb-4 rounded-2xl bg-muted/50 p-4">
                <Upload className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="mb-1 text-sm font-medium">Перетягніть фото сюди</p>
              <p className="text-xs text-muted-foreground">або натисніть для вибору</p>
              <p className="mt-2 text-[10px] text-muted-foreground">JPEG, PNG, WebP · до 5 МБ</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
            </div>
          ) : (
            <div className="relative rounded-2xl border border-border/50 overflow-hidden aspect-[4/3]">
              <img src={preview} alt="Превʼю" className="w-full h-full object-cover" />
              <button
                onClick={removeImage}
                className="absolute top-3 right-3 rounded-full bg-black/60 p-1.5 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                <ImageIcon className="mr-1 inline h-3 w-3" />
                Ваше фото
              </div>
            </div>
          )}

          {/* Style selector */}
          <div>
            <label className="mb-2 block text-sm font-medium">Стиль інтер&apos;єру</label>
            <div className="grid grid-cols-3 gap-2">
              {STYLES.map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-xs font-medium transition-all",
                    style === s
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Room type selector */}
          <div>
            <label className="mb-2 block text-sm font-medium">Тип приміщення</label>
            <div className="grid grid-cols-3 gap-2">
              {ROOM_TYPES.map((r) => (
                <button
                  key={r}
                  onClick={() => setRoomType(r)}
                  className={cn(
                    "rounded-xl border px-3 py-2.5 text-xs font-medium transition-all",
                    roomType === r
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/50 text-muted-foreground hover:border-primary/30 hover:text-foreground"
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* Wishes */}
          <div>
            <label className="mb-2 block text-sm font-medium">Побажання (опціонально)</label>
            <textarea
              value={wishes}
              onChange={(e) => setWishes(e.target.value)}
              placeholder="Бюджет, кольорова гама, конкретні меблі..."
              rows={3}
              className="w-full rounded-xl border border-border/50 bg-white px-4 py-3 text-sm placeholder:text-muted-foreground/60 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 resize-none"
            />
          </div>

          {/* Submit button */}
          <button
            onClick={handleSubmit}
            disabled={!image || loading}
            className={cn(
              "flex w-full items-center justify-center gap-2.5 rounded-xl px-6 py-3.5 text-sm font-semibold transition-all",
              image && !loading
                ? "bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/25"
                : "bg-muted text-muted-foreground cursor-not-allowed"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                AI генерує дизайн...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Візуалізувати
              </>
            )}
          </button>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        {/* Right: Result */}
        <div>
          {loading && (
            <div className="flex flex-col items-center justify-center rounded-2xl border bg-muted/20 p-12 aspect-[4/3]">
              <div className="mb-4 animate-pulse rounded-2xl bg-primary/10 p-5">
                <Sparkles className="h-10 w-10 text-primary" />
              </div>
              <p className="mb-1 text-sm font-medium">AI генерує дизайн</p>
              <p className="text-xs text-muted-foreground">Це може зайняти до 30 секунд...</p>
            </div>
          )}

          {result && preview && (
            <VisualizerResult
              originalImage={preview}
              generatedImage={result.generatedImage}
              description={result.description}
              items={result.items}
            />
          )}

          {!loading && !result && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/10 p-12 aspect-[4/3]">
              <ImageIcon className="mb-3 h-12 w-12 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground/60">
                Тут з&apos;явиться результат візуалізації
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
