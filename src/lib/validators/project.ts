import { z } from "zod";

export const createProjectSchema = z.object({
  title: z.string().min(2, "Мінімум 2 символи"),
  description: z.string().optional(),
  address: z.string().optional(),
  clientId: z.string().min(1, "Оберіть клієнта"),
  managerId: z.string().optional(),
  totalBudget: z.number().min(0).optional(),
  startDate: z.string().optional(),
  expectedEndDate: z.string().optional(),
});

export const updateProjectSchema = createProjectSchema.partial();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
