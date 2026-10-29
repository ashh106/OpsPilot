import {
  actionErrorMessage,
  useActionMutation,
} from "@agent-native/core/client/hooks";
import { IconCalendarEvent, IconClock, IconScissors, IconUser } from "@tabler/icons-react";
import { useState } from "react";

import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AppointmentListItem } from "@/lib/domain";
import { formatDateTime, formatTime } from "@/lib/schedule";

export function AppointmentDetailDialog({
  appointment,
  onOpenChange,
}: {
  appointment: AppointmentListItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={appointment !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {appointment ? (
          <AppointmentDetail
            key={appointment.id}
            appointment={appointment}
            onDone={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function AppointmentDetail({
  appointment,
  onDone,
}: {
  appointment: AppointmentListItem;
  onDone: () => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const updateStatus = useActionMutation("update-appointment-status");
  const isScheduled = appointment.status === "scheduled";

  function setStatus(status: "completed" | "cancelled") {
    updateStatus.mutate({ id: appointment.id, status }, { onSuccess: onDone });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{appointment.customerName}</DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          <StatusBadge status={appointment.status} />
        </DialogDescription>
      </DialogHeader>

      <dl className="grid gap-3 text-sm">
        <div className="flex items-start gap-3">
          <IconScissors className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <div>
            <dt className="sr-only">Service</dt>
            <dd className="font-medium text-foreground">{appointment.serviceName}</dd>
            <dd className="text-muted-foreground">{appointment.durationMinutes} minutes</dd>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <IconCalendarEvent className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <div>
            <dt className="sr-only">Starts</dt>
            <dd className="font-medium text-foreground">{formatDateTime(appointment.startsAt)}</dd>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <IconClock className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
          <div>
            <dt className="sr-only">Ends</dt>
            <dd className="text-muted-foreground">Ends {formatTime(appointment.endsAt)}</dd>
          </div>
        </div>
        {appointment.notes ? (
          <div className="flex items-start gap-3">
            <IconUser className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
            <dd className="whitespace-pre-wrap text-muted-foreground">{appointment.notes}</dd>
          </div>
        ) : null}
      </dl>

      {updateStatus.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionErrorMessage(updateStatus.error) ?? "The status could not be updated."}
        </p>
      ) : null}

      {confirmingCancel ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-foreground">Cancel this appointment?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The time slot will be released for other bookings.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="destructive"
              size="sm"
              disabled={updateStatus.isPending}
              onClick={() => setStatus("cancelled")}
            >
              {updateStatus.isPending ? "Cancelling..." : "Yes, cancel it"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setConfirmingCancel(false)}>
              Keep appointment
            </Button>
          </div>
        </div>
      ) : (
        <DialogFooter className="gap-2 sm:justify-between">
          {isScheduled ? (
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => setConfirmingCancel(true)}
            >
              Cancel appointment
            </Button>
          ) : (
            <span />
          )}
          {isScheduled ? (
            <Button disabled={updateStatus.isPending} onClick={() => setStatus("completed")}>
              {updateStatus.isPending ? "Saving..." : "Mark completed"}
            </Button>
          ) : null}
        </DialogFooter>
      )}
    </>
  );
}
