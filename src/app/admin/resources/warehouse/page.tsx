import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { Warehouse, AlertTriangle, Package } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function WarehousePage() {
  const inventoryItems = await prisma.inventoryItem.findMany({
    include: {
      material: { select: { name: true, sku: true, unit: true, basePrice: true } },
      warehouse: { select: { name: true } },
    },
    orderBy: { material: { name: "asc" } },
  });

  const lowStock = inventoryItems.filter(
    (item) => Number(item.quantity) <= Number(item.minQuantity)
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Складський облік</h1>

      {/* Low stock alerts */}
      {lowStock.length > 0 && (
        <Card className="mb-6 border-orange-200 bg-orange-50 p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-orange-600" />
            <h2 className="font-semibold text-orange-800">
              Потрібна закупівля ({lowStock.length})
            </h2>
          </div>
          <div className="space-y-2">
            {lowStock.map((item) => (
              <div key={item.id} className="flex items-center justify-between text-sm">
                <span className="text-orange-900">
                  {item.material.name} ({item.material.sku})
                </span>
                <Badge variant="warning">
                  {Number(item.quantity)} / {Number(item.minQuantity)} {item.material.unit}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Inventory table */}
      {inventoryItems.length > 0 ? (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Матеріал</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Склад</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Залишок</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Мін.</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">Вартість</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Статус</th>
              </tr>
            </thead>
            <tbody>
              {inventoryItems.map((item) => {
                const isLow = Number(item.quantity) <= Number(item.minQuantity);
                return (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-4 py-3 text-sm">
                      <p className="font-medium">{item.material.name}</p>
                      <p className="text-xs text-muted-foreground">{item.material.sku}</p>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {item.warehouse.name}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {Number(item.quantity)} {item.material.unit}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-muted-foreground">
                      {Number(item.minQuantity)} {item.material.unit}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      {formatCurrency(Number(item.quantity) * Number(item.material.basePrice))}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={isLow ? "warning" : "success"}>
                        {isLow ? "Мало" : "В нормі"}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card className="p-12 text-center">
          <Package className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Склад порожній</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Матеріали з&apos;являться після створення складів та додавання інвентарю.
          </p>
        </Card>
      )}
    </div>
  );
}
