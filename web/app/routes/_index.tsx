import {
  actionErrorMessage,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import {
  IconCalendarEvent,
  IconCalendarPlus,
  IconCheck,
  IconScissors,
  IconUserPlus,
} from "@tabler/icons-react";
import { useState } from "react";

import { AppointmentDetailDialog } from "@/components/appointments/appointment-detail-dialog";
import { CreateAppointmentDialog } from "@/components/appointments/create-appointment-dialog";
import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ServiceDialog } from "@/components/services/service-dialog";
import {
  APPOINTMENT_STATUS_LABEL,
  type AppointmentListItem,
  type AppointmentStatus,
} from "@/lib/domain";
import {
  addDays,
  formatDateTime,
  formatShortDate,
  formatTime,
  startOfDay,
} from "@/lib/schedule";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: "Overview · OpsPilot" }];
}

export default function OverviewRoute() {
  const appointmentsQuery = useActionQuery("list-appointments");
  const servicesQuery = useActionQuery("list-services");
  const customersQuery = useActionQuery("list-customers");
  const [selected, setSelected] = useState<AppointmentListItem | null>(null);
  const [booking, setBooking] = useState(false);
  const [addingCustomer, setAddingCustomer] = useState(false);
  const [addingService, setAddingService] = useState(false);

  const appointments = appointmentsQuery.data ?? [];
  const services = servicesQuery.data ?? [];
  const customers = customersQuery.data ?? [];

  const now = new Date();
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const todays = appointments.filter((row) => {
    const start = new Date(row.startsAt);
    return start >= todayStart && start < tomorrowStart;
  });
  const upcoming = appointments
    .filter((row) => row.status === "scheduled" && new Date(row.startsAt) >= now)
    .slice(0, 5);
  const recent = [...appointments]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  const countByStatus = (status: AppointmentStatus) =>
    appointments.filter((row) => row.status === status).length;
  const completedCount = countByStatus("completed");
  const cancelledCount = countByStatus("cancelled");
  const scheduledCount = countByStatus("scheduled");

  const loadError = appointmentsQuery.error ?? servicesQuery.error ?? customersQuery.error;
  const setupIncomplete = services.length === 0 || customers.length === 0 || appointments.length === 0;

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Today is ${now.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}.`}
        actions={
          <Button onClick={() => setBooking(true)}>
            <IconCalendarPlus className="size-4" aria-hidden />
            New appointment
          </Button>
        }
      />

      {loadError ? (
        <div role="alert" className="mb-6 flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-foreground">
            {actionErrorMessage(loadError) ?? "Dashboard data could not be loaded."}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void appointmentsQuery.refetch();
              void servicesQuery.refetch();
              void customersQuery.refetch();
            }}
          >
            Try again
          </Button>
        </div>
      ) : null}

      <section aria-label="Key figures" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Today" value={todays.length} loading={appointmentsQuery.isLoading} />
        <StatCard label="Upcoming" value={scheduledCount} loading={appointmentsQuery.isLoading} hint="Scheduled, all dates" />
        <StatCard label="Completed" value={completedCount} loading={appointmentsQuery.isLoading} hint="All time" />
        <StatCard label="Cancelled" value={cancelledCount} loading={appointmentsQuery.isLoading} hint="All time" />
      </section>

      {!appointmentsQuery.isLoading && appointments.length > 0 ? (
        <StatusDistribution
          counts={{
            scheduled: scheduledCount,
            completed: completedCount,
            cancelled: cancelledCount,
          }}
        />
      ) : null}

      {setupIncomplete && !appointmentsQuery.isLoading ? (
        <SetupChecklist
          servicesCount={services.length}
          customersCount={customers.length}
          appointmentsCount={appointments.length}
          onAddService={() => setAddingService(true)}
          onAddCustomer={() => setAddingCustomer(true)}
          onBook={() => setBooking(true)}
        />
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Today&apos;s schedule</h2>
            <span className="text-xs text-muted-foreground">{todays.length} booked</span>
          </div>
          {appointmentsQuery.isLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : todays.length === 0 ? (
            <EmptyState
              icon={IconCalendarEvent}
              title="Nothing booked today"
              description="Today's appointments will appear here in time order."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {todays.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="flex w-full items-center gap-4 rounded-md px-1 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="w-20 shrink-0 text-sm font-semibold tabular-nums text-foreground">
                      {formatTime(row.startsAt)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{row.customerName}</span>
                      <span className="block truncate text-sm text-muted-foreground">{row.serviceName}</span>
                    </span>
                    <StatusBadge status={row.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Next up</h2>
            <span className="text-xs text-muted-foreground">Scheduled</span>
          </div>
          {appointmentsQuery.isLoading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : upcoming.length === 0 ? (
            <EmptyState
              icon={IconCalendarEvent}
              title="No upcoming appointments"
              description="Scheduled appointments in the future will show here."
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {upcoming.map((row) => (
                <li key={row.id} className="flex items-center gap-4 py-3">
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {formatShortDate(row.startsAt)}
                    <span className="block text-sm font-semibold text-foreground">{formatTime(row.startsAt)}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">{row.customerName}</span>
                    <span className="block truncate text-sm text-muted-foreground">{row.serviceName}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Recent bookings</h2>
            <span className="text-xs text-muted-foreground">Newest first</span>
          </div>
          {appointmentsQuery.isLoading ? (
            <Skeleton className="h-16 w-full rounded-lg" />
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Bookings you create appear here.</p>
          ) : (
            <ul className="grid gap-2 md:grid-cols-2">
              {recent.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{row.customerName}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.serviceName} · {formatDateTime(row.startsAt)}
                      </span>
                    </span>
                    <StatusBadge status={row.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <AppointmentDetailDialog appointment={selected} onOpenChange={(open) => !open && setSelected(null)} />
      <CreateAppointmentDialog open={booking} onOpenChange={setBooking} />
      <CreateCustomerDialog open={addingCustomer} onOpenChange={setAddingCustomer} />
      <ServiceDialog open={addingService} onOpenChange={setAddingService} />
    </>
  );
}

function StatCard({
  label,
  value,
  loading,
  hint,
}: {
  label: string;
  value: number;
  loading: boolean;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="mt-1 h-8 w-16" />
      ) : (
        <span className="text-3xl font-semibold tabular-nums tracking-tight text-foreground">{value}</span>
      )}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </Card>
  );
}

const DISTRIBUTION_CLASS: Record<"scheduled" | "completed" | "cancelled", string> = {
  scheduled: "bg-primary",
  completed: "bg-[hsl(var(--success))]",
  cancelled: "bg-muted-foreground/40",
};

function StatusDistribution({
  counts,
}: {
  counts: Record<"scheduled" | "completed" | "cancelled", number>;
}) {
  const total = counts.scheduled + counts.completed + counts.cancelled;
  const keys = ["scheduled", "completed", "cancelled"] as const;

  return (
    <Card className="mt-3 flex flex-col gap-3 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Status distribution
      </span>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label="Appointment status distribution">
        {keys.map((key) =>
          counts[key] > 0 ? (
            <div
              key={key}
              className={DISTRIBUTION_CLASS[key]}
              style={{ width: `${(counts[key] / total) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted-foreground">
        {keys.map((key) => (
          <li key={key} className="flex items-center gap-2">
            <span className={cn("size-2.5 rounded-full", DISTRIBUTION_CLASS[key])} aria-hidden />
            {APPOINTMENT_STATUS_LABEL[key]}: <span className="font-medium text-foreground">{counts[key]}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function SetupChecklist({
  servicesCount,
  customersCount,
  appointmentsCount,
  onAddService,
  onAddCustomer,
  onBook,
}: {
  servicesCount: number;
  customersCount: number;
  appointmentsCount: number;
  onAddService: () => void;
  onAddCustomer: () => void;
  onBook: () => void;
}) {
  const steps = [
    { done: servicesCount > 0, label: "Add a service", detail: "Set the duration customers book.", icon: IconScissors, action: onAddService },
    { done: customersCount > 0, label: "Add a customer", detail: "Save the people you book.", icon: IconUserPlus, action: onAddCustomer },
    { done: appointmentsCount > 0, label: "Book the first appointment", detail: "Check the time slot before saving.", icon: IconCalendarEvent, action: onBook },
  ];

  return (
    <Card className="mt-3 flex flex-col gap-4 border-primary/20 p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Get set up</h2>
        <p className="text-sm text-muted-foreground">Three steps to start managing bookings in OpsPilot.</p>
      </div>
      <ol className="grid gap-2 md:grid-cols-3">
        {steps.map((step) => {
          const Icon = step.icon;
          return (
            <li key={step.label}>
              <button
                type="button"
                onClick={step.action}
                disabled={step.done}
                className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent/40 disabled:cursor-default disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    step.done ? "bg-[hsl(var(--success)/0.15)] text-[hsl(var(--success))]" : "bg-accent text-accent-foreground",
                  )}
                  aria-hidden
                >
                  {step.done ? <IconCheck className="size-4" /> : <Icon className="size-4" />}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm font-medium", step.done ? "text-muted-foreground line-through" : "text-foreground")}>
                    {step.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{step.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
