import { Badge } from "@/components/ui/badge";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_COLORS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_COLORS, ESTIMATE_STATUS_LABELS } from "@/lib/constants";
import { ProjectStatus, PaymentStatus, EstimateStatus } from "@prisma/client";

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge className={PROJECT_STATUS_COLORS[status]}>
      {PROJECT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return (
    <Badge className={PAYMENT_STATUS_COLORS[status]}>
      {PAYMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function EstimateStatusBadge({ status }: { status: EstimateStatus }) {
  const colors: Record<EstimateStatus, string> = {
    DRAFT: "bg-gray-100 text-gray-700",
    SENT: "bg-blue-100 text-blue-700",
    APPROVED: "bg-green-100 text-green-700",
    REJECTED: "bg-red-100 text-red-700",
    REVISION: "bg-yellow-100 text-yellow-700",
    ENGINEER_REVIEW: "bg-purple-100 text-purple-700",
    FINANCE_REVIEW: "bg-orange-100 text-orange-700",
  };
  return (
    <Badge className={colors[status]}>
      {ESTIMATE_STATUS_LABELS[status]}
    </Badge>
  );
}
