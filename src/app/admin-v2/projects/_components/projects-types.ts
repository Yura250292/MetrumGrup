import type { ProjectWithAggregations } from "@/lib/projects/aggregations";

export type ProjectExtra = {
  estimatesCount: number;
  hasApprovedEstimate: boolean;
  expectedEndDate: Date | null;
  coverImage: string | null;
};

export type ProjectRow = ProjectWithAggregations & { extra: ProjectExtra };
