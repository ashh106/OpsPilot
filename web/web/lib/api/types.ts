export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface Business {
  id: string;
  slug: string;
  name: string;
  description: string;
  timezone: string;
  cancellationPolicy: string;
  cancellationNoticeHours: number;
  createdAt: string;
  updatedAt: string;
  currentUserRole?: "OWNER";
  services?: Service[];
  hours?: BusinessHours[];
}

export interface Service {
  id: string;
  businessId: string;
  name: string;
  description: string;
  durationMinutes: number;
  price: string | number;
  currency: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessHours {
  id: string;
  businessId: string;
  dayOfWeek: number; // 0 = Sunday ... 6 = Saturday
  openTime: string; // "HH:mm"
  closeTime: string; // "HH:mm"
}

export interface Customer {
  id: string;
  businessId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  createdAt: string;
  _count?: {
    appointments: number;
  };
}

export type AppointmentStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED";

export interface Appointment {
  id: string;
  businessId: string;
  customerId: string;
  serviceId: string;
  startTime: string; // ISO UTC
  endTime: string; // ISO UTC
  status: AppointmentStatus;
  createdAt: string;
  updatedAt: string;
  customer?: Customer;
  service?: Service;
}

export interface AvailableSlot {
  startTime: string;
  endTime: string;
  localStartTime: string;
  localEndTime: string;
}

export interface AvailabilityResult {
  date: string;
  businessId: string;
  serviceId: string;
  serviceName: string;
  durationMinutes: number;
  timezone: string;
  closed: boolean;
  slots: AvailableSlot[];
  message?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}

export interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface Product {
  id: string;
  businessId: string;
  name: string;
  description: string;
  sku?: string | null;
  price: string | number;
  currency: string;
  stockQuantity: number;
  unit: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryAudit {
  id: string;
  businessId: string;
  productId: string;
  changeType: string;
  quantityDelta: number;
  previousQuantity: number;
  newQuantity: number;
  previousPrice?: string | number | null;
  newPrice?: string | number | null;
  performedBy: string;
  reason?: string | null;
  createdAt: string;
  product?: {
    name: string;
    unit: string;
    sku?: string | null;
  };
}

export interface InventorySummary {
  businessId: string;
  totalProducts: number;
  activeProducts: number;
  lowStockProducts: number;
  outOfStockProducts: number;
  totalStockCount: number;
  totalInventoryValue: number;
}
