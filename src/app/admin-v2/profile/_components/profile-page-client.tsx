"use client";

import { useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { T } from "@/app/ai-estimate-v2/_components/tokens";
import { useProfile } from "../_lib/use-profile";
import { SECTIONS } from "../_lib/constants";
import type { ProfileSection } from "../_lib/types";
import { ProfileSummaryCard } from "./profile-summary-card";
import { ProfileSectionNav } from "./profile-section-nav";
import { SectionBasic } from "./section-basic";
import { SectionAvatar } from "./section-avatar";
import { SectionAbout } from "./section-about";
import { SectionRole } from "./section-role";
import { SectionNotifications } from "./section-notifications";
import { SectionWorkSettings } from "./section-work-settings";
import { SectionProductivity } from "./section-productivity";
import { SectionSecurity } from "./section-security";
import { SectionQuickChat } from "./section-quick-chat";

export function ProfilePageClient() {
  const {
    profile,
    loading,
    error,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    updateNotifications,
    updatePreferences,
    changePassword,
    fetchProfile,
  } = useProfile();

  const [activeSection, setActiveSection] = useState<ProfileSection>("basic");
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const scrollToSection = (id: ProfileSection) => {
    setActiveSection(id);
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 size={32} className="animate-spin" style={{ color: T.accentPrimary }} />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="px-4 md:px-8 py-8">
        <div
          className="rounded-2xl p-6 text-center"
          style={{ backgroundColor: T.dangerSoft, color: T.danger }}
        >
          {error || "Не вдалося завантажити профіль"}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-6 max-w-6xl mx-auto">
      {/* Hero */}
      <div className="mb-6">
        <span
          className="text-[11px] font-bold tracking-wider uppercase"
          style={{ color: T.accentPrimary }}
        >
          Профіль
        </span>
        <h1 className="text-2xl md:text-3xl font-bold mt-1" style={{ color: T.textPrimary }}>
          Мій профіль
        </h1>
        <p className="text-[14px] mt-1" style={{ color: T.textSecondary }}>
          Керуйте персональними даними, аватаром, сповіщеннями та робочими налаштуваннями
        </p>
      </div>

      {/* Summary card */}
      <ProfileSummaryCard profile={profile} />

      {/* Main layout: sidebar nav + sections */}
      <div className="flex gap-6 mt-6">
        {/* Left nav — desktop only */}
        <div className="hidden lg:block w-56 flex-shrink-0">
          <div className="sticky top-20">
            <ProfileSectionNav
              sections={SECTIONS}
              active={activeSection}
              onSelect={scrollToSection}
            />
          </div>
        </div>

        {/* Sections */}
        <div className="flex-1 min-w-0 flex flex-col gap-6">
          <div ref={(el) => { sectionRefs.current.basic = el; }}>
            <SectionBasic profile={profile} onSave={updateProfile} />
          </div>
          <div ref={(el) => { sectionRefs.current.avatar = el; }}>
            <SectionAvatar
              profile={profile}
              onUpload={uploadAvatar}
              onDelete={deleteAvatar}
            />
          </div>
          <div ref={(el) => { sectionRefs.current.about = el; }}>
            <SectionAbout profile={profile} onSave={updateProfile} />
          </div>
          <div ref={(el) => { sectionRefs.current.role = el; }}>
            <SectionRole profile={profile} />
          </div>
          <div ref={(el) => { sectionRefs.current.notifications = el; }}>
            <SectionNotifications
              profile={profile}
              onSave={updateNotifications}
            />
          </div>
          <div ref={(el) => { sectionRefs.current.quickChat = el; }}>
            <SectionQuickChat />
          </div>
          <div ref={(el) => { sectionRefs.current.workSettings = el; }}>
            <SectionWorkSettings profile={profile} onSave={updateProfile} />
          </div>
          <div ref={(el) => { sectionRefs.current.productivity = el; }}>
            <SectionProductivity
              profile={profile}
              onSave={updatePreferences}
            />
          </div>
          <div ref={(el) => { sectionRefs.current.security = el; }}>
            <SectionSecurity onChangePassword={changePassword} />
          </div>
        </div>
      </div>
    </div>
  );
}
