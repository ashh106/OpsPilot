import type { customers, services } from "../../drizzle/schema";

export type Service = typeof services.$inferSelect;
export type Customer = typeof customers.$inferSelect;

export const APPOINTMENT_STATUSES = [
  "scheduled",
  "completed",
  "cancelled",
] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export interface AppointmentListItem {
  id: string;
  customerId: string;
  customerName: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
  status: string;
  notes: string;
  createdAt: string;
}
