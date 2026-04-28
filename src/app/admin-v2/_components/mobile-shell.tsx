"use client";

import { useState, useCallback } from "react";
import { MobileNav } from "./mobile-nav";
import { MobileDrawer } from "./mobile-drawer";

type Props = {
  activeFirmId?: string | null;
};

export function MobileShell({ activeFirmId }: Props = {}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <>
      <MobileNav onOpenDrawer={openDrawer} />
      <MobileDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        activeFirmId={activeFirmId ?? null}
      />
    </>
  );
}
