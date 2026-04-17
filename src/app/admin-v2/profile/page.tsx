import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { ProfilePageClient } from "./_components/profile-page-client";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <main>
      <ProfilePageClient />
    </main>
  );
}
