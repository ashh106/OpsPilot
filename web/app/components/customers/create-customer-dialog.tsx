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

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CreateCustomerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <CustomerForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const create = useActionMutation("create-customer");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    const emailInvalid = trimmedEmail !== "" && !EMAIL_PATTERN.test(trimmedEmail);
    setNameError(trimmedName ? null : "Enter the customer's name.");
    setEmailError(emailInvalid ? "Enter a valid email address." : null);
    if (!trimmedName || emailInvalid) return;

    create.mutate(
      {
        name: trimmedName,
        email: trimmedEmail || null,
        phone: phone.trim() || null,
        notes: notes.trim(),
      },
      { onSuccess: onDone },
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Add customer</DialogTitle>
        <DialogDescription>
          Customers can be booked into appointments once they are saved.
        </DialogDescription>
      </DialogHeader>

      <div className="grid gap-1.5">
        <Label htmlFor="customer-name">Name</Label>
        <Input
          id="customer-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? "customer-name-error" : undefined}
          autoFocus
        />
        {nameError ? (
          <p id="customer-name-error" className="text-xs text-destructive">
            {nameError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="customer-email">Email (optional)</Label>
        <Input
          id="customer-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          aria-invalid={emailError ? true : undefined}
          aria-describedby={emailError ? "customer-email-error" : undefined}
        />
        {emailError ? (
          <p id="customer-email-error" className="text-xs text-destructive">
            {emailError}
          </p>
        ) : null}
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="customer-phone">Phone (optional)</Label>
        <Input
          id="customer-phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="customer-notes">Notes (optional)</Label>
        <Textarea
          id="customer-notes"
          rows={3}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>

      {create.isError ? (
        <p role="alert" className="text-sm text-destructive">
          {actionErrorMessage(create.error) ?? "The customer could not be saved. Try again."}
        </p>
      ) : null}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? "Saving..." : "Save customer"}
        </Button>
      </DialogFooter>
    </form>
  );
}
