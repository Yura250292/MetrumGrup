"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProfileData } from "./types";

export function useProfile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/profile");
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      setProfile(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const updateProfile = useCallback(
    async (patch: Record<string, unknown>) => {
      const res = await fetch("/api/admin/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to update profile");
      }
      const updated = await res.json();
      setProfile(updated);
      return updated;
    },
    []
  );

  const uploadAvatar = useCallback(async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/admin/profile/avatar", {
      method: "POST",
      body: fd,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || "Failed to upload avatar");
    }
    const data = await res.json();
    setProfile((prev) => (prev ? { ...prev, avatar: data.avatarUrl } : prev));
    return data.avatarUrl as string;
  }, []);

  const deleteAvatar = useCallback(async () => {
    const res = await fetch("/api/admin/profile/avatar", { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete avatar");
    setProfile((prev) => (prev ? { ...prev, avatar: null } : prev));
  }, []);

  const updateNotifications = useCallback(
    async (prefs: Record<string, unknown>) => {
      const res = await fetch("/api/admin/profile/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to update notifications");
      const data = await res.json();
      setProfile((prev) =>
        prev ? { ...prev, notificationPrefsJson: data.notificationPrefsJson } : prev
      );
    },
    []
  );

  const updatePreferences = useCallback(
    async (prefs: Record<string, unknown>) => {
      const res = await fetch("/api/admin/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to update preferences");
      const data = await res.json();
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              workPrefsJson: data.workPrefsJson,
              productivityPrefsJson: data.productivityPrefsJson,
            }
          : prev
      );
    },
    []
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const res = await fetch("/api/admin/profile/security", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to change password");
      }
    },
    []
  );

  return {
    profile,
    loading,
    error,
    fetchProfile,
    updateProfile,
    uploadAvatar,
    deleteAvatar,
    updateNotifications,
    updatePreferences,
    changePassword,
  };
}
