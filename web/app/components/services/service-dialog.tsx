import { actionErrorMessage, useActionMutation } from "@agent-native/core/client/hooks";
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
import { Textarea } from "@/components/ui/textarea";
import type { Service } from "@/lib/domain";

export function ServiceDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  service?: Service | undefined;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <ServiceForm
          key={service?.id ?? "new"}
          service={service}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function ServiceForm({
  service,
  onDone,
}: {
  service?: Service | undefined;
  onDone: () => void;
}) {
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [duration, setDuration] = useState(
    service ? String(service.durationMinutes) : "30",
  );
  const [price, setPrice] = useState(
    service?.priceCents != null ? (service.priceCents / 100).toFixed(2) : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useActionMutation("create-service");
  const update = useActionMutation("update-service");
  const pending = create.isPending || update.isPending;
  const failure = create.error ?? update.error;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const durationMinutes = Number(duration);
    const priceValue = price.trim();
    const priceCents = priceValue === "" ? null : Math.round(Number(priceValue) * 100);

    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Enter a service name.";
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
      next.duration = "Duration must be a whole number of minutes from 5 to 480.";
    }
    if (priceCents !== null && (!Number.isFinite(priceCents) || priceCents < 0)) {
      next.price = "Enter a price of zero or more.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const values = {
      name: name.trim(),
      description: description.trim(),
      durationMinutes,
      priceCents,
    };
    const options = { onSuccess: onDone };
    if (service) {
      update.mutate({ id: service.id, ...values }, options);
    } else {
      create.mutate(values, options);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>{service ? "Edit service" : "Add service"}</DialogTitle>
        <DialogDescription>
          Customers can only book services that are active.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="service-name">Name</Label>
        <Input
          id="service-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={errors.name ? true : undefined}
          autoFocus
        />
        {errors.name ? <p className="text-xs text-destructive">{errors.name}</p> : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="service-description">Description (optional)</Label>
        <Textarea
          id="service-description"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="service-duration">Duration (minutes)</Label>
          <Input
            id="service-duration"
            type="number"
            inputMode="numeric"
            min={5}
            max={480}
            step={5}
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            aria-invalid={errors.duration ? true : undefined}
          />
          {errors.duration ? (
            <p className="text-xs text-destructive">{errors.duration}</p>
          ) : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="service-price">Price (optional)</Label>
          <Input
            id="service-price"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            aria-invalid={errors.price ? true : undefined}
          />
          {errors.price ? <p className="text-xs text-destructive">{errors.price}</p> : null}
        </div>
      </div>

      {failure ? (
        <p role="alert" className="text-sm text-destructive">
          {actionErrorMessage(failure) ?? "The service could not be saved. Try again."}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving..." : service ? "Save changes" : "Add service"}
        </Button>
      </DialogFooter>
    </form>
  );
}
