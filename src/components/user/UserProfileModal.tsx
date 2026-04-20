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

  // Esc to close
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

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl overflow-hidden flex flex-col"
        style={{
          backgroundColor: T.panel,
          border: "1px solid " + T.borderSoft,
          boxShadow: "0 10px 40px rgba(0,0,0,0.15)",
          maxHeight: "85vh",
        }}
      >
        {/* Header cover with close button */}
        <div
          className="relative h-20"
          style={{
            background: "linear-gradient(135deg, " + T.accentPrimary + ", " + T.accentSecondary + ")",
          }}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 rounded-lg p-1.5 transition hover:bg-white/20"
            style={{ color: "#FFFFFF" }}
            title="Закрити"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin" style={{ color: T.accentPrimary }} />
            <p className="mt-3 text-[13px]" style={{ color: T.textMuted }}>
              Завантаження профілю...
            </p>
          </div>
        ) : error || !profile ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[13px]" style={{ color: T.danger }}>
              {error || "Профіль не знайдено"}
            </p>
          </div>
        ) : (
          <>
            {/* Avatar (overlapping the cover) */}
            <div className="-mt-10 px-6 flex items-end gap-4">
              <div
                className="rounded-full p-1 flex-shrink-0"
                style={{ backgroundColor: T.panel }}
              >
                <UserAvatar src={profile.avatar} name={profile.name} size={80} />
              </div>
              <div className="flex-1 min-w-0 pb-2">
                <h2 className="text-[18px] font-bold truncate" style={{ color: T.textPrimary }}>
                  {profile.name}
                </h2>
                <div className="flex items-center gap-2 flex-wrap mt-0.5">
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: T.accentPrimarySoft, color: T.accentPrimary }}
                  >
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
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-6 pt-4 pb-5 flex flex-col gap-4">
              {/* Job title */}
              {profile.jobTitle && (
                <div className="flex items-start gap-2.5">
                  <Briefcase size={15} className="flex-shrink-0 mt-0.5" style={{ color: T.textMuted }} />
                  <span className="text-[13px]" style={{ color: T.textPrimary }}>
                    {profile.jobTitle}
                  </span>
                </div>
              )}

              {/* Bio */}
              {profile.bio && (
                <div
                  className="rounded-xl p-3"
                  style={{ backgroundColor: T.panelSoft, border: "1px solid " + T.borderSoft }}
                >
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: T.textPrimary }}>
                    {profile.bio}
                  </p>
                </div>
              )}

              {/* Contact + time */}
              <div className="flex flex-col gap-1.5">
                <InfoRow icon={<Mail size={14} />} label={profile.email} copyable />
                {profile.phone && (
                  <InfoRow icon={<Phone size={14} />} label={profile.phone} copyable />
                )}
                <InfoRow icon={<Clock size={14} />} label={profile.timezone} />
              </div>

              {/* Teams */}
              {profile.teams.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: T.textMuted }}>
                    Команди
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {profile.teams.map((t) => (
                      <span
                        key={t.id}
                        className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-medium"
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
              {profile.managedProjects.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold tracking-wider uppercase" style={{ color: T.textMuted }}>
                    Менеджер проєктів
                  </span>
                  <div className="flex flex-col gap-1">
                    {profile.managedProjects.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-center gap-2 rounded-lg px-2.5 py-1.5"
                        style={{ backgroundColor: T.panelSoft }}
                      >
                        <FolderKanban size={12} style={{ color: T.textMuted }} />
                        <span className="text-[12px] truncate" style={{ color: T.textPrimary }}>
                          {p.title}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Action bar */}
            {!profile.isSelf && profile.isActive && (
              <div
                className="px-6 py-3 flex gap-2"
                style={{ borderTop: "1px solid " + T.borderSoft, backgroundColor: T.panelSoft }}
              >
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
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  copyable,
}: {
  icon: React.ReactNode;
  label: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (!copyable) return;
    navigator.clipboard.writeText(label).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button
      onClick={handleCopy}
      disabled={!copyable}
      className="flex items-center gap-2.5 text-left disabled:cursor-default"
      title={copyable ? "Копіювати" : undefined}
    >
      <span style={{ color: T.textMuted }}>{icon}</span>
      <span className="text-[13px] truncate" style={{ color: T.textPrimary }}>
        {label}
      </span>
      {copied && (
        <span className="text-[11px]" style={{ color: T.success }}>
          Скопійовано
        </span>
      )}
    </button>
  );
}
