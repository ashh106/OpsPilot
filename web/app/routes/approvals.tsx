import { ComingSoon } from "@/components/coming-soon";

export function meta() {
  return [{ title: "Approvals · OpsPilot" }];
}

export default function ApprovalsRoute() {
  return (
    <ComingSoon
      title="Approvals"
      description="Review assistant actions before they run. Approval workflows are not connected yet."
    />
  );
}
