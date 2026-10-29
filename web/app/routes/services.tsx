import {
  actionErrorMessage,
  useActionMutation,
  useActionQuery,
} from "@agent-native/core/client/hooks";
import { IconClock, IconPencil, IconPlus, IconScissors } from "@tabler/icons-react";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ServiceDialog } from "@/components/services/service-dialog";
import type { Service } from "@/lib/domain";
import { formatPrice } from "@/lib/schedule";
import { cn } from "@/lib/utils";

export function meta() {
  return [{ title: "Services · OpsPilot" }];
}

export default function ServicesRoute() {
  const query = useActionQuery("list-services");
  const [editing, setEditing] = useState<Service | null>(null);
  const [creating, setCreating] = useState(false);
  const services = query.data ?? [];

  return (
    <>
      <PageHeader
        title="Services"
        description="What customers can book, how long it takes, and whether it is currently offered."
        actions={
          <Button onClick={() => setCreating(true)}>
            <IconPlus className="size-4" aria-hidden />
            Add service
          </Button>
        }
      />

      {query.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading services">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : query.error ? (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-foreground">
            {actionErrorMessage(query.error) ?? "Services could not be loaded."}
          </p>
          <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
            Try again
          </Button>
        </div>
      ) : services.length === 0 ? (
        <EmptyState
          icon={IconScissors}
          title="No services yet"
          description="Add the services customers can book, with a duration for each."
          action={
            <Button size="sm" onClick={() => setCreating(true)}>
              <IconPlus className="size-4" aria-hidden />
              Add service
            </Button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Services">
          {services.map((service) => (
            <li key={service.id}>
              <ServiceCard service={service} onEdit={() => setEditing(service)} />
            </li>
          ))}
        </ul>
      )}

      <ServiceDialog open={creating} onOpenChange={setCreating} />
      <ServiceDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        service={editing ?? undefined}
      />
    </>
  );
}

function ServiceCard({ service, onEdit }: { service: Service; onEdit: () => void }) {
  const toggle = useActionMutation("update-service");

  return (
    <article
      className={cn(
        "flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm",
        !service.active && "opacity-75",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{service.name}</h3>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            <IconClock className="size-3.5" aria-hidden />
            {service.durationMinutes} min
            <span aria-hidden>·</span>
            {formatPrice(service.priceCents)}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            service.active
              ? "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]"
              : "bg-muted text-muted-foreground",
          )}
        >
          {service.active ? "Active" : "Paused"}
        </span>
      </div>

      {service.description ? (
        <p className="text-sm text-muted-foreground">{service.description}</p>
      ) : null}

      {toggle.isError ? (
        <p role="alert" className="text-xs text-destructive">
          {actionErrorMessage(toggle.error) ?? "The service could not be updated."}
        </p>
      ) : null}

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button variant="outline" size="sm" onClick={onEdit}>
          <IconPencil className="size-3.5" aria-hidden />
          Edit
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={toggle.isPending}
          onClick={() => toggle.mutate({ id: service.id, active: !service.active })}
        >
          {service.active ? "Pause booking" : "Resume booking"}
        </Button>
      </div>
    </article>
  );
}
