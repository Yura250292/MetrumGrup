"use client";

import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, Search } from "lucide-react";
import { useState, useMemo } from "react";

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  className?: string;
  hideOnMobile?: boolean;
  render: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  searchFn?: (item: T, query: string) => boolean;
  emptyMessage?: string;
  onRowClick?: (item: T) => void;
  mobileCardRenderer?: (item: T) => React.ReactNode;
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
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = useMemo(() => {
    if (!search || !searchFn) return data;
    return data.filter((item) => searchFn(item, search.toLowerCase()));
  }, [data, search, searchFn]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const col = columns.find((c) => c.key === sortKey);
      if (!col) return 0;
      const aVal = String(col.render(a) || "");
      const bVal = String(col.render(b) || "");
      return sortDir === "asc"
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
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

      {/* Desktop view - Table */}
      <div className="hidden md:block rounded-xl border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-4 py-3 text-left text-xs font-medium text-muted-foreground",
                      col.sortable && "cursor-pointer select-none hover:text-foreground",
                      col.className
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
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => (
                <tr
                  key={item.id}
                  className={cn(
                    "border-b last:border-0 transition-colors",
                    onRowClick && "cursor-pointer hover:bg-muted/50"
                  )}
                  onClick={() => onRowClick?.(item)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={cn("px-4 py-3 text-sm", col.className)}>
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
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
              onRowClick && "cursor-pointer active:bg-muted/50 transition-colors"
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
