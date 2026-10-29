"use client";

import React from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { PageHeader } from "@/app/components/page-header";
import { ComingSoon } from "@/app/components/coming-soon";

export default function ApprovalsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Approvals"
        description="Review booking requests that exceed automated parameters or require owner sign-off."
      />
      <ComingSoon
        title="Human-in-the-Loop Approvals"
        milestone="Milestone 3"
        description="Enables business owners to review and manually approve appointments that have exceptions or special requests flagged by the AI agent."
        requiredBackendContract="GET /api/businesses/:id/approvals"
      />
    </AppShell>
  );
}
