import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Settings } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const settings = await prisma.setting.findMany();
  const settingsMap = Object.fromEntries(
    settings.map((s) => [s.id, typeof s.value === "string" ? s.value : JSON.stringify(s.value)])
  );

  return (
    <div className="max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">Налаштування</h1>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-primary/10 p-2">
            <Settings className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="font-semibold">Дані компанії</h2>
            <p className="text-xs text-muted-foreground">Базові налаштування системи</p>
          </div>
        </div>

        <div className="space-y-4">
          {[
            { key: "company_name", label: "Назва компанії" },
            { key: "company_phone", label: "Телефон" },
            { key: "company_email", label: "Email" },
            { key: "overhead_rate", label: "Ставка накладних витрат (%)" },
          ].map((field) => (
            <div key={field.key}>
              <label className="mb-1.5 block text-sm font-medium">{field.label}</label>
              <input
                defaultValue={settingsMap[field.key]?.replace(/"/g, "") || ""}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                readOnly
              />
            </div>
          ))}
        </div>

        <p className="mt-6 text-xs text-muted-foreground">
          Редагування налаштувань буде доступно у наступній версії.
        </p>
      </Card>
    </div>
  );
}
