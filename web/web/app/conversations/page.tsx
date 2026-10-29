"use client";

import React from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { PageHeader } from "@/app/components/page-header";
import { ComingSoon } from "@/app/components/coming-soon";

export default function ConversationsPage() {
  return (
    <AppShell>
      <PageHeader
        title="AI Conversations"
        description="Inspect customer chat logs, agent tool calls, and automated responses."
      />
      <ComingSoon
        title="AI Chat Session Inspector"
        milestone="Milestone 3 & 4"
        description="Review inbound customer transcripts and see how the AI agent translates natural language inquiries into structured tool calls."
        requiredBackendContract="GET /api/businesses/:id/conversations"
      />
    </AppShell>
  );
}
