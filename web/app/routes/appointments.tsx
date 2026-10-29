import { actionErrorMessage, useActionQuery } from "@agent-native/core/client/hooks";
import {
  IconCalendarEvent,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconSearch,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { AppointmentDetailDialog } from "@/components/appointments/appointment-detail-dialog";
import { CreateAppointmentDialog } from "@/components/appointments/create-appointment-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_LABEL,
  type AppointmentListItem,
  type AppointmentStatus,
} from "@/lib/domain";
import {
  addDays,
  formatDayHeading,
  formatTime,
  viewRange,
  type CalendarView,
} from "@/lib/schedule";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: "Appointments · OpsPilot" }];
}

const ALL_STATUSES = "all";

export default function AppointmentsRoute() {
  const [view, setView] = useState<CalendarView>("day");
  const [anchor, setAnchor] = useState(() => new Date());
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | typeof ALL_STATUSES>(ALL_STATUSES);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AppointmentListItem | null>(null);
  const [creating, setCreating] = useState(false);

  const { from, to } = viewRange(view, anchor);
  const lastDay = addDays(to, -1);
  const rangeLabel =
    view === "day"
      ? formatDayHeading(from)
      : `${formatDayHeading(from)} – ${formatDayHeading(lastDay)}`;

  const query = useActionQuery("list-appointments", {
    from: from.toISOString(),
    to: to.toISOString(),
    status: statusFilter === ALL_STATUSES ? undefined : statusFilter,
  });

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows: AppointmentListItem[] = query.data ?? [];
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.customerName.toLowerCase().includes(needle) ||
        row.serviceName.toLowerCase().includes(needle),
    );
  }, [query.data, search]);

  function shift(direction: -1 | 1) {
    setAnchor((current) => addDays(current, direction * (view === "day" ? 1 : 7)));
  }

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Book, review, and complete customer appointments."
        actions={
          <Button onClick={() => setCreating(true)}>
            <IconPlus className="size-4" aria-hidden />
            New appointment
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label={view === "day" ? "Previous day" : "Previous week"} onClick={() => shift(-1)}>
            <IconChevronLeft className="size-4" aria-hidden />
          </Button>
          <Button variant="outline" onClick={() => setAnchor(new Date())}>
            Today
          </Button>
          <Button variant="outline" size="icon" aria-label={view === "day" ? "Next day" : "Next week"} onClick={() => shift(1)}>
            <IconChevronRight className="size-4" aria-hidden />
          </Button>
          <div
            role="group"
            aria-label="Calendar view"
            className="ml-1 inline-flex rounded-md border border-border p-0.5"
          >
            {(["day", "week"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={view === option}
                onClick={() => setView(option)}
                className={cn(
                  "rounded px-3 py-1 text-sm font-medium capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  view === option
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground lg:text-center">
          {rangeLabel}
        </p>

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              aria-label="Search appointments"
              placeholder="Search customer or service"
              className="pl-8 sm:w-56"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as AppointmentStatus | typeof ALL_STATUSES)}
          >
            <SelectTrigger aria-label="Filter by status" className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>All statuses</SelectItem>
              {APPOINTMENT_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {APPOINTMENT_STATUS_LABEL[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <AppointmentsList
        isLoading={query.isLoading}
        error={query.error}
        rows={visible}
        filtered={search.trim() !== "" || statusFilter !== ALL_STATUSES}
        onRetry={() => void query.refetch()}
        onSelect={setSelected}
        onCreate={() => setCreating(true)}
        view={view}
      />

      <AppointmentDetailDialog
        appointment={selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      />
      <CreateAppointmentDialog
        open={creating}
        onOpenChange={setCreating}
        defaultDate={from}
      />
    </>
  );
}

function AppointmentsList({
  isLoading,
  error,
  rows,
  filtered,
  onRetry,
  onSelect,
  onCreate,
  view,
}: {
  isLoading: boolean;
  error: unknown;
  rows: AppointmentListItem[];
  filtered: boolean;
  onRetry: () => void;
  onSelect: (row: AppointmentListItem) => void;
  onCreate: () => void;
  view: CalendarView;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading appointments">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
        <p className="text-sm text-foreground">
          {actionErrorMessage(error) ?? "Appointments could not be loaded."}
        </p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  if (rows.length === 0) {
    return filtered ? (
      <EmptyState
        icon={IconSearch}
        title="No matching appointments"
        description="Try a different search or status filter."
      />
    ) : (
      <EmptyState
        icon={IconCalendarEvent}
        title={view === "day" ? "No appointments this day" : "No appointments this week"}
        description="Booked appointments appear here as soon as they are saved."
        action={
          <Button size="sm" onClick={onCreate}>
            <IconPlus className="size-4" aria-hidden />
            New appointment
          </Button>
        }
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2" aria-label="Appointments">
      {rows.map((row) => (
        <li key={row.id}>
          <button
            type="button"
            onClick={() => onSelect(row)}
            className="flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-row sm:items-center sm:gap-6"
          >
            <div className="w-full shrink-0 sm:w-40">
              <p className="text-sm font-semibold text-foreground">
                {formatTime(row.startsAt)} – {formatTime(row.endsAt)}
              </p>
              {view === "week" ? (
                <p className="text-xs text-muted-foreground">
                  {new Date(row.startsAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
                </p>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{row.customerName}</p>
              <p className="truncate text-sm text-muted-foreground">
                {row.serviceName} · {row.durationMinutes} min
              </p>
            </div>
            <StatusBadge status={row.status} />
          </button>
        </li>
      ))}
    </ul>
  );
}
