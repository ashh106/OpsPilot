"use client";

import React from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { PageHeader } from "@/app/components/page-header";
import { ComingSoon } from "@/app/components/coming-soon";

export default function KnowledgeBasePage() {
  return (
    <AppShell>
      <PageHeader
        title="Knowledge Base"
        description="Upload clinic FAQs, practitioner bios, and business policy documents for AI retrieval."
      />
      <ComingSoon
        title="RAG & Business Policy Retrieval"
        milestone="Milestone 6"
        description="Enables vector similarity search over business documentation so the AI agent can answer clinic-specific questions with zero hallucination."
        requiredBackendContract="POST /api/businesses/:id/documents & GET /api/businesses/:id/documents"
      />
    </AppShell>
  );
}
