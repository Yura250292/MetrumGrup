"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Camera, FolderOpen } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { TabFiles } from "./tab-files";
import { TabPhotos } from "./tab-photos";

type SubTab = "files" | "photos";

type Props = {
  projectId: string;
  photoReports: Array<{
    id: string;
    title: string;
    createdAt: Date;
    createdByName: string;
    firstImageUrl: string | null;
  }>;
  photoReportsCount: number;
};

/**
 * Об'єднана таба «Медіа»: внутрішній segmented switch Файли | Фото.
 * Persisted у URL як `?tab=media&sub=files|photos`.
 */
export function TabMedia({ projectId, photoReports, photoReportsCount }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const sub: SubTab = sp.get("sub") === "photos" ? "photos" : "files";

  const setSub = (next: SubTab) => {
    const params = new URLSearchParams(sp.toString());
    params.set("tab", "media");
    params.set("sub", next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-4">
      <SegmentedSwitch sub={sub} setSub={setSub} />
      {sub === "files" ? (
        <TabFiles projectId={projectId} />
      ) : (
        <TabPhotos
          projectId={projectId}
          photoReports={photoReports}
          totalCount={photoReportsCount}
        />
      )}
    </div>
  );
}

function SegmentedSwitch({
  sub,
  setSub,
}: {
  sub: SubTab;
  setSub: (next: SubTab) => void;
}) {
  return (
    <div
      className="inline-flex w-fit items-center rounded-lg p-0.5"
      style={{
        backgroundColor: T.panelSoft,
        border: `1px solid ${T.borderSoft}`,
      }}
    >
      <SubButton
        active={sub === "files"}
        icon={<FolderOpen size={13} />}
        label="Файли"
        onClick={() => setSub("files")}
      />
      <SubButton
        active={sub === "photos"}
        icon={<Camera size={13} />}
        label="Фото"
        onClick={() => setSub("photos")}
      />
    </div>
  );
}

function SubButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded px-3 py-1.5 text-[12px] font-medium transition"
      style={{
        backgroundColor: active ? T.panel : "transparent",
        color: active ? T.accentPrimary : T.textMuted,
        boxShadow: active ? `0 1px 2px ${T.borderSoft}` : undefined,
        fontWeight: active ? 600 : 500,
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
