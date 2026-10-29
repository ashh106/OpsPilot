"use client";

import React from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { PageHeader } from "@/app/components/page-header";
import { ComingSoon } from "@/app/components/coming-soon";

export default function ActivityPage() {
  return (
    <AppShell>
      <PageHeader
        title="Activity Logs"
        description="Chronological audit trail of owner actions, customer bookings, and AI tool executions."
      />
      <ComingSoon
        title="Audit & Activity Feed"
        milestone="Milestone 4"
        description="Streamlined timeline rendering the ActivityLog and ToolExecution records persisted in PostgreSQL by the backend."
        requiredBackendContract="GET /api/businesses/:id/activity"
      />
    </AppShell>
  );
}
