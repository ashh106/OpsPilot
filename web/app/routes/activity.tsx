import { ComingSoon } from "@/components/coming-soon";

export function meta() {
  return [{ title: "Activity logs · OpsPilot" }];
}

export default function ActivityRoute() {
  return (
    <ComingSoon
      title="Activity logs"
      description="A history of changes and assistant actions with who made them and their outcome. Audit logging is not connected yet."
    />
  );
}
