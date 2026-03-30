import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateShort } from "@/lib/utils";
import { Plus, FileText } from "lucide-react";

export const dynamic = 'force-dynamic';

export default async function NewsManagementPage() {
  const articles = await prisma.newsArticle.findMany({
    include: { createdBy: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Новини та акції</h1>
        <Button><Plus className="h-4 w-4" /> Додати</Button>
      </div>

      {articles.length > 0 ? (
        <div className="space-y-2">
          {articles.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{a.title}</h3>
                    <Badge variant={a.status === "PUBLISHED" ? "success" : "secondary"}>
                      {a.status === "PUBLISHED" ? "Опубліковано" : a.status === "ARCHIVED" ? "Архів" : "Чернетка"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {a.createdBy.name} • {formatDateShort(a.createdAt)}
                  </p>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-medium">Немає новин</h3>
        </Card>
      )}
    </div>
  );
}
