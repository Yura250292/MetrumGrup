"use client";

import { useState, useEffect, useCallback } from "react";
import type { ProfileData } from "./types";

export function useProfile() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      setError(null);
      const res = await fetch("/api/admin/profile");
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      setProfile(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      if (!silent) setLoading(false);
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
      await fetchProfile(true);
    },
    [fetchProfile]
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
    await fetchProfile(true);
    return data.avatarUrl as string;
  }, [fetchProfile]);

  const deleteAvatar = useCallback(async () => {
    const res = await fetch("/api/admin/profile/avatar", { method: "DELETE" });
    if (!res.ok) throw new Error("Failed to delete avatar");
    await fetchProfile(true);
  }, [fetchProfile]);

  const updateNotifications = useCallback(
    async (prefs: Record<string, unknown>) => {
      const res = await fetch("/api/admin/profile/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to update notifications");
      await fetchProfile(true);
    },
    [fetchProfile]
  );

  const updatePreferences = useCallback(
    async (prefs: Record<string, unknown>) => {
      const res = await fetch("/api/admin/profile/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!res.ok) throw new Error("Failed to update preferences");
      await fetchProfile(true);
    },
    [fetchProfile]
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
