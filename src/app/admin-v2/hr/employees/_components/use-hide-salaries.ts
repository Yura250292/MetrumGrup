"use client";

import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "hr.hideSalaries";
const EVENT_NAME = "hr:hide-salaries-changed";

function read(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(STORAGE_KEY) === "1";
}

/**
 * Локальний UI-перемикач "приховати зарплати" для опенспейсу.
 * Дозволяє SUPER_ADMIN сховати ЗП на власному екрані, поки поруч стоять
 * стажери/інші співробітники. Не впливає на права — лише на рендер.
 */
export function useHideSalaries(): [boolean, (next: boolean) => void] {
  const [hidden, setHidden] = useState<boolean>(false);

  useEffect(() => {
    setHidden(read());
    function onChange() {
      setHidden(read());
    }
    window.addEventListener(EVENT_NAME, onChange);
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener(EVENT_NAME, onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  const set = useCallback((next: boolean) => {
    if (typeof window === "undefined") return;
    if (next) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
    setHidden(next);
    window.dispatchEvent(new Event(EVENT_NAME));
  }, []);

  return [hidden, set];
}
