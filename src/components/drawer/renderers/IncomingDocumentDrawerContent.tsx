"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { DrawerLayout } from "../layouts/DrawerLayout";
import { DrawerHeader } from "../layouts/DrawerHeader";
import { DrawerBody } from "../layouts/DrawerBody";
import { useDrillDown } from "../use-drill-down";
import { useIsMobile } from "../hooks/use-is-mobile";
import { DocumentDetailClient } from "@/app/admin-v2/documents/[id]/document-detail-client";
import type { DocumentDetailResponse } from "@/app/admin-v2/documents/_components/types";
import type { RendererProps } from "../types";

/**
 * Drawer-режим перегляду вхідного документа. Інший варіант — повна сторінка
 * /admin-v2/documents/[id] (через "↗ На сторінку" у DrawerHeader, бо registry
 * має pageHref для цього типу).
 */
export function IncomingDocumentDrawerContent({ id }: RendererProps) {
  const isMobile = useIsMobile();
  const drawer = useDrillDown();
  const { data: session } = useSession();
  const canLink = session?.user?.role === "SUPER_ADMIN";

  const [fileName, setFileName] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/documents/${id}`);
        if (!r.ok) return;
        const j = (await r.json()) as DocumentDetailResponse;
        if (!cancelled && j?.document?.originalFileName) {
          setFileName(j.document.originalFileName);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (fileName) drawer.setTopBreadcrumb(fileName);
  }, [fileName, drawer]);

  return (
    <DrawerLayout>
      <DrawerHeader isMobile={isMobile} />
      <DrawerBody>
        <DocumentDetailClient documentId={id} canLink={canLink} variant="drawer" />
      </DrawerBody>
    </DrawerLayout>
  );
}

export default IncomingDocumentDrawerContent;
