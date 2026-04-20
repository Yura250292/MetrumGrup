"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { UserProfileModal } from "@/components/user/UserProfileModal";

type UserProfileContextValue = {
  openProfile: (userId: string) => void;
  closeProfile: () => void;
};

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

export function UserProfileProvider({ children }: { children: ReactNode }) {
  const [openUserId, setOpenUserId] = useState<string | null>(null);

  const openProfile = useCallback((userId: string) => {
    setOpenUserId(userId);
  }, []);

  const closeProfile = useCallback(() => {
    setOpenUserId(null);
  }, []);

  return (
    <UserProfileContext.Provider value={{ openProfile, closeProfile }}>
      {children}
      {openUserId && (
        <UserProfileModal userId={openUserId} onClose={closeProfile} />
      )}
    </UserProfileContext.Provider>
  );
}

export function useUserProfile() {
  const ctx = useContext(UserProfileContext);
  // Non-breaking fallback: if no provider is mounted, silently no-op so that
  // components using UserAvatar still render (just without the click-to-open
  // behavior).
  if (!ctx) {
    return {
      openProfile: () => {},
      closeProfile: () => {},
    };
  }
  return ctx;
}
