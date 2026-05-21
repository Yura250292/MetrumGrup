"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import type { Room, Side } from "@/lib/foreman/geometry";
import {
  overlapsExisting,
  parentEdgeLength,
  placeAdjacent,
} from "@/lib/foreman/geometry";
import type { Surface, WorkType } from "@/lib/foreman/material-presets";
import type { EstimatorState, Opening, Step } from "./_types";
import { clearDraft, loadDraft, saveDraft } from "./_draft-storage";
import { PlanCanvas } from "./_plan-canvas";
import { RoomSheet, type RoomSheetMode } from "./_room-sheet";
import { OpeningSheet } from "./_opening-sheet";
import { WorksPicker } from "./_works-picker";
import { Results } from "./_results";

const DEFAULT_CEILING = 2.7;

const initialState: EstimatorState = {
  plan: { defaultCeilingHeight: DEFAULT_CEILING, rooms: [], openings: [] },
  works: { rooms: {}, tileSizes: {}, thicknessCm: {} },
  prices: { unitPrices: {} },
  step: "plan",
};

type Action =
  | { type: "HYDRATE"; payload: Partial<EstimatorState> }
  | { type: "RESET" }
  | { type: "SET_STEP"; step: Step }
  | { type: "SET_DEFAULT_CEILING"; value: number }
  | { type: "ADD_ROOM"; room: Room }
  | { type: "UPDATE_ROOM"; id: string; patch: Partial<Room> }
  | { type: "REMOVE_ROOM"; id: string }
  | { type: "ADD_OPENING"; opening: Opening }
  | { type: "UPDATE_OPENING"; id: string; patch: Partial<Opening> }
  | { type: "REMOVE_OPENING"; id: string }
  | {
      type: "TOGGLE_WORKTYPE";
      roomId: string;
      surface: Surface;
      workType: WorkType;
    }
  | {
      type: "SET_TILE_SIZE";
      roomId: string;
      surface: Surface;
      w: number;
      h: number;
    }
  | { type: "SET_THICKNESS"; roomId: string; workType: WorkType; cm: number }
  | { type: "SET_UNIT_PRICE"; roomId: string; presetId: string; value: number };

function reducer(state: EstimatorState, action: Action): EstimatorState {
  switch (action.type) {
    case "HYDRATE": {
      const p = action.payload;
      return {
        plan: {
          defaultCeilingHeight: p.plan?.defaultCeilingHeight ?? state.plan.defaultCeilingHeight,
          rooms: p.plan?.rooms ?? state.plan.rooms,
          openings: p.plan?.openings ?? [],
        },
        works: p.works ?? state.works,
        prices: p.prices ?? state.prices,
        step: state.step,
      };
    }
    case "RESET":
      return { ...initialState };
    case "SET_STEP":
      return { ...state, step: action.step };
    case "SET_DEFAULT_CEILING":
      return { ...state, plan: { ...state.plan, defaultCeilingHeight: action.value } };
    case "ADD_ROOM":
      return { ...state, plan: { ...state.plan, rooms: [...state.plan.rooms, action.room] } };
    case "UPDATE_ROOM":
      return {
        ...state,
        plan: {
          ...state.plan,
          rooms: state.plan.rooms.map((r) =>
            r.id === action.id ? { ...r, ...action.patch } : r,
          ),
        },
      };
    case "REMOVE_ROOM": {
      const rooms = state.plan.rooms.filter((r) => r.id !== action.id);
      const openings = state.plan.openings.filter((o) => o.roomId !== action.id);
      const w = { ...state.works.rooms };
      delete w[action.id];
      const tileSizes = { ...state.works.tileSizes };
      const thicknessCm = { ...state.works.thicknessCm };
      for (const key of Object.keys(tileSizes)) {
        if (key.startsWith(`${action.id}:`)) delete tileSizes[key];
      }
      for (const key of Object.keys(thicknessCm)) {
        if (key.startsWith(`${action.id}:`)) delete thicknessCm[key];
      }
      const unitPrices = { ...state.prices.unitPrices };
      for (const key of Object.keys(unitPrices)) {
        if (key.startsWith(`${action.id}:`)) delete unitPrices[key];
      }
      return {
        ...state,
        plan: { ...state.plan, rooms, openings },
        works: { rooms: w, tileSizes, thicknessCm },
        prices: { unitPrices },
      };
    }
    case "ADD_OPENING":
      return {
        ...state,
        plan: { ...state.plan, openings: [...state.plan.openings, action.opening] },
      };
    case "UPDATE_OPENING":
      return {
        ...state,
        plan: {
          ...state.plan,
          openings: state.plan.openings.map((o) =>
            o.id === action.id ? { ...o, ...action.patch } : o,
          ),
        },
      };
    case "REMOVE_OPENING":
      return {
        ...state,
        plan: { ...state.plan, openings: state.plan.openings.filter((o) => o.id !== action.id) },
      };
    case "TOGGLE_WORKTYPE": {
      const { roomId, surface, workType } = action;
      const roomCfg = state.works.rooms[roomId] ?? {};
      const current = roomCfg[surface] ?? [];
      const next = current.includes(workType)
        ? current.filter((w) => w !== workType)
        : [...current, workType];
      return {
        ...state,
        works: {
          ...state.works,
          rooms: { ...state.works.rooms, [roomId]: { ...roomCfg, [surface]: next } },
        },
      };
    }
    case "SET_TILE_SIZE":
      return {
        ...state,
        works: {
          ...state.works,
          tileSizes: {
            ...state.works.tileSizes,
            [`${action.roomId}:${action.surface}`]: { w: action.w, h: action.h },
          },
        },
      };
    case "SET_THICKNESS":
      return {
        ...state,
        works: {
          ...state.works,
          thicknessCm: {
            ...state.works.thicknessCm,
            [`${action.roomId}:${action.workType}`]: action.cm,
          },
        },
      };
    case "SET_UNIT_PRICE":
      return {
        ...state,
        prices: {
          unitPrices: {
            ...state.prices.unitPrices,
            [`${action.roomId}:${action.presetId}`]: action.value,
          },
        },
      };
    default:
      return state;
  }
}

interface Props {
  firmId: string | null;
}

type SheetState =
  | null
  | {
      kind: "room";
      mode: RoomSheetMode;
      parentId?: string;
      side?: Side;
      parentEdgeLen?: number;
      room?: Room;
    }
  | {
      kind: "opening";
      mode: "add" | "edit";
      roomId: string;
      opening?: Opening;
      prefill?: { side: Side; offset: number };
    };

function newId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function Estimator({ firmId }: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const hydratedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const draft = loadDraft();
    if (draft) dispatch({ type: "HYDRATE", payload: draft });
    hydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveDraft(state), 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [state]);

  useEffect(() => {
    if (!warning) return;
    const t = setTimeout(() => setWarning(null), 3500);
    return () => clearTimeout(t);
  }, [warning]);

  const handleAddFirst = (
    length: number,
    width: number,
    name: string,
    height: number,
  ) => {
    const room: Room = {
      id: newId(),
      name,
      x: 0,
      y: 0,
      w: length,
      h: width,
      ceilingHeight: height,
    };
    dispatch({ type: "ADD_ROOM", room });
  };

  const handleAttach = (
    parentId: string,
    side: Side,
    length: number,
    depth: number,
    name: string,
    height: number,
    offset: number,
  ) => {
    const parent = state.plan.rooms.find((r) => r.id === parentId);
    if (!parent) return;
    const rect = placeAdjacent(parent, side, length, depth, offset);
    const candidate: Room = {
      id: newId(),
      name,
      ceilingHeight: height,
      ...rect,
    };
    const collided = overlapsExisting(
      rect,
      state.plan.rooms.filter((r) => r.id !== parent.id),
    );
    if (collided) {
      setWarning(`Накладання з кімнатою «${collided.name}». Перевірте розміри.`);
    }
    dispatch({ type: "ADD_ROOM", room: candidate });
  };

  const goNext: Step | null =
    state.step === "plan" ? "works" : state.step === "works" ? "result" : null;
  const goPrev: Step | null =
    state.step === "result" ? "works" : state.step === "works" ? "plan" : null;

  const canAdvance = state.plan.rooms.length > 0;
  const hasAnyWorks = useMemo(
    () =>
      Object.values(state.works.rooms).some((surfaces) =>
        Object.values(surfaces ?? {}).some((wts) => (wts ?? []).length > 0),
      ),
    [state.works.rooms],
  );

  const editingRoom =
    sheet?.kind === "room" && sheet.mode === "edit" ? sheet.room : undefined;
  const editingRoomOpenings = useMemo(
    () =>
      editingRoom
        ? state.plan.openings.filter((o) => o.roomId === editingRoom.id)
        : [],
    [editingRoom, state.plan.openings],
  );

  return (
    <div className="space-y-4 pb-8">
      <StepHeader step={state.step} />

      <AnimatePresence mode="wait">
        {state.step === "plan" && (
          <motion.div
            key="plan"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="space-y-4"
          >
            <PlanCanvas
              plan={state.plan}
              onChangeDefaultCeiling={(v) => dispatch({ type: "SET_DEFAULT_CEILING", value: v })}
              onAddFirst={handleAddFirst}
              onPlusClick={(parentId, side) => {
                const parent = state.plan.rooms.find((r) => r.id === parentId);
                setSheet({
                  kind: "room",
                  mode: "add",
                  parentId,
                  side,
                  parentEdgeLen: parent ? parentEdgeLength(parent, side) : undefined,
                });
              }}
              onRoomTap={(room) => setSheet({ kind: "room", mode: "edit", room })}
              onWallTap={(roomId, side, rawOffset) => {
                const room = state.plan.rooms.find((r) => r.id === roomId);
                if (!room) return;
                // дефолт ширина дверей; центруємо отвір навколо точки тапу
                const defaultWidth = 0.9;
                const edgeLen = side === "N" || side === "S" ? room.w : room.h;
                const centered = rawOffset - defaultWidth / 2;
                const clamped = Math.max(
                  0,
                  Math.min(centered, Math.max(0, edgeLen - defaultWidth)),
                );
                setSheet({
                  kind: "opening",
                  mode: "add",
                  roomId,
                  prefill: { side, offset: clamped },
                });
              }}
            />
          </motion.div>
        )}

        {state.step === "works" && (
          <motion.div
            key="works"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <WorksPicker
              plan={state.plan}
              works={state.works}
              onToggle={(roomId, surface, workType) =>
                dispatch({ type: "TOGGLE_WORKTYPE", roomId, surface, workType })
              }
              onSetTileSize={(roomId, surface, w, h) =>
                dispatch({ type: "SET_TILE_SIZE", roomId, surface, w, h })
              }
              onSetThickness={(roomId, workType, cm) =>
                dispatch({ type: "SET_THICKNESS", roomId, workType, cm })
              }
            />
          </motion.div>
        )}

        {state.step === "result" && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <Results
              plan={state.plan}
              works={state.works}
              prices={state.prices}
              firmId={firmId}
              onSetPrice={(roomId, presetId, value) =>
                dispatch({ type: "SET_UNIT_PRICE", roomId, presetId, value })
              }
              onReset={() => {
                clearDraft();
                dispatch({ type: "RESET" });
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2">
        {goPrev && (
          <button
            type="button"
            onClick={() => dispatch({ type: "SET_STEP", step: goPrev })}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-sm text-zinc-200 active:scale-95 transition"
          >
            <ArrowLeft size={16} />
            Назад
          </button>
        )}
        {goNext && (
          <button
            type="button"
            disabled={
              state.step === "plan"
                ? !canAdvance
                : state.step === "works"
                  ? !hasAnyWorks
                  : false
            }
            onClick={() => dispatch({ type: "SET_STEP", step: goNext })}
            className="flex-1 flex items-center justify-center gap-2 min-h-[48px] px-4 rounded-xl bg-violet-500/15 border border-violet-500/40 text-violet-200 text-sm font-semibold active:scale-95 transition disabled:opacity-40 disabled:active:scale-100"
          >
            {state.step === "plan" ? "Вибрати види робіт" : "Розрахувати"}
            <ArrowRight size={16} />
          </button>
        )}
        {state.step === "plan" && state.plan.rooms.length > 0 && (
          <button
            type="button"
            onClick={() => {
              clearDraft();
              dispatch({ type: "RESET" });
            }}
            className="flex items-center justify-center w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 active:scale-95 transition"
            aria-label="Скинути план"
            title="Скинути план"
          >
            <RotateCcw size={16} />
          </button>
        )}
      </div>

      {sheet?.kind === "room" && (
        <RoomSheet
          mode={sheet.mode}
          parentSide={sheet.side}
          parentEdgeLen={sheet.parentEdgeLen}
          defaultHeight={state.plan.defaultCeilingHeight}
          room={sheet.room}
          openings={editingRoomOpenings}
          onClose={() => setSheet(null)}
          onConfirm={(values) => {
            if (sheet.mode === "add" && sheet.parentId && sheet.side) {
              handleAttach(
                sheet.parentId,
                sheet.side,
                values.length,
                values.width,
                values.name,
                values.height,
                values.offset,
              );
              setSheet(null);
            } else if (sheet.mode === "edit" && sheet.room) {
              dispatch({
                type: "UPDATE_ROOM",
                id: sheet.room.id,
                patch: { name: values.name, ceilingHeight: values.height },
              });
              setSheet(null);
            }
          }}
          onDelete={
            sheet.mode === "edit" && sheet.room
              ? () => {
                  dispatch({ type: "REMOVE_ROOM", id: sheet.room!.id });
                  setSheet(null);
                }
              : undefined
          }
          onAddOpening={
            sheet.mode === "edit" && sheet.room
              ? () => setSheet({ kind: "opening", mode: "add", roomId: sheet.room!.id })
              : undefined
          }
          onEditOpening={
            sheet.mode === "edit" && sheet.room
              ? (o) => setSheet({ kind: "opening", mode: "edit", roomId: sheet.room!.id, opening: o })
              : undefined
          }
        />
      )}

      {sheet?.kind === "opening" && (() => {
        const room = state.plan.rooms.find((r) => r.id === sheet.roomId);
        if (!room) return null;
        return (
          <OpeningSheet
            mode={sheet.mode}
            roomId={room.id}
            edgeLengths={{ N: room.w, S: room.w, E: room.h, W: room.h }}
            ceilingHeight={room.ceilingHeight}
            existing={sheet.opening}
            roomOpenings={state.plan.openings.filter((o) => o.roomId === room.id)}
            prefill={sheet.prefill}
            onClose={() => {
              // Якщо це додавання прорізу прямо з канви — повертаємо у канву,
              // не в room sheet. Інакше — у room sheet.
              if (sheet.prefill) {
                setSheet(null);
              } else {
                setSheet({ kind: "room", mode: "edit", room });
              }
            }}
            onConfirm={(op) => {
              if (sheet.mode === "edit" && sheet.opening) {
                dispatch({
                  type: "UPDATE_OPENING",
                  id: sheet.opening.id,
                  patch: { ...op, roomId: room.id },
                });
              } else {
                dispatch({
                  type: "ADD_OPENING",
                  opening: { id: newId(), ...op, roomId: room.id },
                });
              }
              // Якщо це був вхід прямо з канви — закриваємо повністю,
              // інакше повертаємось у room sheet щоб бачити список.
              if (sheet.prefill) setSheet(null);
              else setSheet({ kind: "room", mode: "edit", room });
            }}
            onDelete={
              sheet.mode === "edit" && sheet.opening
                ? () => {
                    dispatch({ type: "REMOVE_OPENING", id: sheet.opening!.id });
                    setSheet({ kind: "room", mode: "edit", room });
                  }
                : undefined
            }
          />
        );
      })()}

      <AnimatePresence>
        {warning && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed left-4 right-4 bottom-6 z-50 max-w-md mx-auto rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-100 text-sm px-4 py-3 shadow-lg backdrop-blur-xl"
            role="alert"
          >
            {warning}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StepHeader({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "plan", label: "План" },
    { id: "works", label: "Роботи" },
    { id: "result", label: "Кошторис" },
  ];
  const activeIdx = steps.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-1.5">
      {steps.map((s, i) => (
        <div
          key={s.id}
          className={`flex-1 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-center transition ${
            i <= activeIdx
              ? "bg-violet-500/20 border border-violet-500/40 text-violet-200"
              : "bg-white/[0.03] border border-white/10 text-zinc-500"
          }`}
        >
          {i + 1}. {s.label}
        </div>
      ))}
    </div>
  );
}
