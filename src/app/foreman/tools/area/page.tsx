import { redirect } from "next/navigation";

export default function ForemanAreaToolRedirect(): never {
  redirect("/foreman/tools/estimator");
}
