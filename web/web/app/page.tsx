"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  IconScissors,
  IconClock,
  IconCalendarEvent,
  IconRobot,
  IconPlus,
  IconCheck,
  IconArrowRight,
  IconBuildingStore,
} from "@tabler/icons-react";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/lib/auth-context";
import { apiRequest } from "@/lib/api/client";
import { Service, BusinessHours } from "@/lib/api/types";
import { PageHeader } from "./components/page-header";

export default function DashboardPage() {
  const { user, loading, activeBusiness, businesses } = useAuth();
  const router = useRouter();

  const [services, setServices] = useState<Service[]>([]);
  const [hours, setHours] = useState<BusinessHours[]>([]);
  const [appointmentsCount, setAppointmentsCount] = useState<number>(0);
  const [dataLoading, setDataLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!activeBusiness) return;
    let active = true;

    async function loadData() {
      setDataLoading(true);
      try {
        const [servicesRes, hoursRes, apptsRes] = await Promise.all([
          apiRequest<{ services: Service[] }>(`/businesses/${activeBusiness?.id}/services`),
          apiRequest<{ hours: BusinessHours[] }>(`/businesses/${activeBusiness?.id}/hours`),
          apiRequest<{ appointments: { status: string }[] }>(`/businesses/${activeBusiness?.id}/appointments`),
        ]);
        if (active) {
          setServices(servicesRes.services);
          setHours(hoursRes.hours);
          setAppointmentsCount(apptsRes.appointments.filter((a) => a.status === "CONFIRMED").length);
        }
      } catch {
        if (active) {
          setServices([]);
          setHours([]);
          setAppointmentsCount(0);
        }
      } finally {
        if (active) setDataLoading(false);
      }
    }

    void loadData();
    return () => {
      active = false;
    };
  }, [activeBusiness]);

  if (loading || (!user && !loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-3">
          <div className="size-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <p className="text-xs text-[var(--muted)]">Connecting to OpsPilot...</p>
        </div>
      </div>
    );
  }

  if (businesses.length === 0) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-12 text-center max-w-xl mx-auto my-12">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--surface-raised)] text-[var(--accent)] mb-4">
            <IconBuildingStore className="size-7" />
          </div>
          <h2 className="text-xl font-bold text-[var(--foreground)]">Welcome, {user?.name}!</h2>
          <p className="text-sm text-[var(--muted)] mt-2 mb-6">
            You don&apos;t have any active business profiles yet. Create your first business to configure services and operating hours.
          </p>
          <p className="text-xs text-[var(--accent)] font-medium">
            Use the &ldquo;+&rdquo; button in the left sidebar under Active Business to create one.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Overview"
        description={`Operations snapshot for ${activeBusiness?.name} (${activeBusiness?.timezone})`}
      />

      {/* Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between text-[var(--muted)] mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Active Services</span>
            <IconScissors className="size-4 text-[var(--accent)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--foreground)]">
            {dataLoading ? "..." : services.length}
          </div>
          <p className="text-xs text-[var(--muted)] mt-1">Configured in catalog</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between text-[var(--muted)] mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Operating Days</span>
            <IconClock className="size-4 text-[var(--success)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--foreground)]">
            {dataLoading ? "..." : `${hours.length} / 7`}
          </div>
          <p className="text-xs text-[var(--muted)] mt-1">Weekly slots active</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between text-[var(--muted)] mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">Confirmed Bookings</span>
            <IconCalendarEvent className="size-4 text-[var(--accent)]" />
          </div>
          <div className="text-2xl font-bold text-[var(--foreground)]">
            {dataLoading ? "..." : appointmentsCount}
          </div>
          <p className="text-xs text-[var(--muted)] mt-1">Active scheduled slots</p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-5 opacity-90">
          <div className="flex items-center justify-between text-[var(--muted)] mb-3">
            <span className="text-xs font-medium uppercase tracking-wider">AI Assistant</span>
            <span className="text-[10px] rounded bg-[var(--border)] px-1.5 py-0.5 font-mono text-[var(--muted)]">
              Milestone 3
            </span>
          </div>
          <div className="text-2xl font-bold text-[var(--muted)]">—</div>
          <p className="text-xs text-[var(--muted)] mt-1">Tool execution loop in progress</p>
        </div>
      </div>

      {/* Main Grid: Live Services & Quick Schedule */}
      <div className="grid gap-6 lg:grid-cols-2 mb-8">
        {/* Services Card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
              <IconScissors className="size-4.5 text-[var(--accent)]" />
              Service Catalog
            </h2>
            <Link
              href="/services"
              className="text-xs font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1"
            >
              Manage <IconArrowRight className="size-3" />
            </Link>
          </div>

          {services.length === 0 ? (
            <p className="text-xs text-[var(--muted)] py-4">
              No services added yet. Click Manage to add bookable services.
            </p>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {services.slice(0, 4).map((s) => (
                <li key={s.id} className="py-2.5 flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-[var(--foreground)]">{s.name}</span>
                    <span className="text-xs text-[var(--muted)] ml-2">{s.durationMinutes} mins</span>
                  </div>
                  <span className="font-mono text-xs text-[var(--accent)]">
                    {s.currency} {Number(s.price).toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Operating Hours Card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-[var(--foreground)] flex items-center gap-2">
              <IconClock className="size-4.5 text-[var(--success)]" />
              Weekly Operating Hours
            </h2>
            <Link
              href="/working-hours"
              className="text-xs font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1"
            >
              Edit Schedule <IconArrowRight className="size-3" />
            </Link>
          </div>

          {hours.length === 0 ? (
            <p className="text-xs text-[var(--muted)] py-4">
              No weekly hours configured. Click Edit Schedule to set opening times.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, idx) => {
                const slot = hours.find((h) => h.dayOfWeek === idx);
                return (
                  <div
                    key={day}
                    className={`p-2 rounded-lg border ${
                      slot
                        ? "border-[var(--border)] bg-[var(--surface-raised)] text-[var(--foreground)]"
                        : "border-transparent bg-transparent text-[var(--muted)] opacity-60"
                    }`}
                  >
                    <span className="font-semibold mr-1.5">{day}:</span>
                    {slot ? `${slot.openTime} - ${slot.closeTime}` : "Closed"}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Honest Architecture Status Banner */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-raised)] p-6">
        <h3 className="text-sm font-semibold text-[var(--foreground)] mb-2 flex items-center gap-2">
          <IconRobot className="size-4 text-[var(--accent)]" />
          Backend Engineering & Integration Status
        </h3>
        <p className="text-xs text-[var(--muted)] mb-4 leading-relaxed">
          The Next.js frontend communicates with the verified Express + TypeScript backend. In alignment with our strict portfolio rules, no mock appointments or simulated AI confirmations are rendered.
        </p>

        <div className="grid gap-2 sm:grid-cols-2 text-xs">
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <IconCheck className="size-4 text-[var(--success)] shrink-0" />
            <span>Timezone-Aware Slot Availability Engine</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <IconCheck className="size-4 text-[var(--success)] shrink-0" />
            <span>PostgreSQL Exclusion Constraints (Double-Booking Proof)</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <IconCheck className="size-4 text-[var(--success)] shrink-0" />
            <span>Atomic Booking, Rescheduling & Cancellation APIs</span>
          </div>
          <div className="flex items-center gap-2 text-[var(--foreground)]">
            <IconCheck className="size-4 text-[var(--success)] shrink-0" />
            <span>Customer Directory with Visit History Tracking</span>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
