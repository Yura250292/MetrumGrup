import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Plus, Globe } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function PortfolioManagementPage() {
  const projects = await prisma.portfolioProject.findMany({
    orderBy: { sortOrder: "asc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Портфоліо</h1>
        <Button><Plus className="h-4 w-4" /> Додати проєкт</Button>
      </div>

      {projects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Card key={p.id} className="overflow-hidden">
              <div className="aspect-video bg-muted flex items-center justify-center">
                {p.coverImage ? (
                  <img src={p.coverImage} alt={p.title} className="h-full w-full object-cover" />
                ) : (
                  <Globe className="h-8 w-8 text-muted-foreground" />
                )}
              </div>
              <div className="p-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium truncate">{p.title}</h3>
                  <Badge variant={p.isPublished ? "success" : "secondary"}>
                    {p.isPublished ? "Опубліковано" : "Чернетка"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{p.category}</p>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <Globe className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Немає проєктів у портфоліо</h3>
          <p className="mt-1 text-sm text-muted-foreground">Додайте виконані проєкти для публічного сайту</p>
        </Card>
      )}
    </div>
  );
}
