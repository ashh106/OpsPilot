import React from "react";
import { IconClock } from "@tabler/icons-react";

interface ComingSoonProps {
  title: string;
  milestone: string;
  description: string;
  requiredBackendContract: string;
}

export function ComingSoon({
  title,
  milestone,
  description,
  requiredBackendContract,
}: ComingSoonProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-12 text-center max-w-2xl mx-auto my-8">
      <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-[var(--surface-raised)] text-[var(--accent)]">
        <IconClock className="size-6" />
      </div>
      <div className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent)]/10 px-3 py-1 text-xs font-medium text-[var(--accent)] mb-3">
        Scheduled for {milestone}
      </div>
      <h2 className="text-xl font-semibold text-[var(--foreground)]">{title}</h2>
      <p className="mt-2 text-sm text-[var(--muted)] leading-relaxed">{description}</p>

      <div className="mt-6 w-full rounded-lg border border-[var(--border)] bg-[var(--surface-raised)] p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-1">
          Backend API Contract Requirement
        </p>
        <code className="text-xs font-mono text-[var(--accent)]">{requiredBackendContract}</code>
        <p className="mt-2 text-xs text-[var(--muted)]">
          In alignment with our engineering rules, no mock data is shown. Real records will appear once the Express service is verified.
        </p>
      </div>
    </div>
  );
}
