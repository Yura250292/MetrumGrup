"use client";

import { useState, useCallback } from "react";
import { MobileNav } from "./mobile-nav";
import { MobileDrawer } from "./mobile-drawer";

export function MobileShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const openDrawer = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  return (
    <>
      <MobileNav onOpenDrawer={openDrawer} />
      <MobileDrawer open={drawerOpen} onClose={closeDrawer} />
    </>
  );
}
