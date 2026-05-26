"use client";

import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useMemo } from "react";
import { getActiveRoleFromSession } from "@/lib/firm/scope";
import { HELP_REGISTRY } from "@/lib/help/registry";
import { selectPageHelp } from "@/lib/help/selectPageHelp";
import { useHelp } from "@/contexts/HelpContext";

export function usePageHelp() {
  const pathname = usePathname() ?? "/";
  const { data: session } = useSession();
  const { activeFirmId } = useHelp();

  const role = useMemo(
    () => getActiveRoleFromSession(session ?? null, activeFirmId) ?? session?.user?.role ?? null,
    [session, activeFirmId],
  );

  const help = useMemo(
    () => selectPageHelp(pathname, role, HELP_REGISTRY),
    [pathname, role],
  );

  return { help, pathname, role };
}
