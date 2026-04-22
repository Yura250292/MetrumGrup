"use client";

import { useEffect, useState } from "react";

export type SavedView<S> = {
  id: string;
  name: string;
  state: S;
  createdAt: string;
};

type Bag<S> = SavedView<S>[];

function storageKey(pageKey: string) {
  return `admin-v2:savedViews:${pageKey}`;
}

function readBag<S>(pageKey: string): Bag<S> {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(pageKey));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Bag<S>;
  } catch {
    return [];
  }
}

function writeBag<S>(pageKey: string, bag: Bag<S>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey(pageKey), JSON.stringify(bag));
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function useSavedViews<S>(pageKey: string) {
  const [views, setViews] = useState<Bag<S>>([]);

  useEffect(() => {
    setViews(readBag<S>(pageKey));
  }, [pageKey]);

  const save = (name: string, state: S): SavedView<S> => {
    const view: SavedView<S> = {
      id: generateId(),
      name,
      state,
      createdAt: new Date().toISOString(),
    };
    const next = [view, ...views];
    setViews(next);
    writeBag(pageKey, next);
    return view;
  };

  const remove = (id: string) => {
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    writeBag(pageKey, next);
  };

  const rename = (id: string, name: string) => {
    const next = views.map((v) => (v.id === id ? { ...v, name } : v));
    setViews(next);
    writeBag(pageKey, next);
  };

  return { views, save, remove, rename };
}
