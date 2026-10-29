"use client";

import React, { useEffect, useState, useCallback } from "react";
import {
  IconCalendarEvent,
  IconPlus,
  IconClock,
  IconUser,
  IconPhone,
  IconX,
  IconCalendarTime,
  IconFilter,
} from "@tabler/icons-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api/client";
import {
  Appointment,
  AppointmentStatus,
  Service,
  AvailableSlot,
  AvailabilityResult,
} from "@/lib/api/types";
import { PageHeader } from "@/app/components/page-header";
import { EmptyState } from "@/app/components/empty-state";

export default function AppointmentsPage() {
  const { activeBusiness } = useAuth();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [dateFilter, setDateFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Booking modal state
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState<AvailableSlot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [submittingBooking, setSubmittingBooking] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);

  // Reschedule state
  const [rescheduleModalOpen, setRescheduleModalOpen] = useState(false);
  const [reschedulingAppointment, setReschedulingAppointment] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState("");
  const [rescheduleSlots, setRescheduleSlots] = useState<AvailableSlot[]>([]);
  const [rescheduleSlotsLoading, setRescheduleSlotsLoading] = useState(false);
  const [selectedRescheduleSlot, setSelectedRescheduleSlot] = useState<AvailableSlot | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);

  // Cancel state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancellingAppointment, setCancellingAppointment] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState(false);

  // Fetch appointments
  const fetchAppointments = useCallback(async () => {
    if (!activeBusiness) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.set("date", dateFilter);
      if (statusFilter !== "ALL") params.set("status", statusFilter);

      const qs = params.toString() ? `?${params.toString()}` : "";
      const res = await apiRequest<{ appointments: Appointment[] }>(
        `/businesses/${activeBusiness.id}/appointments${qs}`,
      );
      setAppointments(res.appointments);
    } catch {
      setAppointments([]);
    } finally {
      setLoading(false);
    }
  }, [activeBusiness, dateFilter, statusFilter]);

  // Fetch services for booking
  const fetchServices = useCallback(async () => {
    if (!activeBusiness) return;
    try {
      const res = await apiRequest<{ services: Service[] }>(`/businesses/${activeBusiness.id}/services`);
      setServices(res.services);
      if (res.services.length > 0 && !selectedServiceId && res.services[0]) {
        setSelectedServiceId(res.services[0].id);
      }
    } catch {
      setServices([]);
    }
  }, [activeBusiness, selectedServiceId]);

  useEffect(() => {
    void fetchAppointments();
    void fetchServices();
  }, [fetchAppointments, fetchServices]);

  // Fetch available slots when service or date changes in booking modal
  useEffect(() => {
    if (!bookingModalOpen || !activeBusiness || !selectedServiceId || !bookingDate) return;
    let active = true;

    async function loadSlots() {
      setSlotsLoading(true);
      setBookingError(null);
      setSelectedSlot(null);
      try {
        const res = await apiRequest<AvailabilityResult>(
          `/businesses/${activeBusiness?.id}/appointments/availability?serviceId=${selectedServiceId}&date=${bookingDate}`,
        );
        if (active) {
          if (res.closed) {
            setBookingError(res.message ?? "Business is closed on this day.");
            setAvailableSlots([]);
          } else if (res.slots.length === 0) {
            setBookingError(res.message ?? "No available slots remaining for this date.");
            setAvailableSlots([]);
          } else {
            setAvailableSlots(res.slots);
          }
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : "Failed to load availability";
          setBookingError(msg);
          setAvailableSlots([]);
        }
      } finally {
        if (active) setSlotsLoading(false);
      }
    }

    void loadSlots();
    return () => {
      active = false;
    };
  }, [bookingModalOpen, activeBusiness, selectedServiceId, bookingDate]);

  // Fetch available slots for reschedule modal
  useEffect(() => {
    if (!rescheduleModalOpen || !activeBusiness || !reschedulingAppointment || !rescheduleDate) return;
    let active = true;

    async function loadRescheduleSlots() {
      setRescheduleSlotsLoading(true);
      setRescheduleError(null);
      setSelectedRescheduleSlot(null);
      try {
        const res = await apiRequest<AvailabilityResult>(
          `/businesses/${activeBusiness?.id}/appointments/availability?serviceId=${reschedulingAppointment?.serviceId}&date=${rescheduleDate}`,
        );
        if (active) {
          if (res.closed || res.slots.length === 0) {
            setRescheduleError(res.message ?? "No slots available on this date.");
            setRescheduleSlots([]);
          } else {
            setRescheduleSlots(res.slots);
          }
        }
      } catch (err: unknown) {
        if (active) {
          const msg = err instanceof Error ? err.message : "Failed to load availability";
          setRescheduleError(msg);
          setRescheduleSlots([]);
        }
      } finally {
        if (active) setRescheduleSlotsLoading(false);
      }
    }

    void loadRescheduleSlots();
    return () => {
      active = false;
    };
  }, [rescheduleModalOpen, activeBusiness, reschedulingAppointment, rescheduleDate]);

  // Submit booking
  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeBusiness || !selectedSlot) {
      setBookingError("Please select an available time slot");
      return;
    }

    setSubmittingBooking(true);
    setBookingError(null);

    try {
      await apiRequest(`/businesses/${activeBusiness.id}/appointments`, {
        method: "POST",
        body: {
          serviceId: selectedServiceId,
          startTime: selectedSlot.startTime,
          customer: {
            name: customerName,
            phone: customerPhone || undefined,
            email: customerEmail || undefined,
          },
        },
      });

      await fetchAppointments();
      setBookingModalOpen(false);
      setCustomerName("");
      setCustomerPhone("");
      setCustomerEmail("");
      setSelectedSlot(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to book appointment";
      setBookingError(msg);
    } finally {
      setSubmittingBooking(false);
    }
  };

  // Submit reschedule
  const handleReschedule = async () => {
    if (!activeBusiness || !reschedulingAppointment || !selectedRescheduleSlot) return;
    setRescheduling(true);
    setRescheduleError(null);

    try {
      await apiRequest(
        `/businesses/${activeBusiness.id}/appointments/${reschedulingAppointment.id}`,
        {
          method: "PATCH",
          body: {
            newStartTime: selectedRescheduleSlot.startTime,
          },
        },
      );

      await fetchAppointments();
      setRescheduleModalOpen(false);
      setReschedulingAppointment(null);
      setSelectedRescheduleSlot(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to reschedule appointment";
      setRescheduleError(msg);
    } finally {
      setRescheduling(false);
    }
  };

  // Submit cancellation
  const handleCancel = async () => {
    if (!activeBusiness || !cancellingAppointment) return;
    setCancelling(true);

    try {
      await apiRequest(
        `/businesses/${activeBusiness.id}/appointments/${cancellingAppointment.id}/cancel`,
        {
          method: "POST",
        },
      );

      await fetchAppointments();
      setCancelModalOpen(false);
      setCancellingAppointment(null);
    } catch {
      // Refresh to keep client state synchronized
      void fetchAppointments();
    } finally {
      setCancelling(false);
    }
  };

  const formatLocalTime = (isoString: string) => {
    if (!activeBusiness) return isoString;
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: activeBusiness.timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(new Date(isoString));
    } catch {
      return new Date(isoString).toLocaleString();
    }
  };

  return (
    <AppShell>
      <PageHeader
        title="Appointments"
        description={`Manage bookings and schedules in business timezone (${activeBusiness?.timezone ?? "UTC"}).`}
        actions={
          <button
            onClick={() => {
              setBookingDate(new Date().toISOString().split("T")[0] ?? "");
              setBookingModalOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 transition"
          >
            <IconPlus className="size-4" />
            New Appointment
          </button>
        }
      />

      {/* Filter Bar */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]">
          <IconFilter className="size-4 text-[var(--accent)]" />
          <span>Filter:</span>
        </div>

        <input
          type="date"
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs text-[var(--foreground)]"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs text-[var(--foreground)]"
        >
          <option value="ALL">All Statuses</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="COMPLETED">Completed</option>
        </select>

        {(dateFilter || statusFilter !== "ALL") && (
          <button
            onClick={() => {
              setDateFilter("");
              setStatusFilter("ALL");
            }}
            className="text-xs text-[var(--muted)] hover:text-[var(--accent)] transition ml-auto"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* List / Empty State */}
      {loading ? (
        <div className="flex justify-center p-12">
          <div className="size-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      ) : appointments.length === 0 ? (
        <EmptyState
          icon={IconCalendarEvent}
          title="No appointments found"
          description="Schedule a new appointment or adjust your active filters."
          action={
            <button
              onClick={() => {
                setBookingDate(new Date().toISOString().split("T")[0] ?? "");
                setBookingModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)]"
            >
              <IconPlus className="size-4" /> Book First Appointment
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {appointments.map((appt) => (
            <div
              key={appt.id}
              className={`flex flex-col justify-between rounded-xl border p-5 transition ${
                appt.status === "CONFIRMED"
                  ? "border-[var(--border)] bg-[var(--surface)]"
                  : "border-[var(--border)] bg-[var(--surface)] opacity-60"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                      appt.status === "CONFIRMED"
                        ? "bg-[var(--success)]/10 text-[var(--success)]"
                        : "bg-[var(--danger)]/10 text-[var(--danger)]"
                    }`}
                  >
                    {appt.status}
                  </span>
                  <span className="text-xs font-mono text-[var(--accent)]">
                    {appt.service?.name ?? "Service"}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 text-[var(--foreground)] font-semibold text-sm">
                    <IconClock className="size-4 text-[var(--accent)]" />
                    <span>{formatLocalTime(appt.startTime)}</span>
                  </div>

                  <div className="flex items-center gap-2 text-[var(--muted)]">
                    <IconUser className="size-3.5" />
                    <span className="font-medium text-[var(--foreground)]">
                      {appt.customer?.name ?? "Unnamed Client"}
                    </span>
                  </div>

                  {appt.customer?.phone && (
                    <div className="flex items-center gap-2 text-[var(--muted)]">
                      <IconPhone className="size-3.5" />
                      <span>{appt.customer.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              {appt.status === "CONFIRMED" && (
                <div className="border-t border-[var(--border)] pt-3 mt-4 flex items-center justify-between text-xs">
                  <button
                    onClick={() => {
                      setReschedulingAppointment(appt);
                      setRescheduleDate(new Date(appt.startTime).toISOString().split("T")[0] ?? "");
                      setRescheduleModalOpen(true);
                    }}
                    className="text-[var(--accent)] hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <IconCalendarTime className="size-3.5" /> Reschedule
                  </button>

                  <button
                    onClick={() => {
                      setCancellingAppointment(appt);
                      setCancelModalOpen(true);
                    }}
                    className="text-[var(--danger)] hover:underline font-medium inline-flex items-center gap-1"
                  >
                    <IconX className="size-3.5" /> Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Book Appointment Modal */}
      {bookingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">New Appointment</h2>
            <p className="text-xs text-[var(--muted)] mb-4">
              Select service and date to query verified availability slots.
            </p>

            {bookingError && (
              <div className="mb-4 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/20 p-3 text-xs text-[var(--danger)]">
                {bookingError}
              </div>
            )}

            <form onSubmit={handleCreateBooking} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Select Service</label>
                <select
                  value={selectedServiceId}
                  onChange={(e) => setSelectedServiceId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
                >
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.durationMinutes} mins — {s.currency} {Number(s.price).toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={bookingDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--focus)]"
                />
              </div>

              {/* Slot Picker */}
              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
                  Available Slots ({activeBusiness?.timezone})
                </label>
                {slotsLoading ? (
                  <p className="text-xs text-[var(--muted)] py-2">Checking schedule availability...</p>
                ) : availableSlots.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] py-2 italic">
                    No slots available for this service and date.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1 border border-[var(--border)] rounded-lg">
                    {availableSlots.map((slot) => {
                      const selected = selectedSlot?.startTime === slot.startTime;
                      return (
                        <button
                          key={slot.startTime}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`p-2 rounded text-xs font-mono text-center transition ${
                            selected
                              ? "bg-[var(--accent)] text-[var(--accent-foreground)] font-bold shadow"
                              : "bg-[var(--surface-raised)] text-[var(--foreground)] hover:bg-[var(--border)]"
                          }`}
                        >
                          {slot.localStartTime}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Customer details */}
              <div className="border-t border-[var(--border)] pt-3 space-y-3">
                <p className="text-xs font-medium text-[var(--foreground)]">Customer Details</p>

                <div>
                  <input
                    type="text"
                    required
                    placeholder="Full Name *"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--foreground)]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="tel"
                    placeholder="Phone number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--foreground)]"
                  />
                  <input
                    type="email"
                    placeholder="Email address"
                    value={customerEmail}
                    onChange={(e) => setCustomerEmail(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-xs text-[var(--foreground)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setBookingModalOpen(false)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--muted)] hover:bg-[var(--surface-raised)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingBooking || !selectedSlot}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {submittingBooking ? "Booking..." : "Confirm Booking"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reschedule Modal */}
      {rescheduleModalOpen && reschedulingAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <h2 className="text-lg font-semibold text-[var(--foreground)] mb-1">Reschedule Appointment</h2>
            <p className="text-xs text-[var(--muted)] mb-4">
              Select a new date and time for {reschedulingAppointment.customer?.name} (
              {reschedulingAppointment.service?.name}).
            </p>

            {rescheduleError && (
              <div className="mb-4 rounded-lg bg-[var(--danger)]/10 border border-[var(--danger)]/20 p-3 text-xs text-[var(--danger)]">
                {rescheduleError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1">Target Date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--foreground)]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--foreground)] mb-1.5">
                  Available Slots
                </label>
                {rescheduleSlotsLoading ? (
                  <p className="text-xs text-[var(--muted)] py-2">Checking availability...</p>
                ) : rescheduleSlots.length === 0 ? (
                  <p className="text-xs text-[var(--muted)] py-2 italic">No open slots on this date.</p>
                ) : (
                  <div className="grid grid-cols-3 gap-2 max-h-36 overflow-y-auto p-1 border border-[var(--border)] rounded-lg">
                    {rescheduleSlots.map((slot) => {
                      const selected = selectedRescheduleSlot?.startTime === slot.startTime;
                      return (
                        <button
                          key={slot.startTime}
                          type="button"
                          onClick={() => setSelectedRescheduleSlot(slot)}
                          className={`p-2 rounded text-xs font-mono text-center transition ${
                            selected
                              ? "bg-[var(--accent)] text-[var(--accent-foreground)] font-bold shadow"
                              : "bg-[var(--surface-raised)] text-[var(--foreground)] hover:bg-[var(--border)]"
                          }`}
                        >
                          {slot.localStartTime}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setRescheduleModalOpen(false)}
                  className="rounded-lg border border-[var(--border)] px-4 py-2 text-xs font-medium text-[var(--muted)]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => void handleReschedule()}
                  disabled={rescheduling || !selectedRescheduleSlot}
                  className="rounded-lg bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50"
                >
                  {rescheduling ? "Rescheduling..." : "Confirm New Slot"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {cancelModalOpen && cancellingAppointment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-[var(--foreground)] mb-2">Cancel Appointment?</h2>
            <p className="text-xs text-[var(--muted)] mb-4 leading-relaxed">
              Are you sure you want to cancel the appointment for{" "}
              <span className="font-semibold text-[var(--foreground)]">
                {cancellingAppointment.customer?.name}
              </span>
              ? The slot will immediately be released for other bookings.
            </p>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelModalOpen(false)}
                className="rounded-lg border border-[var(--border)] px-3.5 py-1.5 text-xs text-[var(--muted)]"
              >
                Keep Appointment
              </button>
              <button
                type="button"
                onClick={() => void handleCancel()}
                disabled={cancelling}
                className="rounded-lg bg-[var(--danger)] px-3.5 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {cancelling ? "Cancelling..." : "Yes, Cancel Slot"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
