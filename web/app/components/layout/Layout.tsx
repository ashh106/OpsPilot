import { HeaderActionsProvider } from "@agent-native/toolkit/app-shell";
import { AgentSidebar } from "@agent-native/toolkit/app/chat";

import { TAB_ID } from "@/lib/tab-id";

import { AppShell } from "./AppShell";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <HeaderActionsProvider>
      <AgentSidebar
        position="right"
        storageKey="opspilot-agent"
        browserTabId={TAB_ID}
        emptyStateText="Ask OpsPilot to check the schedule, find a customer, or book an appointment."
      >
        <AppShell>{children}</AppShell>
      </AgentSidebar>
    </HeaderActionsProvider>
  );
}
