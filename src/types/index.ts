import type { Project, ProjectStageRecord, Payment, PhotoReport, PhotoReportImage, CompletionAct, User, CrewAssignment, Worker, Estimate } from "@prisma/client";

// Extended types with relations
export type ProjectWithStages = Project & {
  stages: ProjectStageRecord[];
  client: Pick<User, "id" | "name" | "email" | "phone">;
  manager: Pick<User, "id" | "name" | "email" | "phone"> | null;
};

export type ProjectWithAll = ProjectWithStages & {
  payments: Payment[];
  photoReports: (PhotoReport & { images: PhotoReportImage[] })[];
  completionActs: CompletionAct[];
};

export type ProjectDashboardData = Project & {
  client: Pick<User, "id" | "name">;
  manager: Pick<User, "id" | "name"> | null;
  crewAssignments: (CrewAssignment & {
    worker: Pick<Worker, "id" | "name" | "specialty">;
  })[];
  estimates: Pick<Estimate, "id" | "number" | "finalAmount" | "status" | "createdAt">[];
  _count: {
    estimates: number;
    crewAssignments: number;
  };
};

export type PhotoReportWithImages = PhotoReport & {
  images: PhotoReportImage[];
  createdBy: Pick<User, "id" | "name">;
};

export type PaymentWithCreator = Payment & {
  createdBy: Pick<User, "id" | "name">;
};

// API response types
export type ApiResponse<T> = {
  data: T;
  message?: string;
};

export type ApiError = {
  error: string;
  message: string;
  statusCode: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

// Dashboard stats
export type ClientDashboardStats = {
  activeProjects: number;
  totalPaid: number;
  totalRemaining: number;
  nextPaymentDate: string | null;
  nextPaymentAmount: number | null;
};
