import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatTime, toDateInputValue } from "@/lib/schedule";

export function CreateAppointmentDialog({
  open,
  onOpenChange,
  defaultDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate?: Date;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <AppointmentForm
          defaultDate={defaultDate ?? new Date()}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function AppointmentForm({
  defaultDate,
  onDone,
}: {
  defaultDate: Date;
  onDone: () => void;
}) {
  const { data: customers = [], isLoading: customersLoading } =
    useActionQuery("list-customers");
  const { data: services = [], isLoading: servicesLoading } =
    useActionQuery("list-services");
  const activeServices = services.filter((service) => service.active);

  const [customerId, setCustomerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState(toDateInputValue(defaultDate));
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useActionMutation("create-appointment");

  const selectedService = activeServices.find((service) => service.id === serviceId);
  const startsAt = new Date(`${date}T${time}`);
  const endsAt = selectedService
    ? new Date(startsAt.getTime() + selectedService.durationMinutes * 60_000)
    : null;
  const loading = customersLoading || servicesLoading;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!customerId) next.customer = "Choose a customer.";
    if (!serviceId) next.service = "Choose a service.";
    if (!date || !time || Number.isNaN(startsAt.getTime())) {
      next.time = "Choose a valid date and start time.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    create.mutate(
      {
        customerId,
        serviceId,
        startsAt: startsAt.toISOString(),
        notes: notes.trim() || undefined,
      },
      { onSuccess: onDone },
    );
  }

  const noCustomers = !loading && customers.length === 0;
  const noServices = !loading && activeServices.length === 0;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>New appointment</DialogTitle>
        <DialogDescription>
          The server checks the time against your other appointments before saving.
        </DialogDescription>
      </DialogHeader>

      {noCustomers || noServices ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          {noCustomers
            ? "Add a customer before booking an appointment."
            : "Add an active service before booking an appointment."}
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="appointment-customer">Customer</Label>
        <Select value={customerId} onValueChange={setCustomerId} disabled={noCustomers}>
          <SelectTrigger id="appointment-customer" aria-invalid={errors.customer ? true : undefined}>
            <SelectValue placeholder={loading ? "Loading..." : "Select a customer"} />
          </SelectTrigger>
          <SelectContent>
            {customers.map((customer) => (
              <SelectItem key={customer.id} value={customer.id}>
                {customer.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.customer ? <p className="text-xs text-destructive">{errors.customer}</p> : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="appointment-service">Service</Label>
        <Select value={serviceId} onValueChange={setServiceId} disabled={noServices}>
          <SelectTrigger id="appointment-service" aria-invalid={errors.service ? true : undefined}>
            <SelectValue placeholder={loading ? "Loading..." : "Select a service"} />
          </SelectTrigger>
          <SelectContent>
            {activeServices.map((service) => (
              <SelectItem key={service.id} value={service.id}>
                {service.name} ({service.durationMinutes} min)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.service ? <p className="text-xs text-destructive">{errors.service}</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="appointment-date">Date</Label>
          <Input
            id="appointment-date"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="appointment-time">Start time</Label>
          <Input
            id="appointment-time"
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            aria-invalid={errors.time ? true : undefined}
          />
        </div>
      </div>
      {errors.time ? <p className="text-xs text-destructive">{errors.time}</p> : null}
      {endsAt && !Number.isNaN(endsAt.getTime()) ? (
        <p className="text-xs text-muted-foreground">
          Ends at {formatTime(endsAt.toISOString())}. Times use this device&apos;s timezone.
        </p>
      ) : null}

      <div className="grid gap-1.5">
        <Label htmlFor="appointment-notes">Notes (optional)</Label>
        <Textarea
          id="appointment-notes"
          rows={2}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {create.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionErrorMessage(create.error) ??
            "The appointment could not be saved. Try again."}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending || noCustomers || noServices}>
          {create.isPending ? "Booking..." : "Book appointment"}
        </Button>
      </DialogFooter>
    </form>
  );
}
