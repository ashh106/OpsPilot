import { actionErrorMessage, useActionQuery } from "@agent-native/core/client/hooks";
import {
  IconCalendarEvent,
  IconMail,
  IconPhone,
  IconPlus,
  IconSearch,
  IconUsers,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { CreateCustomerDialog } from "@/components/customers/create-customer-dialog";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { Customer } from "@/lib/domain";
import { formatDateTime } from "@/lib/schedule";

export function meta() {
  return [{ title: "Customers · OpsPilot" }];
}

export default function CustomersRoute() {
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const customersQuery = useActionQuery("list-customers");

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const rows = customersQuery.data ?? [];
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        (row.email ?? "").toLowerCase().includes(needle) ||
        (row.phone ?? "").includes(needle),
    );
  }, [customersQuery.data, search]);

  const hasCustomers = (customersQuery.data ?? []).length > 0;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Contact details and booking history for people you serve."
        actions={
          <Button onClick={() => setCreating(true)}>
            <IconPlus className="size-4" aria-hidden />
            Add customer
          </Button>
        }
      />

      {hasCustomers ? (
        <div className="relative mb-4 max-w-sm">
          <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            type="search"
            aria-label="Search customers"
            placeholder="Search name, email, or phone"
            className="pl-8"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      ) : null}

      {customersQuery.isLoading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading customers">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : customersQuery.error ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-foreground">
            {actionErrorMessage(customersQuery.error) ?? "Customers could not be loaded."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void customersQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : !hasCustomers ? (
        <EmptyState
          icon={IconUsers}
          title="No customers yet"
          description="Add a customer, or let them be created when they book through the assistant."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <IconPlus className="size-4" aria-hidden />
              Add customer
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={IconSearch} title="No matching customers" description="Try a different name, email, or phone number." />
      ) : (
        <ul className="flex flex-col gap-2" aria-label="Customers">
          {visible.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => setSelected(customer)}
                className="flex w-full items-center gap-4 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                  {customer.name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">{customer.name}</span>
                  <span className="block truncate text-sm text-muted-foreground">
                    {customer.email ?? customer.phone ?? "No contact details"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <CustomerDetailDialog customer={selected} onOpenChange={(open) => !open && setSelected(null)} />
      <CreateCustomerDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}

function CustomerDetailDialog({
  customer,
  onOpenChange,
}: {
  customer: Customer | null;
  onOpenChange: (open: boolean) => void;
}) {
  const appointmentsQuery = useActionQuery("list-appointments", undefined, {
    enabled: customer !== null,
  });
  const history = (appointmentsQuery.data ?? [])
    .filter((row) => customer !== null && row.customerId === customer.id)
    .reverse();

  return (
    <Dialog open={customer !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {customer ? (
          <>
            <DialogHeader>
              <DialogTitle>{customer.name}</DialogTitle>
              <DialogDescription>Customer since {formatDateTime(customer.createdAt)}</DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-2 text-sm">
              <p className="flex items-center gap-2 text-muted-foreground">
                <IconMail className="size-4" aria-hidden />
                {customer.email ?? "No email on file"}
              </p>
              <p className="flex items-center gap-2 text-muted-foreground">
                <IconPhone className="size-4" aria-hidden />
                {customer.phone ?? "No phone on file"}
              </p>
              {customer.notes ? (
                <p className="whitespace-pre-wrap rounded-md bg-muted px-3 py-2 text-muted-foreground">
                  {customer.notes}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">Appointment history</h3>
              {appointmentsQuery.isLoading ? (
                <Skeleton className="h-12 w-full rounded-md" />
              ) : appointmentsQuery.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {actionErrorMessage(appointmentsQuery.error) ?? "History could not be loaded."}
                </p>
              ) : history.length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconCalendarEvent className="size-4" aria-hidden />
                  No appointments yet.
                </p>
              ) : (
                <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                  {history.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-foreground">{row.serviceName}</span>
                        <span className="block text-muted-foreground">{formatDateTime(row.startsAt)}</span>
                      </span>
                      <StatusBadge status={row.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
