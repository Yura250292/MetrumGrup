"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  MessageSquare,
  Mail,
  Phone,
  Briefcase,
  Users as UsersIcon,
  Clock,
  FolderKanban,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { useCreateConversation } from "@/hooks/useChat";

type PublicProfile = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  bio: string | null;
  jobTitle: string | null;
  role: string;
  isActive: boolean;
  timezone: string;
  teams: { id: string; name: string; departmentName: string | null }[];
  managedProjects: { id: string; title: string }[];
  isSelf: boolean;
};

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адміністратор",
  MANAGER: "Менеджер",
  ENGINEER: "Інженер",
  FINANCIER: "Фінансист",
  CLIENT: "Клієнт",
  USER: "Користувач",
};

export function UserProfileModal({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const createConv = useCreateConversation();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/admin/users/" + userId + "/public")
      .then((r) => {
        if (!r.ok) throw new Error("Не вдалося завантажити профіль");
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSendMessage = async () => {
    if (!profile) return;
    try {
      const conv = await createConv.mutateAsync({ type: "DM", userId: profile.id });
      onClose();
      router.push("/admin-v2/chat?c=" + conv.id);
    } catch {
      setError("Не вдалося створити розмову");
    }
  };

  // Group managed projects by title (shows one row per unique name with a count)
  const managedProjects = (() => {
    if (!profile) return [] as { id: string; title: string; count: number }[];
    const map = new Map<string, { id: string; title: string; count: number }>();
    for (const p of profile.managedProjects) {
      const key = p.title.trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(key, { id: p.id, title: p.title, count: 1 });
      }
    }
    return Array.from(map.values());
  })();

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl flex flex-col"
        style={{
          backgroundColor: T.panel,
          border: "1px solid " + T.borderSoft,
          boxShadow: "0 10px 40px rgba(0,0,0,0.2)",
          maxHeight: "90vh",
        }}
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin" style={{ color: T.accentPrimary }} />
            <p className="mt-3 text-[13px]" style={{ color: T.textMuted }}>
              Завантаження...
            </p>
          </div>
        ) : error || !profile ? (
          <div className="px-6 py-10 text-center flex flex-col gap-3">
            <p className="text-[13px]" style={{ color: T.danger }}>
              {error || "Профіль не знайдено"}
            </p>
            <button
              onClick={onClose}
              className="mx-auto rounded-xl px-4 py-2 text-[13px] font-medium"
              style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
            >
              Закрити
            </button>
          </div>
        ) : (
          <>
            {/* ── Sticky header ── */}
            <div
              className="relative flex-shrink-0 rounded-t-2xl overflow-hidden"
              style={{
                background: "linear-gradient(135deg, " + T.accentPrimary + ", " + T.accentSecondary + ")",
              }}
            >
              <button
                onClick={onClose}
                className="absolute top-3 right-3 z-10 rounded-lg p-1.5 transition hover:bg-white/20"
                style={{ color: "#FFFFFF" }}
                title="Закрити"
              >
                <X size={18} />
              </button>
              <div className="flex items-center gap-4 px-5 py-5">
                <div className="rounded-full p-1" style={{ backgroundColor: T.panel }}>
                  <UserAvatar src={profile.avatar} name={profile.name} size={72} nonInteractive />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-[18px] font-bold truncate text-white">
                    {profile.name}
                  </h2>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/25 text-white">
                      {ROLE_LABELS[profile.role] ?? profile.role}
                    </span>
                    {!profile.isActive && (
                      <span
                        className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: T.dangerSoft, color: T.danger }}
                      >
                        Неактивний
                      </span>
                    )}
                  </div>
                  {profile.jobTitle && (
                    <p className="text-[12px] text-white/90 mt-1 truncate">
                      <Briefcase size={11} className="inline mr-1 -mt-0.5" />
                      {profile.jobTitle}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* ── Scrollable body ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4 min-h-0">
              {/* Bio */}
              {profile.bio && (
                <div>
                  <SectionLabel>Про користувача</SectionLabel>
                  <div
                    className="rounded-xl p-3 mt-1.5"
                    style={{ backgroundColor: T.panelSoft, border: "1px solid " + T.borderSoft }}
                  >
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: T.textPrimary }}>
                      {profile.bio}
                    </p>
                  </div>
                </div>
              )}

              {/* Contacts */}
              <div>
                <SectionLabel>Контакти</SectionLabel>
                <div className="mt-1.5 flex flex-col gap-1">
                  <CopyableRow icon={<Mail size={13} />} value={profile.email} />
                  {profile.phone && (
                    <CopyableRow icon={<Phone size={13} />} value={profile.phone} />
                  )}
                  <div
                    className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px]"
                    style={{ backgroundColor: T.panelSoft, color: T.textPrimary }}
                  >
                    <Clock size={13} style={{ color: T.textMuted }} />
                    <span>{profile.timezone}</span>
                  </div>
                </div>
              </div>

              {/* Teams */}
              {profile.teams.length > 0 && (
                <div>
                  <SectionLabel>Команди</SectionLabel>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    {profile.teams.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium"
                        style={{ backgroundColor: T.panelElevated, color: T.textPrimary }}
                      >
                        <UsersIcon size={11} style={{ color: T.textMuted }} />
                        {t.name}
                        {t.departmentName && (
                          <span className="text-[11px]" style={{ color: T.textMuted }}>
                            · {t.departmentName}
                          </span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Managed projects */}
              {managedProjects.length > 0 && (
                <div>
                  <SectionLabel>Менеджер проєктів</SectionLabel>
                  <div className="flex flex-col gap-1 mt-1.5">
                    {managedProjects.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-2"
                        style={{ backgroundColor: T.panelSoft, border: "1px solid " + T.borderSoft }}
                      >
                        <FolderKanban size={13} style={{ color: T.textMuted }} />
                        <span className="text-[13px] truncate flex-1" style={{ color: T.textPrimary }}>
                          {p.title}
                        </span>
                        {p.count > 1 && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                          >
                            ×{p.count}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ── Sticky footer with actions ── */}
            <div
              className="flex-shrink-0 px-5 py-3 flex gap-2 rounded-b-2xl"
              style={{ borderTop: "1px solid " + T.borderSoft, backgroundColor: T.panelSoft }}
            >
              {profile.isSelf ? (
                <button
                  onClick={() => {
                    onClose();
                    router.push("/admin-v2/profile");
                  }}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold"
                  style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
                >
                  Редагувати профіль
                </button>
              ) : profile.isActive ? (
                <button
                  onClick={handleSendMessage}
                  disabled={createConv.isPending}
                  className="flex-1 flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition disabled:opacity-60"
                  style={{ backgroundColor: T.accentPrimary, color: "#FFFFFF" }}
                >
                  {createConv.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <MessageSquare size={14} />
                  )}
                  Написати повідомлення
                </button>
              ) : (
                <button
                  onClick={onClose}
                  className="flex-1 rounded-xl px-4 py-2.5 text-[13px] font-medium"
                  style={{ backgroundColor: T.panelElevated, color: T.textSecondary }}
                >
                  Закрити
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[10px] font-bold tracking-wider uppercase"
      style={{ color: T.textMuted }}
    >
      {children}
    </span>
  );
}

function CopyableRow({ icon, value }: { icon: React.ReactNode; value: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] text-left transition hover:brightness-95"
      style={{ backgroundColor: T.panelSoft, color: T.textPrimary }}
      title="Копіювати"
    >
      <span style={{ color: T.textMuted }}>{icon}</span>
      <span className="flex-1 truncate">{value}</span>
      <span style={{ color: copied ? T.success : T.textMuted }}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </span>
    </button>
  );
}
