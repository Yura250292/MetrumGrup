declare module "frappe-gantt" {
  export type FrappeGanttTask = {
    id: string;
    name: string;
    start: string;
    end: string;
    progress: number;
    dependencies?: string;
    custom_class?: string;
  };

  export type FrappeGanttOptions = {
    view_mode?: "Day" | "Week" | "Month" | "Year";
    language?: string;
    bar_height?: number;
    padding?: number;
    on_click?: (task: FrappeGanttTask) => void;
    on_date_change?: (task: FrappeGanttTask, start: Date, end: Date) => void;
    on_progress_change?: (task: FrappeGanttTask, progress: number) => void;
    on_view_change?: (mode: string) => void;
  };

  export default class Gantt {
    constructor(
      element: HTMLElement | SVGElement | string,
      tasks: FrappeGanttTask[],
      options?: FrappeGanttOptions,
    );
    refresh(tasks: FrappeGanttTask[]): void;
    change_view_mode(mode: "Day" | "Week" | "Month" | "Year"): void;
  }
}
