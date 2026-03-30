import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCurrency, formatDateShort } from "@/lib/utils";
import { PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS } from "@/lib/constants";
import { Payment } from "@prisma/client";

interface PaymentScheduleTableProps {
  payments: Payment[];
}

export function PaymentScheduleTable({ payments }: PaymentScheduleTableProps) {
  if (payments.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm text-muted-foreground">Графік платежів ще не створено</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      {/* Desktop table */}
      <div className="hidden md:block">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Дата</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Сума</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Метод</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Статус</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">Примітка</th>
            </tr>
          </thead>
          <tbody>
            {payments.map((payment) => (
              <tr key={payment.id} className="border-b last:border-0">
                <td className="px-4 py-3 text-sm">
                  {formatDateShort(payment.scheduledDate)}
                </td>
                <td className="px-4 py-3 text-sm font-medium">
                  {formatCurrency(Number(payment.amount))}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {payment.method === "BANK_TRANSFER" ? "Банк" : payment.method === "CASH" ? "Готівка" : "Картка"}
                </td>
                <td className="px-4 py-3">
                  <Badge className={PAYMENT_STATUS_COLORS[payment.status]}>
                    {PAYMENT_STATUS_LABELS[payment.status]}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground">
                  {payment.notes || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y">
        {payments.map((payment) => (
          <div key={payment.id} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {formatCurrency(Number(payment.amount))}
              </span>
              <Badge className={PAYMENT_STATUS_COLORS[payment.status]}>
                {PAYMENT_STATUS_LABELS[payment.status]}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {formatDateShort(payment.scheduledDate)}
              {payment.paidDate && ` • Сплачено: ${formatDateShort(payment.paidDate)}`}
            </div>
            {payment.notes && (
              <p className="text-xs text-muted-foreground">{payment.notes}</p>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
