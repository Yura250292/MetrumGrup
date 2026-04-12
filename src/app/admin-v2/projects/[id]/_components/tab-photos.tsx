"use client";

import Link from "next/link";
import { Camera, Plus } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";

type PhotoReport = {
  id: string;
  title: string;
  createdAt: Date;
  createdByName: string;
  firstImageUrl: string | null;
};

export function TabPhotos({
  projectId,
  photoReports,
  totalCount,
}: {
  projectId: string;
  photoReports: PhotoReport[];
  totalCount: number;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[13px]" style={{ color: T.textMuted }}>
          {totalCount} {totalCount === 1 ? "фото-звіт" : "фото-звітів"}
        </span>
        <Link
          href={`/admin-v2/projects/${projectId}/photos/new`}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white"
          style={{ backgroundColor: T.accentPrimary }}
        >
          <Plus size={16} /> Додати фото-звіт
        </Link>
      </div>

      {photoReports.length === 0 ? (
        <div
          className="flex flex-col items-center gap-3 rounded-2xl py-16 text-center"
          style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
        >
          <Camera size={32} style={{ color: T.accentPrimary }} />
          <span className="text-[14px] font-semibold" style={{ color: T.textPrimary }}>
            Фото-звітів немає
          </span>
          <span className="text-[12px]" style={{ color: T.textMuted }}>
            Додайте перший фото-звіт по проєкту
          </span>
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {photoReports.map((report) => (
            <div
              key={report.id}
              className="overflow-hidden rounded-2xl"
              style={{ backgroundColor: T.panel, border: `1px solid ${T.borderSoft}` }}
            >
              <div
                className="aspect-video flex items-center justify-center"
                style={{ backgroundColor: T.panelElevated }}
              >
                {report.firstImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={report.firstImageUrl}
                    alt={report.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Camera size={28} style={{ color: T.textMuted }} />
                )}
              </div>
              <div className="flex flex-col gap-1 p-4">
                <span className="text-[14px] font-semibold truncate" style={{ color: T.textPrimary }}>
                  {report.title}
                </span>
                <span className="text-[11px]" style={{ color: T.textMuted }}>
                  {report.createdByName} ·{" "}
                  {new Date(report.createdAt).toLocaleDateString("uk-UA")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
