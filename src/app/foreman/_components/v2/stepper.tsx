"use client";

import { Check } from "lucide-react";

interface StepperProps {
  steps: string[];
  /** 1-based index of the current step. */
  current: number;
  /** Optional combined label (for design hint line). */
  hint?: string;
}

export function Stepper({ steps, current, hint }: StepperProps) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 border border-slate-200">
      <ol className="flex items-center" role="list">
        {steps.map((label, i) => {
          const stepNum = i + 1;
          const isDone = stepNum < current;
          const isActive = stepNum === current;
          const isLast = i === steps.length - 1;

          return (
            <li key={label} className="flex items-center flex-1 last:flex-none">
              <span
                className={[
                  "flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-extrabold shrink-0",
                  isDone
                    ? "bg-emerald-600 text-white"
                    : isActive
                      ? "bg-indigo-600 text-white"
                      : "bg-white text-slate-400 border-2 border-slate-300",
                ].join(" ")}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Крок ${stepNum}: ${label}`}
              >
                {isDone ? <Check size={11} strokeWidth={3} /> : stepNum}
              </span>

              {!isLast && (
                <span
                  className={`flex-1 h-[2px] mx-1.5 rounded-full ${
                    isDone ? "bg-emerald-600" : "bg-slate-200"
                  }`}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>

      {hint && <div className="mt-2 text-[11px] font-medium text-slate-500">{hint}</div>}
    </div>
  );
}
