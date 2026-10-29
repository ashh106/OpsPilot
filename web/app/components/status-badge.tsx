import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  APPOINTMENT_STATUS_LABEL,
  type AppointmentStatus,
} from "@/lib/domain";

const STATUS_CLASS: Record<AppointmentStatus, string> = {
  scheduled: "bg-accent text-accent-foreground",
  completed: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
  cancelled: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status }: { status: string }) {
  const known = status in APPOINTMENT_STATUS_LABEL;
  const key = status as AppointmentStatus;
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-transparent font-medium",
        known ? STATUS_CLASS[key] : "bg-muted text-muted-foreground",
      )}
    >
      {known ? APPOINTMENT_STATUS_LABEL[key] : status}
    </Badge>
  );
}
