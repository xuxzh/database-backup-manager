import type { DashboardStats } from "@/types/api";
import { apiRequest } from "./http";

export async function fetchDashboard(token: string): Promise<DashboardStats> {
  return apiRequest<DashboardStats>("/dashboard", { token });
}