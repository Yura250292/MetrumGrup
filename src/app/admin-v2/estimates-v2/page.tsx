import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function EstimatesV2Redirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string") params.set(k, v);
    else if (Array.isArray(v) && typeof v[0] === "string") params.set(k, v[0]);
  }
  const qs = params.toString();
  redirect(qs ? `/admin-v2/estimates?${qs}` : "/admin-v2/estimates");
}
