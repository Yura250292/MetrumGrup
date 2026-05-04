import type { ProjectStage, StageStatus, StageKind } from "@prisma/client";

export type StageNode = {
  id: string;
  kind: StageKind;
  stage: ProjectStage | null;
  customName: string | null;
  isHidden: boolean;
  status: StageStatus;
  progress: number;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
  parentStageId: string | null;
  unit: string | null;
  factUnit: string | null;
  planVolume: number | null;
  factVolume: number | null;
  planUnitPrice: number | null;
  factUnitPrice: number | null;
  planClientUnitPrice: number | null;
  factClientUnitPrice: number | null;
  allocatedBudget: number | null;
  notes: string | null;
  responsibleUserId: string | null;
  responsibleName: string | null;
  planExpense: number;
  factExpense: number;
  planIncome: number;
  factIncome: number;
};

export type ProjectOverview = {
  id: string;
  title: string;
  slug: string;
  status: string;
  managerId: string | null;
  managerName: string | null;
  clientName: string | null;
  progress: number;
  planExpense: number;
  factExpense: number;
  planIncome: number;
  factIncome: number;
  stages: StageNode[];
};

export type MaterialRow = {
  id: string;
  name: string;
  sku: string | null;
  itemType: string | null;
  supplier: string | null;
  unit: string;
  planQty: number;
  factQty: number | null;
  planPrice: number;
  factPrice: number;
  planSum: number;
  factSum: number;
  deviation: number;
  status: string;
};

export type ToggleState = {
  hideCompleted: boolean;
  hideFinance: boolean;
  hideDates: boolean;
};
