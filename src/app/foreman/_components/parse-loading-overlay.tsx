"use client";

interface ParseLoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export function ParseLoadingOverlay({
  visible,
  message = "Аналізую витрати…",
}: ParseLoadingOverlayProps) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 bg-zinc-950/95 backdrop-blur-sm flex flex-col items-center justify-center gap-4 px-6">
      <div className="w-16 h-16 rounded-full border-4 border-emerald-500 border-t-transparent animate-spin" />
      <div className="text-xl font-semibold text-white text-center">{message}</div>
      <div className="text-sm text-zinc-400 text-center">Це може зайняти 10-30 секунд</div>
    </div>
  );
}
