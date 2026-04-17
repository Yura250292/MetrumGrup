import type { FurnitureItem } from "./types";

const POSITION_LABELS: Record<string, string> = {
  "top-left": "in the top-left area",
  "top-center": "at the top center",
  "top-right": "in the top-right area",
  "center-left": "on the left side",
  "center": "in the center",
  "center-right": "on the right side",
  "bottom-left": "in the bottom-left area",
  "bottom-center": "at the bottom center",
  "bottom-right": "in the bottom-right area",
};

function getPositionLabel(x: number, y: number): string {
  const col = x < 33 ? "left" : x < 66 ? "center" : "right";
  const row = y < 33 ? "top" : y < 66 ? "center" : "bottom";
  const key = row === "center" && col === "center" ? "center" : `${row}-${col}`;
  return POSITION_LABELS[key] ?? "in the room";
}

function getRotationLabel(rotation: number): string {
  if (rotation === 90) return ", rotated 90 degrees";
  if (rotation === 180) return ", facing down";
  if (rotation === 270) return ", rotated 270 degrees";
  return "";
}

export function serializeFurnitureLayout(items: FurnitureItem[]): string {
  if (items.length === 0) return "";

  const descriptions = items.map((item) => {
    const pos = getPositionLabel(item.x + item.width / 2, item.y + item.height / 2);
    const rot = getRotationLabel(item.rotation);
    return `${item.label} placed ${pos}${rot}`;
  });

  return (
    "IMPORTANT furniture placement instructions — place each item exactly as described: " +
    descriptions.join("; ") +
    ". Keep walls, doors, and windows in their original positions. Only rearrange the furniture as specified above."
  );
}
