import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Mail, Phone } from "lucide-react";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Адміністратор",
  MANAGER: "Менеджер",
  CLIENT: "Клієнт",
};

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Профіль</h1>

      <Card className="p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl font-bold">
            {session.user.name?.charAt(0) || "U"}
          </div>
          <div>
            <h2 className="text-lg font-semibold">{session.user.name}</h2>
            <Badge variant="secondary">{ROLE_LABELS[session.user.role] || session.user.role}</Badge>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span>{session.user.email}</span>
          </div>
          {session.user.phone && (
            <div className="flex items-center gap-3 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{session.user.phone}</span>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
