"use client";

import { useEffect, useState } from "react";
import { Loader2, Mail, Phone } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { DrawerLayout } from "../layouts/DrawerLayout";
import { DrawerHeader } from "../layouts/DrawerHeader";
import { DrawerBody } from "../layouts/DrawerBody";
import { useDrillDown } from "../use-drill-down";
import { useIsMobile } from "../hooks/use-is-mobile";
import type { RendererProps } from "../types";

type UserSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  position: string | null;
  avatar: string | null;
};

export function UserDrawerContent({ id }: RendererProps) {
  const isMobile = useIsMobile();
  const drawer = useDrillDown();
  const [data, setData] = useState<UserSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/users/${id}`);
        if (!r.ok) return;
        const j = await r.json();
        if (cancelled) return;
        const u = j.data ?? j;
        setData({
          id: u.id,
          name: u.name ?? u.fullName ?? "—",
          email: u.email ?? null,
          phone: u.phone ?? null,
          role: u.role ?? null,
          position: u.position ?? u.title ?? null,
          avatar: u.avatar ?? null,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (data?.name) drawer.setTopBreadcrumb(data.name);
  }, [data?.name, drawer]);

  return (
    <DrawerLayout>
      <DrawerHeader isMobile={isMobile} />
      <DrawerBody>
        {loading ? (
          <div
            className="flex items-center justify-center py-12"
            style={{ color: T.textMuted }}
          >
            <Loader2 className="animate-spin" size={18} />
          </div>
        ) : !data ? (
          <p className="text-sm" style={{ color: T.textMuted }}>
            Не вдалось завантажити користувача.
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <Avatar src={data.avatar} name={data.name} />
              <div>
                <h2
                  className="text-lg font-bold"
                  style={{ color: T.textPrimary }}
                >
                  {data.name}
                </h2>
                {data.position ? (
                  <p
                    className="text-[12px]"
                    style={{ color: T.textSecondary }}
                  >
                    {data.position}
                  </p>
                ) : null}
                {data.role ? (
                  <p className="text-[11px]" style={{ color: T.textMuted }}>
                    {data.role}
                  </p>
                ) : null}
              </div>
            </div>
            {data.email ? (
              <a
                href={`mailto:${data.email}`}
                className="flex items-center gap-2 text-[13px]"
                style={{ color: T.textPrimary }}
              >
                <Mail size={14} style={{ color: T.textMuted }} />
                {data.email}
              </a>
            ) : null}
            {data.phone ? (
              <a
                href={`tel:${data.phone}`}
                className="flex items-center gap-2 text-[13px]"
                style={{ color: T.textPrimary }}
              >
                <Phone size={14} style={{ color: T.textMuted }} />
                {data.phone}
              </a>
            ) : null}
            <p
              className="mt-4 text-[11px]"
              style={{ color: T.textMuted }}
            >
              Повний профіль + задачі/календар — у відповідних модулях
              (кнопка «На сторінку» у заголовку).
            </p>
          </div>
        )}
      </DrawerBody>
    </DrawerLayout>
  );
}

function Avatar({ src, name }: { src: string | null; name: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        className="h-12 w-12 rounded-full object-cover"
      />
    );
  }
  const initial = name.trim().slice(0, 1).toUpperCase() || "?";
  return (
    <div
      className="flex h-12 w-12 items-center justify-center rounded-full text-lg font-bold"
      style={{ backgroundColor: T.panelElevated, color: T.textPrimary }}
    >
      {initial}
    </div>
  );
}

export default UserDrawerContent;
