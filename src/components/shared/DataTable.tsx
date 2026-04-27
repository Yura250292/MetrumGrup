"use client";

import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, Search } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  hideOnMobile?: boolean;
  render: (item: T) => React.ReactNode;
  sortValue?: (item: T) => string | number;
}

type Density = "comfortable" | "compact";

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  searchFn?: (item: T, query: string) => boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  mobileCardRenderer?: (item: T) => React.ReactNode;
  rowClassName?: (item: T) => string | undefined;
  density?: Density;
  stickyHeader?: boolean;
  rowActions?: (item: T) => ReactNode;
  selectable?: boolean;
  bulkActions?: (selected: T[], clear: () => void) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  data,
  columns,
  searchable = false,
  searchPlaceholder = "Пошук...",
  searchFn,
  emptyMessage = "Немає даних",
  onRowClick,
  mobileCardRenderer,
  rowClassName,
  density = "comfortable",
  stickyHeader = false,
  rowActions,
  selectable = false,
  bulkActions,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    if (!search || !searchFn) return data;
    return data.filter((item) => searchFn(item, search.toLowerCase()));
  }, [data, search, searchFn]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const col = columns.find((c) => c.key === sortKey);
      if (!col) return 0;
      const aVal = col.sortValue ? col.sortValue(a) : String(col.render(a) || "");
      const bVal = col.sortValue ? col.sortValue(b) : String(col.render(b) || "");
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDir === "asc"
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  }, [filtered, sortKey, sortDir, columns]);

  function toggleSort(key: string) {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const cellPad = density === "compact" ? "px-3 py-1.5" : "px-4 py-3";
  const headPad = density === "compact" ? "px-3 py-2" : "px-4 py-3";
  const allChecked = sorted.length > 0 && sorted.every((i) => selected.has(i.id));
  const someChecked = !allChecked && sorted.some((i) => selected.has(i.id));
  const selectedItems = sorted.filter((i) => selected.has(i.id));
  const clearSelection = () => setSelected(new Set());

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAll() {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(sorted.map((i) => i.id)));
  }

  return (
    <div>
      {searchable && (
        <div className="mb-4 relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="w-full rounded-lg border border-border bg-background pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {selectable && selectedItems.length > 0 && bulkActions && (
        <div
          className="mb-3 flex items-center justify-between gap-3 rounded-lg border px-4 py-2"
          style={{
            backgroundColor: "var(--t-accent-soft)",
            borderColor: "var(--t-border)",
          }}
        >
          <span className="text-[13px] font-semibold" style={{ color: "var(--t-text-1)" }}>
            Обрано: {selectedItems.length}
          </span>
          <div className="flex items-center gap-2">
            {bulkActions(selectedItems, clearSelection)}
            <button
              type="button"
              onClick={clearSelection}
              className="text-[12px] underline"
              style={{ color: "var(--t-text-2)" }}
            >
              Скасувати
            </button>
          </div>
        </div>
      )}

      {/* Desktop view - Table */}
      <div className="hidden md:block rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className={cn(stickyHeader && "sticky top-0 z-10")}>
              <tr className="border-b bg-muted/50">
                {selectable && (
                  <th className={cn("w-10", headPad)}>
                    <input
                      type="checkbox"
                      aria-label="Обрати всі"
                      checked={allChecked}
                      ref={(el) => {
                        if (el) el.indeterminate = someChecked;
                      }}
                      onChange={toggleAll}
                    />
                  </th>
                )}
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      headPad,
                      "text-left text-xs font-medium text-muted-foreground",
                      col.sortable && "cursor-pointer select-none hover:text-foreground",
                      col.className,
                    )}
                    onClick={() => col.sortable && toggleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.label}
                      {col.sortable && sortKey === col.key && (
                        sortDir === "asc" ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      )}
                    </div>
                  </th>
                ))}
                {rowActions && <th className={cn("w-12", headPad)} />}
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, idx) => (
                <tr
                  key={item.id}
                  className={cn(
                    "border-b last:border-0 transition-colors",
                    onRowClick && "cursor-pointer hover:bg-muted/50",
                    idx < 20 && "data-table-row-enter",
                    rowClassName?.(item),
                  )}
                  style={
                    idx < 20
                      ? { animationDelay: `${idx * 50}ms` }
                      : undefined
                  }
                  onClick={() => onRowClick?.(item)}
                >
                  {selectable && (
                    <td
                      className={cellPad}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        aria-label="Обрати рядок"
                        checked={selected.has(item.id)}
                        onChange={() => toggleRow(item.id)}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className={cn(cellPad, "text-sm", col.className)}>
                      {col.render(item)}
                    </td>
                  ))}
                  {rowActions && (
                    <td
                      className={cn(cellPad, "text-right")}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {rowActions(item)}
                    </td>
                  )}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length + (selectable ? 1 : 0) + (rowActions ? 1 : 0)}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    {emptyMessage}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile view - Cards */}
      <div className="md:hidden space-y-3">
        {sorted.map((item) => (
          <div
            key={item.id}
            className={cn(
              "bg-card rounded-lg p-4 border border-border",
              onRowClick && "cursor-pointer active:bg-muted/50 transition-colors",
            )}
            onClick={() => onRowClick?.(item)}
          >
            {mobileCardRenderer ? (
              mobileCardRenderer(item)
            ) : (
              <div className="space-y-2">
                {columns
                  .filter((col) => !col.hideOnMobile)
                  .map((col) => (
                    <div key={col.key} className="flex justify-between items-center gap-3">
                      <span className="text-xs text-muted-foreground font-medium">
                        {col.label}:
                      </span>
                      <span className="text-sm font-medium text-right">{col.render(item)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="bg-card rounded-lg p-12 text-center text-sm text-muted-foreground border border-border">
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
}
