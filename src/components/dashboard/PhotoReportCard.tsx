import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { STAGE_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import type { PhotoReportWithImages } from "@/types";
import { Camera } from "lucide-react";
import Image from "next/image";

interface PhotoReportCardProps {
  report: PhotoReportWithImages;
}

export function PhotoReportCard({ report }: PhotoReportCardProps) {
  return (
    <Card className="overflow-hidden">
      {/* Images grid */}
      {report.images.length > 0 ? (
        <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3">
          {report.images.slice(0, 6).map((image, index) => (
            <div key={image.id} className="relative aspect-square bg-muted">
              <Image
                src={image.url}
                alt={image.caption || `Фото ${index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 640px) 50vw, 33vw"
              />
              {/* Show count overlay on last visible image if more exist */}
              {index === 5 && report.images.length > 6 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <span className="text-lg font-bold text-white">
                    +{report.images.length - 6}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex h-32 items-center justify-center bg-muted/50">
          <Camera className="h-8 w-8 text-muted-foreground" />
        </div>
      )}

      {/* Info */}
      <div className="p-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{report.title}</h3>
          <Badge variant="secondary">{STAGE_LABELS[report.stage]}</Badge>
        </div>
        {report.description && (
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
            {report.description}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <span>{formatDate(report.createdAt)}</span>
          <span>•</span>
          <span>{report.createdBy.name}</span>
          <span>•</span>
          <span>{report.images.length} фото</span>
        </div>
      </div>
    </Card>
  );
}
