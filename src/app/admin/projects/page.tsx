import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ProjectsList } from "@/components/projects/ProjectsList";

export const dynamic = "force-dynamic";

export default function AdminProjectsPage() {
  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Проєкти</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Картки з активністю команди, чатами і коментарями
          </p>
        </div>
        <Link href="/admin/projects/new" className="w-full md:w-auto">
          <Button className="w-full md:w-auto">
            <Plus className="h-4 w-4" />
            Новий проєкт
          </Button>
        </Link>
      </div>

      <ProjectsList />
    </div>
  );
}
