import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { Bell, Camera, Wallet, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

const typeIcons: Record<string, typeof Bell> = {
  PHOTO_REPORT: Camera,
  PAYMENT_REMINDER: Wallet,
  STAGE_UPDATE: TrendingUp,
};

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const notifications = await prisma.notification.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Mark as read
  await prisma.notification.updateMany({
    where: { userId: session.user.id, isRead: false },
    data: { isRead: true },
  });

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Сповіщення</h1>

      {notifications.length > 0 ? (
        <div className="space-y-2">
          {notifications.map((n) => {
            const Icon = typeIcons[n.type] || Bell;
            return (
              <Card key={n.id} className={cn("p-4", !n.isRead && "border-primary/30 bg-primary/5")}>
                <div className="flex gap-3">
                  <div className="rounded-lg bg-primary/10 p-2 h-fit">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{n.title}</p>
                    {n.body && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                    )}
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {formatDate(n.createdAt)}
                    </p>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-12 text-center">
          <Bell className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Немає сповіщень</h3>
        </div>
      )}
    </div>
  );
}
