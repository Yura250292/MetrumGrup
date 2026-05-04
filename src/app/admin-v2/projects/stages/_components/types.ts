import type { StageRow } from "../../[id]/_components/stage-table";

export type ProjectBundle = {
  id: string;
  title: string;
  slug: string;
  status: string;
  managerName: string | null;
  clientName: string | null;
  isTestProject: boolean;
  progress: number;
  planExpense: number;
  factExpense: number;
  planIncome: number;
  factIncome: number;
  stages: StageRow[];
};
