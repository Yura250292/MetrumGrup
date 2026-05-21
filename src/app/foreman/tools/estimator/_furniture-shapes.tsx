"use client";

/**
 * Архітектурні SVG-форми меблів та техніки. Кожен компонент малює деталізовану
 * стилізацію (подушки на ліжку, конфорки на плиті, дверцята на холодильнику,
 * сидіння стільців біля столу), щоб план виглядав як справжнє архітектурне
 * креслення, а не як набір кольорових прямокутників.
 *
 * Координати — у світових метрах. Усі лінії використовують vectorEffect
 * non-scaling-stroke, тож товщина однакова на будь-якому зумі.
 */

import type { FurnitureItem } from "./_types";

const STROKE = "rgba(229,231,235,0.85)";       // основний контур (zinc-200 з alpha)
const STROKE_THIN = "rgba(229,231,235,0.55)";   // деталі
const FILL_LIGHT = "rgba(255,255,255,0.04)";    // мінімальна заливка тіла
const FILL_ACCENT = "rgba(139,92,246,0.10)";    // акцент для важливих предметів

const SW_MAIN = 1.6;   // px (non-scaling stroke)
const SW_DETAIL = 0.9; // px

interface ShapeProps {
  item: FurnitureItem;
  /** World offset (room.x + item.x). */
  wx: number;
  wy: number;
}

function rotateAttr(item: FurnitureItem, wx: number, wy: number): string {
  const cx = wx + item.w / 2;
  const cy = wy + item.h / 2;
  return `rotate(${item.rotation} ${cx} ${cy})`;
}

/** Універсальна обгортка з ротацією + лейбл під предметом. */
function ShapeWrap({
  item,
  wx,
  wy,
  children,
  showLabel = true,
}: {
  item: FurnitureItem;
  wx: number;
  wy: number;
  children: React.ReactNode;
  showLabel?: boolean;
}) {
  const minDim = Math.min(item.w, item.h);
  const labelFs = Math.max(0.13, minDim * 0.18);
  const cx = wx + item.w / 2;
  return (
    <g transform={rotateAttr(item, wx, wy)}>
      {children}
      {showLabel && minDim >= 0.4 && item.label.length > 0 && (
        <text
          x={cx}
          y={wy + item.h + labelFs * 1.05}
          textAnchor="middle"
          fontSize={labelFs}
          fill="#a1a1aa"
          fontWeight={500}
          pointerEvents="none"
        >
          {item.label}
        </text>
      )}
    </g>
  );
}

// ─────────────────────────────────────────────────────────────
// Окремі шейпи на типи
// ─────────────────────────────────────────────────────────────

function BedShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  // Подушки: 2 малі прямокутники у верхній частині (по вузькому боку)
  const isVertical = h >= w;
  const pillowSize = Math.min(w, h) * 0.25;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      {/* Каркас ліжка */}
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_ACCENT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.05}
      />
      {/* Зона матраца */}
      <rect
        x={wx + 0.08}
        y={wy + (isVertical ? pillowSize + 0.16 : 0.08)}
        width={w - 0.16}
        height={h - (isVertical ? pillowSize + 0.24 : 0.16)}
        fill="transparent"
        stroke={STROKE_THIN}
        strokeWidth={SW_DETAIL}
        vectorEffect="non-scaling-stroke"
        rx={0.04}
      />
      {/* Подушки */}
      {isVertical ? (
        <>
          <rect
            x={wx + w * 0.12}
            y={wy + 0.08}
            width={w * 0.36}
            height={pillowSize}
            fill="transparent"
            stroke={STROKE_THIN}
            strokeWidth={SW_DETAIL}
            vectorEffect="non-scaling-stroke"
            rx={0.04}
          />
          <rect
            x={wx + w * 0.52}
            y={wy + 0.08}
            width={w * 0.36}
            height={pillowSize}
            fill="transparent"
            stroke={STROKE_THIN}
            strokeWidth={SW_DETAIL}
            vectorEffect="non-scaling-stroke"
            rx={0.04}
          />
        </>
      ) : (
        <>
          <rect
            x={wx + 0.08}
            y={wy + h * 0.12}
            width={pillowSize}
            height={h * 0.36}
            fill="transparent"
            stroke={STROKE_THIN}
            strokeWidth={SW_DETAIL}
            vectorEffect="non-scaling-stroke"
            rx={0.04}
          />
          <rect
            x={wx + 0.08}
            y={wy + h * 0.52}
            width={pillowSize}
            height={h * 0.36}
            fill="transparent"
            stroke={STROKE_THIN}
            strokeWidth={SW_DETAIL}
            vectorEffect="non-scaling-stroke"
            rx={0.04}
          />
        </>
      )}
    </ShapeWrap>
  );
}

function SofaShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  const armDepth = Math.min(w, h) * 0.2;
  const cushionCount = Math.max(2, Math.floor(w / 0.8));
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      {/* Backrest (тонкий блок зверху) */}
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h * 0.3}
        fill={FILL_ACCENT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.05}
      />
      {/* Сидіння */}
      <rect
        x={wx + armDepth}
        y={wy + h * 0.3}
        width={w - 2 * armDepth}
        height={h * 0.7}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.05}
      />
      {/* Підлокітники */}
      <rect
        x={wx}
        y={wy + h * 0.3}
        width={armDepth}
        height={h * 0.7}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.04}
      />
      <rect
        x={wx + w - armDepth}
        y={wy + h * 0.3}
        width={armDepth}
        height={h * 0.7}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.04}
      />
      {/* Лінії-роздільники подушок */}
      {Array.from({ length: cushionCount - 1 }).map((_, i) => {
        const x = wx + armDepth + ((w - 2 * armDepth) / cushionCount) * (i + 1);
        return (
          <line
            key={i}
            x1={x}
            y1={wy + h * 0.32}
            x2={x}
            y2={wy + h - 0.04}
            stroke={STROKE_THIN}
            strokeWidth={SW_DETAIL}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </ShapeWrap>
  );
}

function ArmchairShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  const armDepth = Math.min(w, h) * 0.18;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h * 0.3}
        fill={FILL_ACCENT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.04}
      />
      <rect
        x={wx + armDepth}
        y={wy + h * 0.3}
        width={w - 2 * armDepth}
        height={h * 0.7}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.04}
      />
      <rect
        x={wx}
        y={wy + h * 0.3}
        width={armDepth}
        height={h * 0.7}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={wx + w - armDepth}
        y={wy + h * 0.3}
        width={armDepth}
        height={h * 0.7}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
      />
    </ShapeWrap>
  );
}

function TableShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  // якщо стіл достатньо великий — додаємо стільці навколо
  const chairR = 0.18;
  const placeChairs = w >= 1.0 && h >= 0.7;
  const chairs: { cx: number; cy: number }[] = [];
  if (placeChairs) {
    const longSide = Math.max(w, h);
    const chairsLong = Math.max(2, Math.floor(longSide / 0.55));
    if (w >= h) {
      // довгий по X — стільці зверху і знизу
      for (let i = 0; i < chairsLong; i++) {
        const cx = wx + (w / (chairsLong + 1)) * (i + 1);
        chairs.push({ cx, cy: wy - chairR - 0.05 });
        chairs.push({ cx, cy: wy + h + chairR + 0.05 });
      }
      // плюс по 1 з боків якщо широкий
      if (h >= 0.85) {
        chairs.push({ cx: wx - chairR - 0.05, cy: wy + h / 2 });
        chairs.push({ cx: wx + w + chairR + 0.05, cy: wy + h / 2 });
      }
    } else {
      for (let i = 0; i < chairsLong; i++) {
        const cy = wy + (h / (chairsLong + 1)) * (i + 1);
        chairs.push({ cx: wx - chairR - 0.05, cy });
        chairs.push({ cx: wx + w + chairR + 0.05, cy });
      }
    }
  }
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_ACCENT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.06}
      />
      {chairs.map((c, i) => (
        <circle
          key={i}
          cx={c.cx}
          cy={c.cy}
          r={chairR}
          fill={FILL_LIGHT}
          stroke={STROKE_THIN}
          strokeWidth={SW_DETAIL}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </ShapeWrap>
  );
}

function ChairShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  const cx = wx + w / 2;
  const cy = wy + h / 2;
  const r = Math.min(w, h) / 2;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy} showLabel={false}>
      <circle
        cx={cx}
        cy={cy}
        r={r * 0.9}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={cx - r * 0.5}
        y1={wy + 0.04}
        x2={cx + r * 0.5}
        y2={wy + 0.04}
        stroke={STROKE_THIN}
        strokeWidth={SW_DETAIL * 1.4}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </ShapeWrap>
  );
}

function FridgeShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.03}
      />
      {/* Лінія розділу: freezer/fridge */}
      <line
        x1={wx + 0.04}
        y1={wy + h * 0.35}
        x2={wx + w - 0.04}
        y2={wy + h * 0.35}
        stroke={STROKE_THIN}
        strokeWidth={SW_DETAIL}
        vectorEffect="non-scaling-stroke"
      />
      {/* Ручка */}
      <line
        x1={wx + w - 0.08}
        y1={wy + h * 0.5}
        x2={wx + w - 0.08}
        y2={wy + h * 0.85}
        stroke={STROKE}
        strokeWidth={SW_MAIN * 1.4}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </ShapeWrap>
  );
}

function StoveShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  const burnerR = Math.min(w, h) * 0.18;
  const cx = wx + w / 2;
  const cy = wy + h / 2;
  const dx = w * 0.22;
  const dy = h * 0.22;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.03}
      />
      {/* 4 конфорки */}
      <circle cx={cx - dx} cy={cy - dy} r={burnerR} fill="transparent" stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />
      <circle cx={cx + dx} cy={cy - dy} r={burnerR} fill="transparent" stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />
      <circle cx={cx - dx} cy={cy + dy} r={burnerR * 0.75} fill="transparent" stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />
      <circle cx={cx + dx} cy={cy + dy} r={burnerR * 0.75} fill="transparent" stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />
    </ShapeWrap>
  );
}

function OvenShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
      />
      {/* Дверцята: рамка всередині */}
      <rect
        x={wx + 0.05}
        y={wy + 0.05}
        width={w - 0.1}
        height={h - 0.1}
        fill="transparent"
        stroke={STROKE_THIN}
        strokeWidth={SW_DETAIL}
        vectorEffect="non-scaling-stroke"
        rx={0.02}
      />
      {/* Ручка */}
      <line
        x1={wx + 0.1}
        y1={wy + 0.12}
        x2={wx + w - 0.1}
        y2={wy + 0.12}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        strokeLinecap="round"
      />
    </ShapeWrap>
  );
}

function SinkShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.04}
      />
      {/* Чаша мийки */}
      <rect
        x={wx + 0.08}
        y={wy + h * 0.25}
        width={w - 0.16}
        height={h * 0.65}
        fill="transparent"
        stroke={STROKE_THIN}
        strokeWidth={SW_DETAIL}
        vectorEffect="non-scaling-stroke"
        rx={0.04}
      />
      {/* Кран */}
      <circle
        cx={wx + w / 2}
        cy={wy + h * 0.15}
        r={Math.min(w, h) * 0.08}
        fill={STROKE_THIN}
        stroke={STROKE}
        strokeWidth={SW_DETAIL}
        vectorEffect="non-scaling-stroke"
      />
    </ShapeWrap>
  );
}

function ToiletShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  // tank — менший прямокутник зверху, чаша — овал нижче
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      {/* Бачок */}
      <rect
        x={wx + w * 0.1}
        y={wy}
        width={w * 0.8}
        height={h * 0.35}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.03}
      />
      {/* Чаша */}
      <ellipse
        cx={wx + w / 2}
        cy={wy + h * 0.68}
        rx={w * 0.45}
        ry={h * 0.3}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
      />
    </ShapeWrap>
  );
}

function BathtubShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={Math.min(w, h) * 0.25}
      />
      {/* Внутрішня ванна */}
      <rect
        x={wx + 0.08}
        y={wy + 0.08}
        width={w - 0.16}
        height={h - 0.16}
        fill="transparent"
        stroke={STROKE_THIN}
        strokeWidth={SW_DETAIL}
        vectorEffect="non-scaling-stroke"
        rx={Math.min(w, h) * 0.2}
      />
      {/* Зливний отвір */}
      <circle
        cx={wx + (w > h ? w - 0.2 : w / 2)}
        cy={wy + (w > h ? h / 2 : h - 0.2)}
        r={Math.min(w, h) * 0.05}
        fill="transparent"
        stroke={STROKE_THIN}
        strokeWidth={SW_DETAIL}
        vectorEffect="non-scaling-stroke"
      />
    </ShapeWrap>
  );
}

function ShowerShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  const cx = wx + w / 2;
  const cy = wy + h / 2;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.04}
      />
      {/* Дві діагоналі (символ душу) */}
      <line x1={wx + 0.04} y1={wy + 0.04} x2={wx + w - 0.04} y2={wy + h - 0.04} stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />
      <line x1={wx + w - 0.04} y1={wy + 0.04} x2={wx + 0.04} y2={wy + h - 0.04} stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />
      {/* Лійка душу — крапка в центрі */}
      <circle cx={cx} cy={cy} r={Math.min(w, h) * 0.1} fill={STROKE_THIN} vectorEffect="non-scaling-stroke" />
    </ShapeWrap>
  );
}

function WardrobeShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  // Кілька дверцят (вертикальні розділи) — у напрямку довшого боку
  const isHorizontal = w >= h;
  const longSide = isHorizontal ? w : h;
  const doors = Math.max(2, Math.round(longSide / 0.6));
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.03}
      />
      {Array.from({ length: doors - 1 }).map((_, i) => {
        if (isHorizontal) {
          const x = wx + ((w / doors) * (i + 1));
          return (
            <line
              key={i}
              x1={x}
              y1={wy + 0.04}
              x2={x}
              y2={wy + h - 0.04}
              stroke={STROKE_THIN}
              strokeWidth={SW_DETAIL}
              vectorEffect="non-scaling-stroke"
            />
          );
        }
        const y = wy + ((h / doors) * (i + 1));
        return (
          <line
            key={i}
            x1={wx + 0.04}
            y1={y}
            x2={wx + w - 0.04}
            y2={y}
            stroke={STROKE_THIN}
            strokeWidth={SW_DETAIL}
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </ShapeWrap>
  );
}

function TVShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill="rgba(99,102,241,0.18)"
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.03}
      />
      <rect
        x={wx + 0.04}
        y={wy + 0.04}
        width={w - 0.08}
        height={h - 0.08}
        fill="transparent"
        stroke={STROKE_THIN}
        strokeWidth={SW_DETAIL}
        vectorEffect="non-scaling-stroke"
      />
    </ShapeWrap>
  );
}

function DeskShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.04}
      />
      {/* стілець перед столом */}
      {h >= 0.5 && (
        <circle
          cx={wx + w / 2}
          cy={wy + h + 0.3}
          r={0.22}
          fill={FILL_LIGHT}
          stroke={STROKE_THIN}
          strokeWidth={SW_DETAIL}
          vectorEffect="non-scaling-stroke"
        />
      )}
    </ShapeWrap>
  );
}

function ShelfShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  const isHorizontal = w >= h;
  const shelves = Math.max(2, Math.round((isHorizontal ? w : h) / 0.4));
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.02}
      />
      {Array.from({ length: shelves - 1 }).map((_, i) => {
        if (isHorizontal) {
          const x = wx + ((w / shelves) * (i + 1));
          return <line key={i} x1={x} y1={wy + 0.03} x2={x} y2={wy + h - 0.03} stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />;
        }
        const y = wy + ((h / shelves) * (i + 1));
        return <line key={i} x1={wx + 0.03} y1={y} x2={wx + w - 0.03} y2={y} stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />;
      })}
    </ShapeWrap>
  );
}

function KitchenCabinetShape({ item, wx, wy }: ShapeProps) {
  return WardrobeShape({ item, wx, wy });
}

function WasherShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  const cx = wx + w / 2;
  const cy = wy + h / 2;
  const r = Math.min(w, h) * 0.32;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.03}
      />
      {/* Люк */}
      <circle cx={cx} cy={cy} r={r} fill="transparent" stroke={STROKE} strokeWidth={SW_MAIN} vectorEffect="non-scaling-stroke" />
      <circle cx={cx} cy={cy} r={r * 0.7} fill="transparent" stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />
    </ShapeWrap>
  );
}

function DishwasherShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.03}
      />
      {/* верхня панель */}
      <line x1={wx} y1={wy + h * 0.18} x2={wx + w} y2={wy + h * 0.18} stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />
      {/* ручка */}
      <line x1={wx + w * 0.25} y1={wy + h * 0.10} x2={wx + w * 0.75} y2={wy + h * 0.10} stroke={STROKE} strokeWidth={SW_MAIN} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </ShapeWrap>
  );
}

function PlantShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  const cx = wx + w / 2;
  const cy = wy + h / 2;
  const r = Math.min(w, h) / 2;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      {/* Горщик */}
      <rect
        x={cx - r * 0.4}
        y={wy + h - r * 0.4}
        width={r * 0.8}
        height={r * 0.4}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_DETAIL}
        vectorEffect="non-scaling-stroke"
      />
      {/* Листя — кілька кіл */}
      <circle cx={cx} cy={cy - r * 0.2} r={r * 0.55} fill="rgba(34,197,94,0.18)" stroke={STROKE} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />
      <circle cx={cx - r * 0.3} cy={cy - r * 0.05} r={r * 0.35} fill="transparent" stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />
      <circle cx={cx + r * 0.3} cy={cy - r * 0.05} r={r * 0.35} fill="transparent" stroke={STROKE_THIN} strokeWidth={SW_DETAIL} vectorEffect="non-scaling-stroke" />
    </ShapeWrap>
  );
}

function RugShape({ item, wx, wy }: ShapeProps) {
  const { w, h } = item;
  return (
    <ShapeWrap item={item} wx={wx} wy={wy} showLabel={false}>
      <rect
        x={wx}
        y={wy}
        width={w}
        height={h}
        fill="rgba(168,85,247,0.10)"
        stroke={STROKE_THIN}
        strokeWidth={SW_DETAIL}
        strokeDasharray="0.15 0.10"
        vectorEffect="non-scaling-stroke"
        rx={0.05}
      />
    </ShapeWrap>
  );
}

function DefaultShape({ item, wx, wy }: ShapeProps) {
  return (
    <ShapeWrap item={item} wx={wx} wy={wy}>
      <rect
        x={wx}
        y={wy}
        width={item.w}
        height={item.h}
        fill={FILL_LIGHT}
        stroke={STROKE}
        strokeWidth={SW_MAIN}
        vectorEffect="non-scaling-stroke"
        rx={0.04}
      />
    </ShapeWrap>
  );
}

// ─────────────────────────────────────────────────────────────
// Dispatch
// ─────────────────────────────────────────────────────────────

interface FurnitureShapeProps {
  item: FurnitureItem;
  wx: number;
  wy: number;
  onClick?: () => void;
}

export function FurnitureShape({ item, wx, wy, onClick }: FurnitureShapeProps) {
  let inner: React.ReactNode;
  switch (item.type) {
    case "bed":
      inner = <BedShape item={item} wx={wx} wy={wy} />;
      break;
    case "sofa":
      inner = <SofaShape item={item} wx={wx} wy={wy} />;
      break;
    case "armchair":
      inner = <ArmchairShape item={item} wx={wx} wy={wy} />;
      break;
    case "table":
      inner = <TableShape item={item} wx={wx} wy={wy} />;
      break;
    case "chair":
      inner = <ChairShape item={item} wx={wx} wy={wy} />;
      break;
    case "fridge":
      inner = <FridgeShape item={item} wx={wx} wy={wy} />;
      break;
    case "stove":
      inner = <StoveShape item={item} wx={wx} wy={wy} />;
      break;
    case "oven":
      inner = <OvenShape item={item} wx={wx} wy={wy} />;
      break;
    case "sink":
      inner = <SinkShape item={item} wx={wx} wy={wy} />;
      break;
    case "toilet":
      inner = <ToiletShape item={item} wx={wx} wy={wy} />;
      break;
    case "bathtub":
      inner = <BathtubShape item={item} wx={wx} wy={wy} />;
      break;
    case "shower":
      inner = <ShowerShape item={item} wx={wx} wy={wy} />;
      break;
    case "wardrobe":
      inner = <WardrobeShape item={item} wx={wx} wy={wy} />;
      break;
    case "tv":
      inner = <TVShape item={item} wx={wx} wy={wy} />;
      break;
    case "desk":
      inner = <DeskShape item={item} wx={wx} wy={wy} />;
      break;
    case "shelf":
      inner = <ShelfShape item={item} wx={wx} wy={wy} />;
      break;
    case "kitchen-cabinet":
      inner = <KitchenCabinetShape item={item} wx={wx} wy={wy} />;
      break;
    case "washer":
      inner = <WasherShape item={item} wx={wx} wy={wy} />;
      break;
    case "dishwasher":
      inner = <DishwasherShape item={item} wx={wx} wy={wy} />;
      break;
    case "plant":
      inner = <PlantShape item={item} wx={wx} wy={wy} />;
      break;
    case "rug":
      inner = <RugShape item={item} wx={wx} wy={wy} />;
      break;
    default:
      inner = <DefaultShape item={item} wx={wx} wy={wy} />;
  }

  return (
    <g
      onClick={onClick}
      style={{ cursor: onClick ? "pointer" : "default" }}
    >
      {inner}
    </g>
  );
}
